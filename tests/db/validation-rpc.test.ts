// T13.a — validation transition RPCs (data-model §2/§3 DB-06, DB-07, DB-09; architecture §3).
// Contributions are created with create_contribution; state/lease are manipulated with service-role.
import { assert, assertEquals, assertExists } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { anonClient, hasDbEnv, MUNICIPALITY_CODE, randomSuffix, TestFixtures } from './support.ts';

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

// deno-lint-ignore no-explicit-any
function first(data: any): any {
  return Array.isArray(data) ? data[0] : data;
}

function createArgs(authorId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

/** New PENDING contribution (version 1, lease 120 s) through the real RPC. */
async function create(f: TestFixtures, authorId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await f.db.rpc('create_contribution', createArgs(authorId, overrides));
  if (error) throw new Error(`create failed: ${error.message}`);
  return first(data).id as string;
}

async function row(f: TestFixtures, id: string) {
  const { data, error } = await f.db.from('contributions').select('*').eq('id', id).single();
  if (error) throw new Error(`row failed: ${error.message}`);
  return data;
}

async function setLease(f: TestFixtures, id: string, ms: number | null): Promise<void> {
  const value = ms === null ? null : new Date(Date.now() + ms).toISOString();
  const { error } = await f.db.from('contributions').update({ processing_lease_until: value }).eq('id', id);
  if (error) throw new Error(`setLease failed: ${error.message}`);
}

function complete(
  db: SupabaseClient,
  id: string,
  version: number,
  decision: string,
  photo: string | null = null,
) {
  return db.rpc('complete_validation', {
    p_id: id,
    p_version: version,
    p_decision: decision,
    p_reason: 'motivo de prueba',
    p_public_photo_path: photo,
  });
}

const PHOTO = (id: string) => `public/${id}.jpg`;

Deno.test({
  name: 'complete APPROVED applies once with the right version; a second complete is false',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const u = await f.createUser();
      const id = await create(f, u.id);
      const before = await row(f, id);
      const r1 = await complete(f.db, id, 1, 'APPROVED', PHOTO(id));
      assertEquals(r1.error, null);
      assertEquals(r1.data, true);
      const a = await row(f, id);
      assertEquals(a.status, 'APPROVED');
      assertExists(a.approved_at);
      assertEquals(a.public_photo_path, PHOTO(id));
      assertEquals(a.ai_reason, 'motivo de prueba');
      assertEquals(a.processing_lease_until, null);
      assertEquals(a.submitted_at, before.submitted_at);
      assertEquals(a.points_snapshot, before.points_snapshot);

      const r2 = await complete(f.db, id, 1, 'APPROVED', PHOTO(id));
      assertEquals(r2.error, null);
      assertEquals(r2.data, false);
      const b = await row(f, id);
      assertEquals(b.approved_at, a.approved_at);
    }),
});

Deno.test({
  name: 'complete rejects APPROVED without public photo and unknown decisions with INVALID_REQUEST',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const u = await f.createUser();
      const id = await create(f, u.id);
      const noPhoto = await complete(f.db, id, 1, 'APPROVED', null);
      assertEquals(noPhoto.error?.message, 'INVALID_REQUEST');
      const bogus = await complete(f.db, id, 1, 'MAYBE', PHOTO(id));
      assertEquals(bogus.error?.message, 'INVALID_REQUEST');
      const r = await row(f, id);
      assertEquals(r.status, 'PENDING');
      assertExists(r.processing_lease_until);
    }),
});

Deno.test({
  name: 'complete is false for an old version, an expired lease, and after cancel',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const u = await f.createUser();
      const id = await create(f, u.id);
      assertEquals((await complete(f.db, id, 0, 'APPROVED', PHOTO(id))).data, false);
      assertEquals((await complete(f.db, id, 2, 'APPROVED', PHOTO(id))).data, false);
      await setLease(f, id, -60_000);
      assertEquals((await complete(f.db, id, 1, 'APPROVED', PHOTO(id))).data, false);
      await setLease(f, id, null);
      assertEquals((await complete(f.db, id, 1, 'APPROVED', PHOTO(id))).data, false);
      assertEquals((await row(f, id)).status, 'PENDING');

      await setLease(f, id, 60_000);
      const c = await f.db.rpc('cancel_contribution', { p_id: id, p_author: u.id });
      assertEquals(c.data, 'CANCELLED');
      const after = await complete(f.db, id, 1, 'APPROVED', PHOTO(id));
      assertEquals(after.data, false);
      const r = await row(f, id);
      assertEquals(r.status, 'CANCELLED');
      assertEquals(r.approved_at, null);
    }),
});

Deno.test({
  name: 'REJECTED and NEEDS_EVIDENCE are final for complete; they never become APPROVED',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const u = await f.createUser();
      const rej = await create(f, u.id);
      assertEquals((await complete(f.db, rej, 1, 'REJECTED')).data, true);
      assertEquals((await row(f, rej)).status, 'REJECTED');
      assertEquals((await row(f, rej)).processing_lease_until, null);
      assertEquals((await complete(f.db, rej, 1, 'APPROVED', PHOTO(rej))).data, false);
      assertEquals((await row(f, rej)).status, 'REJECTED');

      const ne = await create(f, u.id);
      assertEquals((await complete(f.db, ne, 1, 'NEEDS_EVIDENCE')).data, true);
      const r = await row(f, ne);
      assertEquals(r.status, 'NEEDS_EVIDENCE');
      assertEquals(r.ai_reason, 'motivo de prueba');
      assertEquals((await complete(f.db, ne, 1, 'APPROVED', PHOTO(ne))).data, false);
      assertEquals((await row(f, ne)).status, 'NEEDS_EVIDENCE');

      const cancelled = await create(f, u.id, { p_action_type: 'LITTER_COLLECTION' });
      await f.db.rpc('cancel_contribution', { p_id: cancelled, p_author: u.id });
      assertEquals((await complete(f.db, cancelled, 1, 'APPROVED', PHOTO(cancelled))).data, false);
      assertEquals((await row(f, cancelled)).status, 'CANCELLED');
    }),
});

Deno.test({
  name: 'mark_technical_error and retry_validation bump the version and invalidate old workers',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const u = await f.createUser();
      const id = await create(f, u.id);

      const stale = await f.db.rpc('mark_technical_error', { p_id: id, p_version: 9, p_reason: 'x' });
      assertEquals(stale.data, false);
      assertEquals((await row(f, id)).status, 'PENDING');

      const ok = await f.db.rpc('mark_technical_error', { p_id: id, p_version: 1, p_reason: 'timeout' });
      assertEquals(ok.error, null);
      assertEquals(ok.data, true);
      const t = await row(f, id);
      assertEquals(t.status, 'TECHNICAL_ERROR');
      assertEquals(t.processing_lease_until, null);

      // a late worker (version 1) cannot complete a technical-error row
      assertEquals((await complete(f.db, id, 1, 'APPROVED', PHOTO(id))).data, false);

      const retry = await f.db.rpc('retry_validation', { p_id: id, p_author: u.id });
      assertEquals(retry.error, null);
      const r = first(retry.data);
      assertEquals(r.validation_version, 2);
      assert(new Date(r.processing_lease_until).getTime() > Date.now());
      assertEquals((await row(f, id)).status, 'PENDING');

      assertEquals((await complete(f.db, id, 1, 'APPROVED', PHOTO(id))).data, false);
      assertEquals((await complete(f.db, id, 2, 'APPROVED', PHOTO(id))).data, true);
      assertEquals((await row(f, id)).status, 'APPROVED');
    }),
});

Deno.test({
  name: 'retry_validation on PENDING needs an expired or null lease; other states are INVALID_STATE',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const u = await f.createUser();
      const id = await create(f, u.id);
      const live = await f.db.rpc('retry_validation', { p_id: id, p_author: u.id });
      assertEquals(live.error?.message, 'INVALID_STATE');
      assertEquals((await row(f, id)).validation_version, 1);

      await setLease(f, id, -60_000);
      const expired = await f.db.rpc('retry_validation', { p_id: id, p_author: u.id });
      assertEquals(expired.error, null);
      assertEquals(first(expired.data).validation_version, 2);

      await setLease(f, id, null);
      const nul = await f.db.rpc('retry_validation', { p_id: id, p_author: u.id, p_lease_seconds: 30 });
      assertEquals(nul.error, null);
      assertEquals(first(nul.data).validation_version, 3);

      await complete(f.db, id, 3, 'REJECTED');
      const done = await f.db.rpc('retry_validation', { p_id: id, p_author: u.id });
      assertEquals(done.error?.message, 'INVALID_STATE');

      const other = await f.createUser();
      const foreign = await f.db.rpc('retry_validation', { p_id: id, p_author: other.id });
      assertEquals(foreign.error?.message, 'NOT_FOUND');
      const missing = await f.db.rpc('retry_validation', { p_id: crypto.randomUUID(), p_author: u.id });
      assertEquals(missing.error?.message, 'NOT_FOUND');
    }),
});

Deno.test({
  name: 'cancel is idempotent, refuses APPROVED, hides foreign rows and frees the pending slot',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const u = await f.createUser();
      const id = await create(f, u.id);

      const dup = await f.db.rpc('create_contribution', createArgs(u.id));
      assertEquals(dup.error?.message, 'PENDING_CONTRIBUTION_EXISTS');

      const other = await f.createUser();
      const foreign = await f.db.rpc('cancel_contribution', { p_id: id, p_author: other.id });
      assertEquals(foreign.error?.message, 'NOT_FOUND');
      assertEquals((await row(f, id)).status, 'PENDING');

      const c1 = await f.db.rpc('cancel_contribution', { p_id: id, p_author: u.id });
      assertEquals(c1.error, null);
      assertEquals(c1.data, 'CANCELLED');
      const c2 = await f.db.rpc('cancel_contribution', { p_id: id, p_author: u.id });
      assertEquals(c2.data, 'CANCELLED');
      assertEquals((await row(f, id)).processing_lease_until, null);

      // slot released: same user can create another of the same type
      const again = await f.db.rpc('create_contribution', createArgs(u.id));
      assertEquals(again.error, null);

      const approved = await create(f, u.id, { p_action_type: 'LITTER_COLLECTION' });
      await complete(f.db, approved, 1, 'APPROVED', PHOTO(approved));
      const bad = await f.db.rpc('cancel_contribution', { p_id: approved, p_author: u.id });
      assertEquals(bad.error?.message, 'INVALID_STATE');
      assertEquals((await row(f, approved)).status, 'APPROVED');
    }),
});

Deno.test({
  name: 'cancel works from NEEDS_EVIDENCE and TECHNICAL_ERROR',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const u = await f.createUser();
      const ne = await create(f, u.id);
      await complete(f.db, ne, 1, 'NEEDS_EVIDENCE');
      assertEquals((await f.db.rpc('cancel_contribution', { p_id: ne, p_author: u.id })).data, 'CANCELLED');

      const te = await create(f, u.id);
      await f.db.rpc('mark_technical_error', { p_id: te, p_version: 1 });
      assertEquals((await f.db.rpc('cancel_contribution', { p_id: te, p_author: u.id })).data, 'CANCELLED');
    }),
});

Deno.test({
  name: 'submit_evidence moves NEEDS_EVIDENCE to PENDING with a new version and keeps submitted_at',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const u = await f.createUser();
      const id = await create(f, u.id);
      const before = await row(f, id);
      const newPath = `staging/${u.id}/${crypto.randomUUID()}`;
      const args = {
        p_id: id,
        p_author: u.id,
        p_evidence_path: newPath,
        p_capture_origin: 'GALLERY',
        p_capture_exif_at: '2026-10-09T10:00:00Z',
      };

      const fromPending = await f.db.rpc('submit_evidence', args);
      assertEquals(fromPending.error?.message, 'INVALID_STATE');

      await complete(f.db, id, 1, 'NEEDS_EVIDENCE');
      const other = await f.createUser();
      const foreign = await f.db.rpc('submit_evidence', { ...args, p_author: other.id });
      assertEquals(foreign.error?.message, 'NOT_FOUND');

      const ok = await f.db.rpc('submit_evidence', args);
      assertEquals(ok.error, null);
      const r = first(ok.data);
      assertEquals(r.validation_version, 2);
      assert(new Date(r.processing_lease_until).getTime() > Date.now());

      const after = await row(f, id);
      assertEquals(after.status, 'PENDING');
      assertEquals(after.evidence_path, newPath);
      assertEquals(after.capture_origin, 'GALLERY');
      assertEquals(new Date(after.capture_exif_at).toISOString(), '2026-10-09T10:00:00.000Z');
      assertEquals(after.ai_reason, null);
      assertEquals(after.submitted_at, before.submitted_at);
      assertEquals(after.points_snapshot, before.points_snapshot);
      assertEquals(after.public_photo_path, null);
    }),
});

Deno.test({
  name: 'race: cancel and complete(APPROVED) leave a coherent final state',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const u = await f.createUser();
      for (let i = 0; i < 5; i++) {
        const id = await create(f, u.id);
        const [cancel, done] = await Promise.all([
          f.db.rpc('cancel_contribution', { p_id: id, p_author: u.id }),
          complete(f.db, id, 1, 'APPROVED', PHOTO(id)),
        ]);
        const r = await row(f, id);
        if (r.status === 'CANCELLED') {
          assertEquals(cancel.data, 'CANCELLED');
          assertEquals(done.error, null);
          assertEquals(done.data, false);
          assertEquals(r.approved_at, null);
          assertEquals(r.public_photo_path, null);
        } else {
          assertEquals(r.status, 'APPROVED');
          assertEquals(done.data, true);
          assertEquals(cancel.error?.message, 'INVALID_STATE');
          assertExists(r.approved_at);
          // free the slot so the next iteration can create again (cooldown is bypassed by a REJECTED copy)
          const { error } = await f.db.from('contributions')
            .update({ status: 'REJECTED', approved_at: null, public_photo_path: null }).eq('id', id);
          assertEquals(error, null);
        }
      }
    }),
});

Deno.test({
  name: 'anon and authenticated clients cannot execute any transition function',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const u = await f.createUser();
      const id = await create(f, u.id);
      const calls: [string, Record<string, unknown>][] = [
        ['complete_validation', {
          p_id: id,
          p_version: 1,
          p_decision: 'REJECTED',
          p_reason: 'x',
          p_public_photo_path: null,
        }],
        ['mark_technical_error', { p_id: id, p_version: 1, p_reason: 'x' }],
        ['cancel_contribution', { p_id: id, p_author: u.id }],
        ['retry_validation', { p_id: id, p_author: u.id, p_lease_seconds: 120 }],
        ['submit_evidence', {
          p_id: id,
          p_author: u.id,
          p_evidence_path: `staging/${u.id}/${crypto.randomUUID()}`,
          p_capture_origin: 'GALLERY',
          p_capture_exif_at: null,
          p_lease_seconds: 120,
        }],
      ];
      const asUser = await f.signInAs(u);
      for (const [name, args] of calls) {
        for (const [who, client] of [['anon', anonClient()], ['authenticated', asUser]] as const) {
          const res = await client.rpc(name, args);
          assert(res.error !== null, `${who} must be rejected for ${name}`);
          assert(
            res.error.code === '42501' || /permission denied/i.test(res.error.message),
            `${who}/${name}: ${res.error.message}`,
          );
        }
      }
      const r = await row(f, id);
      assertEquals(r.status, 'PENDING');
      assertEquals(r.validation_version, 1);
    }),
});
