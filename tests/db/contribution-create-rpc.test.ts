// T10.a — create_contribution RPC (CON-03, CON-08, CON-09, DB-02..DB-05, D2).
// Data is prepared and the RPC is called with the service-role client; permissions are proven
// with real anon / authenticated clients.
import { assert, assertEquals, assertExists } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { anonClient, hasDbEnv, MUNICIPALITY_CODE, randomSuffix, TestFixtures } from './support.ts';

const ignore = !hasDbEnv();
const MINUTE = 60_000;

async function withFixtures(fn: (f: TestFixtures) => Promise<void>): Promise<void> {
  const fixtures = new TestFixtures();
  try {
    await fixtures.ensureMunicipality();
    await fn(fixtures);
  } finally {
    await fixtures.cleanup();
  }
}

function params(authorId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    p_author_id: authorId,
    p_action_type: 'RECYCLING',
    p_description: 'Reciclado de envases en el contenedor amarillo',
    p_municipality_code: MUNICIPALITY_CODE,
    p_evidence_path: `staging/${authorId}/${crypto.randomUUID()}`,
    p_capture_origin: 'CAMERA_FLOW',
    p_capture_exif_at: null,
    p_idempotency_key: crypto.randomUUID(),
    p_idempotency_fingerprint: `fp-${randomSuffix()}`,
    ...overrides,
  };
}

async function call(db: SupabaseClient, args: Record<string, unknown>) {
  return await db.rpc('create_contribution', args);
}

// deno-lint-ignore no-explicit-any
function first(data: any): any {
  return Array.isArray(data) ? data[0] : data;
}

/**
 * Server clock (ms) from the HTTP `Date` header of PostgREST. The DB decides the cooldown with its
 * own now(), and the test machine clock may be skewed, so seeds are anchored to the server time.
 */
async function serverNowMs(): Promise<number> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/`, {
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')! },
  });
  await res.body?.cancel();
  const header = res.headers.get('date');
  assert(header, 'PostgREST response has no Date header');
  return new Date(header).getTime();
}

/** Seeds a contribution with a fixed submitted_at (INSERT, so the immutability trigger is not involved). */
async function seed(
  f: TestFixtures,
  authorId: string,
  status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
  minutesAgo: number,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const at = new Date((await serverNowMs()) - minutesAgo * MINUTE).toISOString();
  const approved = status === 'APPROVED'
    ? { approved_at: at, public_photo_path: `public/${authorId}/${crypto.randomUUID()}.jpg` }
    : {};
  const { error } = await f.db.from('contributions').insert(
    f.contributionRow(authorId, { status, submitted_at: at, ...approved, ...overrides }),
  );
  if (error) throw new Error(`seed failed: ${error.message}`);
}

Deno.test({
  name: 'creates a PENDING contribution with points by type, version 1 and a future lease',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      for (const [type, points] of [['RECYCLING', 10], ['LITTER_COLLECTION', 20]] as const) {
        const { data, error } = await call(f.db, params(user.id, { p_action_type: type }));
        assertEquals(error, null);
        const row = first(data);
        assertEquals(row.status, 'PENDING');
        assertEquals(row.points_snapshot, points);
        assertEquals(row.validation_version, 1);
        assertEquals(row.created, true);
        assertExists(row.id);
        assertExists(row.submitted_at);

        const stored = await f.db.from('contributions').select('processing_lease_until').eq('id', row.id).single();
        assert(new Date(stored.data!.processing_lease_until).getTime() > (await serverNowMs()));
      }
    }),
});

Deno.test({
  name: 'same key + same fingerprint replays the row; same key + other fingerprint is IDEMPOTENCY_CONFLICT',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      const args = params(user.id);
      const created = first((await call(f.db, args)).data);
      assertEquals(created.created, true);

      const replay = await call(f.db, { ...args, p_evidence_path: `staging/${user.id}/${crypto.randomUUID()}` });
      assertEquals(replay.error, null);
      assertEquals(first(replay.data).id, created.id);
      assertEquals(first(replay.data).created, false);

      const conflict = await call(f.db, { ...args, p_idempotency_fingerprint: `other-${randomSuffix()}` });
      assertEquals(conflict.error?.message, 'IDEMPOTENCY_CONFLICT');
      assertEquals(conflict.error?.code, 'P0001');
    }),
});

Deno.test({
  name: 'second open contribution of the same pair is PENDING_CONTRIBUTION_EXISTS; other type is allowed',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      assertEquals((await call(f.db, params(user.id))).error, null);

      const again = await call(f.db, params(user.id));
      assertEquals(again.error?.message, 'PENDING_CONTRIBUTION_EXISTS');

      const other = await call(f.db, params(user.id, { p_action_type: 'LITTER_COLLECTION' }));
      assertEquals(other.error, null);
    }),
});

Deno.test({
  name: 'concurrent calls of the same pair: exactly one creates, the other PENDING_CONTRIBUTION_EXISTS',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      const results = await Promise.all([
        call(f.db, params(user.id)),
        call(f.db, params(user.id)),
      ]);
      const ok = results.filter((r) => r.error === null);
      const failed = results.filter((r) => r.error !== null);
      assertEquals(ok.length, 1);
      assertEquals(failed.length, 1);
      assertEquals(failed[0].error?.message, 'PENDING_CONTRIBUTION_EXISTS');
    }),
});

Deno.test({
  name: 'cooldown: approved 59 min ago blocks with the right retryAt',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      const approvedAtMs = (await serverNowMs()) - 59 * MINUTE;
      await seed(f, user.id, 'APPROVED', 59);
      const stored = await f.db.from('contributions').select('submitted_at').eq('author_id', user.id).single();
      const submittedMs = new Date(stored.data!.submitted_at).getTime();
      assert(Math.abs(submittedMs - approvedAtMs) < 10_000);

      const { error } = await call(f.db, params(user.id));
      assertEquals(error?.message, 'COOLDOWN_ACTIVE');
      const detail = JSON.parse(error!.details);
      assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(detail.retryAt), detail.retryAt);
      assertEquals(new Date(detail.retryAt).getTime(), submittedMs + 60 * MINUTE);
    }),
});

Deno.test({
  name: 'cooldown: approved 61 min ago allows',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      await seed(f, user.id, 'APPROVED', 61);
      assertEquals((await call(f.db, params(user.id))).error, null);
    }),
});

Deno.test({
  name: 'cooldown: approved and hidden 30 min ago still blocks',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      await seed(f, user.id, 'APPROVED', 30, { hidden_at: new Date(await serverNowMs()).toISOString() });
      const { error } = await call(f.db, params(user.id));
      assertEquals(error?.message, 'COOLDOWN_ACTIVE');
    }),
});

Deno.test({
  name: 'cooldown: REJECTED or CANCELLED 5 min ago does not block',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      await seed(f, user.id, 'REJECTED', 5);
      assertEquals((await call(f.db, params(user.id))).error, null);

      const other = await f.createUser();
      await seed(f, other.id, 'CANCELLED', 5);
      assertEquals((await call(f.db, params(other.id))).error, null);
    }),
});

Deno.test({
  name: 'cooldown: other action type is not blocked; the municipality does not matter',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      await seed(f, user.id, 'APPROVED', 10);

      const otherType = await call(f.db, params(user.id, { p_action_type: 'LITTER_COLLECTION' }));
      assertEquals(otherType.error, null);

      // Same pair, same municipality as the seed: blocked. A second catalogue municipality is not
      // needed: the seed and the call both use 08019 and the rule never reads municipality_code,
      // so we also check a call with a different (valid) municipality when one exists.
      const sameType = await call(f.db, params(user.id));
      assertEquals(sameType.error?.message, 'COOLDOWN_ACTIVE');

      const { data: others } = await f.db.from('municipalities').select('code').neq('code', MUNICIPALITY_CODE).limit(1);
      if (others && others.length > 0) {
        const diffMunicipality = await call(f.db, params(user.id, { p_municipality_code: others[0].code }));
        assertEquals(diffMunicipality.error?.message, 'COOLDOWN_ACTIVE');
      }
    }),
});

Deno.test({
  name: 'unknown municipality is INVALID_MUNICIPALITY; unknown action type is INVALID_REQUEST',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      const municipality = await call(f.db, params(user.id, { p_municipality_code: '28079' }));
      assertEquals(municipality.error?.message, 'INVALID_MUNICIPALITY');

      const type = await call(f.db, params(user.id, { p_action_type: 'COMPOSTING' }));
      assertEquals(type.error?.message, 'INVALID_REQUEST');

      const rows = await f.db.from('contributions').select('id').eq('author_id', user.id);
      assertEquals(rows.data?.length, 0);
    }),
});

Deno.test({
  name: 'anon and authenticated clients cannot execute the RPC',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      const args = params(user.id);

      const anon = await call(anonClient(), args);
      assert(anon.error !== null, 'anon must be rejected');
      assert(anon.error.code === '42501' || /permission denied/i.test(anon.error.message), anon.error.message);

      const asUser = await f.signInAs(user);
      const authed = await call(asUser, args);
      assert(authed.error !== null, 'authenticated must be rejected');
      assert(authed.error.code === '42501' || /permission denied/i.test(authed.error.message), authed.error.message);

      const rows = await f.db.from('contributions').select('id').eq('author_id', user.id);
      assertEquals(rows.data?.length, 0);
    }),
});
