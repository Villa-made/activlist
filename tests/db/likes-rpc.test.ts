// T20 — set_like RPC (DB-08, SPEC-community, SPEC-scoring: likes give no points).
// APPROVED rows are seeded with the service-role client; permissions are proven with real
// anon / authenticated clients.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { anonClient, hasDbEnv, TestFixtures } from './support.ts';

const ignore = !hasDbEnv();

interface LeaderboardRow { user_id: string; points: number }
interface FeedRow { id: string; like_count: number; liked_by_me: boolean }

async function withFixtures(fn: (f: TestFixtures) => Promise<void>): Promise<void> {
  const fixtures = new TestFixtures();
  try {
    await fixtures.ensureMunicipality();
    await fn(fixtures);
  } finally {
    await fixtures.cleanup();
  }
}

async function seed(
  f: TestFixtures,
  authorId: string,
  actionType: 'RECYCLING' | 'LITTER_COLLECTION' = 'RECYCLING',
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const now = new Date().toISOString();
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
  return data.id;
}

async function setLike(db: SupabaseClient, user: string, id: string, liked: boolean) {
  return await db.rpc('set_like', { p_user: user, p_id: id, p_liked: liked });
}

// deno-lint-ignore no-explicit-any
function state(result: { data: any; error: any }): { liked: boolean; like_count: number } {
  assertEquals(result.error, null);
  return Array.isArray(result.data) ? result.data[0] : result.data;
}

async function likeRows(f: TestFixtures, id: string): Promise<number> {
  const { data, error } = await f.db.from('likes').select('user_id').eq('contribution_id', id);
  if (error) throw new Error(`likes failed: ${error.message}`);
  return data.length;
}

async function pointsOf(db: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await db.rpc('get_leaderboard', { p_limit: 50, p_offset: 0 });
  if (error) throw new Error(`leaderboard failed: ${error.message}`);
  return ((data ?? []) as LeaderboardRow[]).find((row) => row.user_id === userId)?.points ?? 0;
}

async function feedRow(db: SupabaseClient, id: string, viewer: string | null): Promise<FeedRow | undefined> {
  const { data, error } = await db.rpc('get_feed', { p_limit: 50, p_offset: 0, p_viewer: viewer });
  if (error) throw new Error(`feed failed: ${error.message}`);
  return ((data ?? []) as FeedRow[]).find((row) => row.id === id);
}

Deno.test({
  name: 'like / unlike are idempotent, return the final state and never change the author points',
  ignore,
  fn: () => withFixtures(async (f) => {
    const author = await f.createUser();
    const fan = await f.createUser();
    const second = await f.createUser();
    const id = await seed(f, author.id);
    assertEquals(await pointsOf(f.db, author.id), 10);

    assertEquals(state(await setLike(f.db, fan.id, id, true)), { liked: true, like_count: 1 });
    assertEquals(state(await setLike(f.db, fan.id, id, true)), { liked: true, like_count: 1 });
    assertEquals(await likeRows(f, id), 1, 'repeated PUT keeps one row');
    assertEquals(await pointsOf(f.db, author.id), 10);

    const asFan = await feedRow(f.db, id, fan.id);
    assertEquals(asFan?.like_count, 1);
    assertEquals(asFan?.liked_by_me, true);
    assertEquals((await feedRow(f.db, id, second.id))?.liked_by_me, false);

    assertEquals(state(await setLike(f.db, second.id, id, true)), { liked: true, like_count: 2 });
    assertEquals(state(await setLike(f.db, fan.id, id, false)), { liked: false, like_count: 1 });
    assertEquals(state(await setLike(f.db, fan.id, id, false)), { liked: false, like_count: 1 });
    assertEquals(state(await setLike(f.db, second.id, id, false)), { liked: false, like_count: 0 });
    assertEquals(state(await setLike(f.db, second.id, id, false)), { liked: false, like_count: 0 });
    assertEquals(state(await setLike(f.db, fan.id, id, true)), { liked: true, like_count: 1 });

    assertEquals(await pointsOf(f.db, author.id), 10, 'likes never grant points');
    assertEquals((await feedRow(f.db, id, fan.id))?.like_count, 1);
  }),
});

Deno.test({
  name: 'set_like: own -> CANNOT_LIKE_OWN; pending, hidden or unknown -> NOT_FOUND',
  ignore,
  fn: () => withFixtures(async (f) => {
    const author = await f.createUser();
    const fan = await f.createUser();
    const approved = await seed(f, author.id, 'RECYCLING');
    const pending = await seed(f, author.id, 'LITTER_COLLECTION', {
      status: 'PENDING',
      approved_at: null,
      public_photo_path: null,
    });
    const hidden = await seed(f, fan.id, 'RECYCLING', { hidden_at: new Date().toISOString() });

    for (const liked of [true, false]) {
      const own = await setLike(f.db, author.id, approved, liked);
      assertEquals(own.error?.code, 'P0001');
      assertEquals(own.error?.message, 'CANNOT_LIKE_OWN');
    }
    assertEquals(await likeRows(f, approved), 0);

    // [target, a user that is not its author]
    const targets: [string, string][] = [[pending, fan.id], [hidden, author.id], [crypto.randomUUID(), fan.id]];
    for (const [id, liker] of targets) {
      for (const liked of [true, false]) {
        const res = await setLike(f.db, liker, id, liked);
        assertEquals(res.error?.code, 'P0001');
        assertEquals(res.error?.message, 'NOT_FOUND');
      }
    }
    assertEquals(await likeRows(f, pending), 0);
    assertEquals(await likeRows(f, hidden), 0);
  }),
});

Deno.test({
  name: 'set_like is not executable by anon or authenticated clients',
  ignore,
  fn: () => withFixtures(async (f) => {
    const author = await f.createUser();
    const user = await f.createUser();
    const id = await seed(f, author.id);
    for (const client of [anonClient(), await f.signInAs(user)]) {
      const { error } = await setLike(client, user.id, id, true);
      assert(error !== null, 'non-service client must be rejected');
      assert(error.code === '42501' || /permission denied/i.test(error.message), error.message);
    }
    assertEquals(await likeRows(f, id), 0);
  }),
});
