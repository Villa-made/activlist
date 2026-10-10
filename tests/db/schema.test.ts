// T01.b — schema invariants (data-model §3: DB-01, DB-02, DB-03, DB-05, DB-09, D2, D4).
// Data is prepared with the service-role client; RLS is proven with a real anon client.
import { assert, assertEquals, assertExists, assertStringIncludes } from 'jsr:@std/assert@1';
import { hasDbEnv, anonClient, randomSuffix, TestFixtures } from './support.ts';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

const ignore = !hasDbEnv();

async function withFixtures(fn: (f: TestFixtures) => Promise<void>): Promise<void> {
  const fixtures = new TestFixtures();
  try {
    await fixtures.ensureMunicipality();
    await fn(fixtures);
  } finally {
    await fixtures.cleanup();
  }
}

Deno.test({
  name: 'DB-01: alias is unique case-insensitively',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const alias = `EcoTest${randomSuffix()}`;
      await f.createUser(alias);
      await assertRejects(() => f.createUser(alias.toLowerCase()), UNIQUE_VIOLATION, 'profiles_alias_lower_key');
    }),
});

Deno.test({
  name: 'DB-03: second open contribution of the same (author, type) is rejected, other type is allowed',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      const first = await f.db.from('contributions').insert(f.contributionRow(user.id));
      assertEquals(first.error, null);

      const sameType = await f.db.from('contributions').insert(f.contributionRow(user.id));
      assertEquals(sameType.error?.code, UNIQUE_VIOLATION);
      assertStringIncludes(sameType.error?.message ?? '', 'contributions_open_per_author_action_key');

      const otherType = await f.db.from('contributions').insert(
        f.contributionRow(user.id, { action_type: 'LITTER_COLLECTION', points_snapshot: 20 }),
      );
      assertEquals(otherType.error, null);
    }),
});

Deno.test({
  name: 'DB-02: points_snapshot must match the action type (RECYCLING=10, LITTER_COLLECTION=20)',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      const wrongRecycling = await f.db.from('contributions').insert(
        f.contributionRow(user.id, { action_type: 'RECYCLING', points_snapshot: 15 }),
      );
      assertEquals(wrongRecycling.error?.code, CHECK_VIOLATION);

      const wrongLitter = await f.db.from('contributions').insert(
        f.contributionRow(user.id, { action_type: 'LITTER_COLLECTION', points_snapshot: 10 }),
      );
      assertEquals(wrongLitter.error?.code, CHECK_VIOLATION);
    }),
});

Deno.test({
  name: 'immutability: submitted_at, points_snapshot and author_id cannot be updated',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const owner = await f.createUser();
      const other = await f.createUser();
      const inserted = await f.db.from('contributions').insert(f.contributionRow(owner.id)).select('id').single();
      assertEquals(inserted.error, null);
      const id = inserted.data!.id as string;

      const submittedAt = await f.db.from('contributions').update({ submitted_at: '2020-01-01T00:00:00Z' }).eq('id', id);
      assertExists(submittedAt.error, 'submitted_at update must fail');
      assertStringIncludes(submittedAt.error!.message, 'immutable');

      const points = await f.db.from('contributions').update({ points_snapshot: 20 }).eq('id', id);
      assertExists(points.error, 'points_snapshot update must fail');

      const author = await f.db.from('contributions').update({ author_id: other.id }).eq('id', id);
      assertExists(author.error, 'author_id update must fail');

      // Mutable fields still work (the state machine of T13 depends on it).
      const status = await f.db.from('contributions').update({ status: 'CANCELLED' }).eq('id', id);
      assertEquals(status.error, null);
    }),
});

Deno.test({
  name: 'DB-05/D4: duplicate (author, idempotency_key) and duplicate evidence_path are rejected',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      const key = crypto.randomUUID();
      const path = `staging/${user.id}/${crypto.randomUUID()}`;
      const first = await f.db.from('contributions').insert(
        f.contributionRow(user.id, { idempotency_key: key, evidence_path: path }),
      );
      assertEquals(first.error, null);

      // Same idempotency key; other type so the open-contribution index is not the reason for failing.
      const sameKey = await f.db.from('contributions').insert(
        f.contributionRow(user.id, { idempotency_key: key, action_type: 'LITTER_COLLECTION', points_snapshot: 20 }),
      );
      assertEquals(sameKey.error?.code, UNIQUE_VIOLATION);
      assertStringIncludes(sameKey.error?.message ?? '', 'contributions_author_idempotency_key');

      const samePath = await f.db.from('contributions').insert(
        f.contributionRow(user.id, { evidence_path: path, action_type: 'LITTER_COLLECTION', points_snapshot: 20 }),
      );
      assertEquals(samePath.error?.code, UNIQUE_VIOLATION);
      assertStringIncludes(samePath.error?.message ?? '', 'contributions_evidence_path_key');
    }),
});

Deno.test({
  name: 'APPROVED requires approved_at and public_photo_path; hidden_at requires APPROVED',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      const approvedWithoutPhoto = await f.db.from('contributions').insert(
        f.contributionRow(user.id, { status: 'APPROVED', approved_at: new Date().toISOString() }),
      );
      assertEquals(approvedWithoutPhoto.error?.code, CHECK_VIOLATION);

      const hiddenButPending = await f.db.from('contributions').insert(
        f.contributionRow(user.id, { hidden_at: new Date().toISOString() }),
      );
      assertEquals(hiddenButPending.error?.code, CHECK_VIOLATION);

      const approved = await f.db.from('contributions').insert(
        f.contributionRow(user.id, {
          status: 'APPROVED',
          approved_at: new Date().toISOString(),
          public_photo_path: `published/${crypto.randomUUID()}`,
        }),
      );
      assertEquals(approved.error, null);
    }),
});

Deno.test({
  name: 'RLS default deny: anon client reads no rows from any table',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      const inserted = await f.db.from('contributions').insert(f.contributionRow(user.id));
      assertEquals(inserted.error, null);

      const anon = anonClient();
      for (const table of ['contributions', 'profiles', 'likes', 'reports', 'municipalities']) {
        const { data, error } = await anon.from(table).select('*').limit(5);
        // Either an error (no grant) or an empty result (RLS without policies) is a deny.
        assert(error !== null || (data ?? []).length === 0, `anon must not read ${table}`);
      }
    }),
});

async function assertRejects(fn: () => Promise<unknown>, pgCode: string, messagePart: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const message = (e as Error).message;
    assertStringIncludes(message, messagePart);
    assertStringIncludes(message, pgCode === UNIQUE_VIOLATION ? 'duplicate key' : message);
    return;
  }
  throw new Error('expected the operation to be rejected');
}
