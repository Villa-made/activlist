// T19 — hide_contribution RPC (CON-11, SCO-05, DB-07, ADR-003).
// APPROVED rows are seeded with the service-role client; permissions are proven with real
// anon / authenticated clients.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { anonClient, hasDbEnv, MUNICIPALITY_CODE, TestFixtures } from './support.ts';

const ignore = !hasDbEnv();

interface LeaderboardRow { user_id: string; points: number }
interface FeedRow { id: string }

async function withFixtures(fn: (f: TestFixtures) => Promise<void>): Promise<void> {
  const fixtures = new TestFixtures();
  try {
    await fixtures.ensureMunicipality();
    await fn(fixtures);
  } finally {
    await fixtures.cleanup();
  }
}

/** Server clock from the PostgREST `Date` header: the DB decides the cooldown with its own now(),
 * and the test machine clock can be skewed (it is 2 h behind here). */
async function serverNowMs(): Promise<number> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/`, {
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')! },
  });
  await res.body?.cancel();
  const header = res.headers.get('date');
  assert(header, 'PostgREST response has no Date header');
  return new Date(header).getTime();
}

async function seed(
  f: TestFixtures,
  authorId: string,
  actionType: 'RECYCLING' | 'LITTER_COLLECTION',
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const now = new Date(await serverNowMs()).toISOString();
  const { data, error } = await f.db.from('contributions').insert(
    f.contributionRow(authorId, {
      action_type: actionType,
      points_snapshot: actionType === 'RECYCLING' ? 10 : 20,
      status: 'APPROVED',
      submitted_at: now,
      approved_at: now,
      public_photo_path: `public/${authorId}/${crypto.randomUUID()}.jpg`,
      ...overrides,
    }),
  ).select('id').single();
  if (error || !data) throw new Error(`seed failed: ${error?.message}`);
  return data;
}

async function hide(db: SupabaseClient, id: string, author: string) {
  return await db.rpc('hide_contribution', { p_id: id, p_author: author });
}

async function pointsOf(db: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await db.rpc('get_leaderboard', { p_limit: 50, p_offset: 0 });
  if (error) throw new Error(`leaderboard failed: ${error.message}`);
  return ((data ?? []) as LeaderboardRow[]).find((row) => row.user_id === userId)?.points ?? 0;
}

async function inFeed(db: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await db.rpc('get_feed', { p_limit: 50, p_offset: 0, p_viewer: null });
  if (error) throw new Error(`feed failed: ${error.message}`);
  return ((data ?? []) as FeedRow[]).some((row) => row.id === id);
}

async function row(f: TestFixtures, id: string) {
  const { data, error } = await f.db.from('contributions')
    .select('status, hidden_at, submitted_at, points_snapshot, public_photo_path')
    .eq('id', id).single();
  if (error || !data) throw new Error(`row failed: ${error?.message}`);
  return data;
}

Deno.test({
  name: 'hide sets hidden_at once, is idempotent, leaves status/submitted_at/points_snapshot untouched',
  ignore,
  fn: () => withFixtures(async (f) => {
    const author = await f.createUser();
    const recycling = await seed(f, author.id, 'RECYCLING');
    const before = await row(f, recycling.id);
    assertEquals(before.hidden_at, null);

    const first = await hide(f.db, recycling.id, author.id);
    assertEquals(first.error, null);
    assert(typeof first.data === 'string');
    const after = await row(f, recycling.id);
    assertEquals(new Date(after.hidden_at as string).getTime(), new Date(first.data as string).getTime());
    assertEquals(after.status, 'APPROVED');
    assertEquals(after.submitted_at, before.submitted_at);
    assertEquals(after.points_snapshot, 10);
    assertEquals(after.public_photo_path, before.public_photo_path, 'published copy is kept');

    const second = await hide(f.db, recycling.id, author.id);
    assertEquals(second.error, null);
    assertEquals(new Date(second.data as string).getTime(), new Date(first.data as string).getTime());
    assertEquals((await row(f, recycling.id)).hidden_at, after.hidden_at);
  }),
});

Deno.test({
  name: 'hide removes it from the feed and lowers the author points exactly once',
  ignore,
  fn: () => withFixtures(async (f) => {
    const author = await f.createUser();
    const recycling = await seed(f, author.id, 'RECYCLING');
    const litter = await seed(f, author.id, 'LITTER_COLLECTION');
    assertEquals(await pointsOf(f.db, author.id), 30);
    assert(await inFeed(f.db, recycling.id));
    assert(await inFeed(f.db, litter.id));

    assertEquals((await hide(f.db, recycling.id, author.id)).error, null);
    assertEquals(await pointsOf(f.db, author.id), 20);
    assert(!(await inFeed(f.db, recycling.id)));
    assert(await inFeed(f.db, litter.id));

    assertEquals((await hide(f.db, recycling.id, author.id)).error, null);
    assertEquals(await pointsOf(f.db, author.id), 20, 'second hide must not subtract again');

    assertEquals((await hide(f.db, litter.id, author.id)).error, null);
    assertEquals(await pointsOf(f.db, author.id), 0);
  }),
});

Deno.test({
  name: 'hide: non-APPROVED -> INVALID_STATE; other author or unknown id -> NOT_FOUND',
  ignore,
  fn: () => withFixtures(async (f) => {
    const author = await f.createUser();
    const other = await f.createUser();
    const pending = await seed(f, author.id, 'RECYCLING', {
      status: 'PENDING',
      approved_at: null,
      public_photo_path: null,
    });
    const approved = await seed(f, author.id, 'LITTER_COLLECTION');

    const invalid = await hide(f.db, pending.id, author.id);
    assertEquals(invalid.error?.code, 'P0001');
    assertEquals(invalid.error?.message, 'INVALID_STATE');
    assertEquals((await row(f, pending.id)).hidden_at, null);

    for (const result of [await hide(f.db, approved.id, other.id), await hide(f.db, crypto.randomUUID(), author.id)]) {
      assertEquals(result.error?.code, 'P0001');
      assertEquals(result.error?.message, 'NOT_FOUND');
    }
    assertEquals((await row(f, approved.id)).hidden_at, null);
  }),
});

Deno.test({
  name: 'hidden contributions keep the cooldown: a new one of the same type -> COOLDOWN_ACTIVE',
  ignore,
  fn: () => withFixtures(async (f) => {
    const author = await f.createUser();
    const approved = await seed(f, author.id, 'RECYCLING');
    assertEquals((await hide(f.db, approved.id, author.id)).error, null);

    const { error } = await f.db.rpc('create_contribution', {
      p_author_id: author.id,
      p_action_type: 'RECYCLING',
      p_description: 'Otra botella en el contenedor amarillo',
      p_municipality_code: MUNICIPALITY_CODE,
      p_evidence_path: `staging/${author.id}/${crypto.randomUUID()}`,
      p_capture_origin: 'CAMERA_FLOW',
      p_capture_exif_at: null,
      p_idempotency_key: crypto.randomUUID(),
      p_idempotency_fingerprint: `fp-${crypto.randomUUID()}`,
    });
    assertEquals(error?.code, 'P0001');
    assertEquals(error?.message, 'COOLDOWN_ACTIVE');
  }),
});

Deno.test({
  name: 'hide_contribution is not executable by anon or authenticated clients',
  ignore,
  fn: () => withFixtures(async (f) => {
    const user = await f.createUser();
    const approved = await seed(f, user.id, 'RECYCLING');
    for (const client of [anonClient(), await f.signInAs(user)]) {
      const { error } = await hide(client, approved.id, user.id);
      assert(error !== null, 'non-service client must be rejected');
      assert(error.code === '42501' || /permission denied/i.test(error.message), error.message);
    }
    assertEquals((await row(f, approved.id)).hidden_at, null);
  }),
});
