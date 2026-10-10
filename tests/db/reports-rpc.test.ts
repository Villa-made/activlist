// T21 — submit_report RPC and rate_limits (DB-10, plan D3). Rows are seeded with the service-role
// client; permissions are proven with real anon / authenticated clients.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { anonClient, hasDbEnv, TestFixtures } from './support.ts';

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

/** Random rate-limit key per test, so tests never interfere with each other or with real keys. */
const newKey = () => `t21-${crypto.randomUUID().replaceAll('-', '')}`;

async function dropBuckets(f: TestFixtures, key: string): Promise<void> {
  await f.db.from('rate_limits').delete().like('bucket', `report:${key}%`);
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

function report(db: SupabaseClient, key: string, contribution: string, reason = 'Contiene un rostro') {
  return db.rpc('submit_report', { p_key_hash: key, p_contribution: contribution, p_reason: reason });
}

async function reportRows(f: TestFixtures, contribution: string): Promise<number> {
  const { data, error } = await f.db.from('reports').select('id').eq('contribution_id', contribution);
  if (error) throw new Error(`reports failed: ${error.message}`);
  return data.length;
}

async function hits(f: TestFixtures, bucket: string): Promise<number> {
  const { data, error } = await f.db.from('rate_limits').select('hits').eq('bucket', bucket);
  if (error) throw new Error(`rate_limits failed: ${error.message}`);
  return data.reduce((sum, row) => sum + row.hits, 0);
}

Deno.test({
  name: 'submit_report inserts for a visible contribution and trims the reason',
  ignore,
  fn: () => withFixtures(async (f) => {
    const author = await f.createUser();
    const id = await seed(f, author.id);
    const key = newKey();
    try {
      const res = await report(f.db, key, id, '  Foto inapropiada  ');
      assertEquals(res.error, null);
      assertEquals(res.data, true);
      const { data } = await f.db.from('reports').select('reason, reviewed_at, resolution').eq('contribution_id', id);
      assertEquals(data, [{ reason: 'Foto inapropiada', reviewed_at: null, resolution: null }]);
    } finally {
      await dropBuckets(f, key);
    }
  }),
});

Deno.test({
  name: 'submit_report: hidden, pending or unknown -> false, no row, but it consumes the rate limit',
  ignore,
  fn: () => withFixtures(async (f) => {
    const author = await f.createUser();
    const hidden = await seed(f, author.id, 'RECYCLING', { hidden_at: new Date().toISOString() });
    const pending = await seed(f, author.id, 'LITTER_COLLECTION', {
      status: 'PENDING',
      approved_at: null,
      public_photo_path: null,
    });
    const key = newKey();
    try {
      for (const id of [hidden, pending, crypto.randomUUID()]) {
        const res = await report(f.db, key, id);
        assertEquals(res.error, null);
        assertEquals(res.data, false);
      }
      assertEquals(await reportRows(f, hidden), 0);
      assertEquals(await reportRows(f, pending), 0);
      assertEquals(await hits(f, `report:${key}`), 3);
    } finally {
      await dropBuckets(f, key);
    }
  }),
});

Deno.test({
  name: 'submit_report: 5 per key per hour and 3 per (key, contribution), other keys unaffected',
  ignore,
  fn: () => withFixtures(async (f) => {
    const author = await f.createUser();
    const first = await seed(f, author.id, 'RECYCLING');
    const second = await seed(f, author.id, 'LITTER_COLLECTION');
    const keyA = newKey();
    const keyB = newKey();
    const keyC = newKey();
    try {
      // Pair limit: the 4th on the same contribution is rejected.
      for (let i = 0; i < 3; i++) assertEquals((await report(f.db, keyA, first)).data, true);
      const pair = await report(f.db, keyA, first);
      assertEquals(pair.error?.code, 'P0001');
      assertEquals(pair.error?.message, 'RATE_LIMITED');
      assertEquals(await reportRows(f, first), 3);

      // Key limit: two more on another contribution reach 5, the 6th is rejected.
      for (let i = 0; i < 2; i++) assertEquals((await report(f.db, keyA, second)).data, true);
      const overall = await report(f.db, keyA, second);
      assertEquals(overall.error?.message, 'RATE_LIMITED');
      assertEquals(await reportRows(f, second), 2);

      // Another key still works, even on the saturated contribution.
      assertEquals((await report(f.db, keyB, first)).data, true);
      assertEquals((await report(f.db, keyC, second)).data, true);
    } finally {
      await dropBuckets(f, keyA);
      await dropBuckets(f, keyB);
      await dropBuckets(f, keyC);
    }
  }),
});

Deno.test({
  name: 'submit_report rejects an empty or 501 character reason and an empty key',
  ignore,
  fn: () => withFixtures(async (f) => {
    const author = await f.createUser();
    const id = await seed(f, author.id);
    const key = newKey();
    try {
      for (const reason of ['', '   ', 'a'.repeat(501)]) {
        const res = await report(f.db, key, id, reason);
        assertEquals(res.error?.code, 'P0001');
        assertEquals(res.error?.message, 'INVALID_REQUEST');
      }
      assertEquals((await report(f.db, '', id)).error?.message, 'INVALID_REQUEST');
      assertEquals((await report(f.db, key, id, 'a'.repeat(500))).data, true);
      assertEquals(await reportRows(f, id), 1);
    } finally {
      await dropBuckets(f, key);
    }
  }),
});

Deno.test({
  name: 'anon and authenticated cannot execute submit_report nor read reports / rate_limits',
  ignore,
  fn: () => withFixtures(async (f) => {
    const author = await f.createUser();
    const user = await f.createUser();
    const id = await seed(f, author.id);
    const key = newKey();
    // A real row in each table, so "0 rows" cannot be confused with "empty table".
    assertEquals((await report(f.db, key, id)).data, true);
    try {
      for (const client of [anonClient(), await f.signInAs(user)]) {
        const exec = await report(client, newKey(), id);
        assert(exec.error !== null, 'non-service client must not execute submit_report');
        assert(exec.error.code === '42501' || /permission denied/i.test(exec.error.message), exec.error.message);

        for (const table of ['reports', 'rate_limits']) {
          const read = await client.from(table).select('*');
          assert(read.error !== null || (read.data ?? []).length === 0, `${table} must not be readable`);
          const write = await client.from(table).insert(
            table === 'reports'
              ? { contribution_id: id, reason: 'x' }
              : { bucket: 'report:x', window_start: new Date().toISOString(), hits: 0 },
          );
          assert(write.error !== null, `${table} must not be writable`);
        }
      }
      assertEquals(await reportRows(f, id), 1);
    } finally {
      await dropBuckets(f, key);
    }
  }),
});
