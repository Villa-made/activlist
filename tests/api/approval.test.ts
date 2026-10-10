// T13.c — contribution status, evidence, retry and cancel with background validation.
// Real DEV database and Storage; fake validator and sanitizer (never a real AI, never network AI).
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { createHandler } from '../../supabase/functions/api/index.ts';
import { createSupabaseTokenVerifier } from '../../supabase/functions/api/domain/auth.ts';
import { createServiceClient } from '../../supabase/functions/api/domain/db.ts';
import type { Decision } from '../../supabase/functions/api/domain/contracts.ts';
import {
  supabaseEvidenceStorage,
  supabasePublishedStorage,
  supabaseValidationRepository,
  type EvidenceInspector,
} from '../../supabase/functions/api/domain/ports.ts';
import type { ValidationOutcome } from '../../supabase/functions/api/domain/validation-workflow.ts';
import { contributionRoutes } from '../../supabase/functions/api/routes/contributions.ts';
import { uploadRoutes } from '../../supabase/functions/api/routes/uploads.ts';
import { anonClient, hasDbEnv, MUNICIPALITY_CODE, TestFixtures } from '../db/support.ts';

const BASE = 'https://proj.supabase.co';
const ignore = !hasDbEnv();
const EVIDENCE_BUCKET = 'evidence-private';
const PUBLISHED_BUCKET = 'published-private';

type Handler = (req: Request) => Promise<Response>;
type Verdict = { decision: Decision; reason: string };

const inspector: EvidenceInspector = {
  inspect: () => ({ ok: true, mime: 'image/jpeg', captureExifAt: null }),
};

/** Fake validator whose verdict can change between runs and whose runs can be held back. */
class FakeValidator {
  calls = 0;
  entered = Promise.withResolvers<void>();
  next: () => Promise<Verdict> = () => Promise.resolve({ decision: 'APPROVED', reason: 'Se ve la acción' });

  validate = (): Promise<Verdict> => {
    this.calls++;
    this.entered.resolve();
    return this.next();
  };
}

interface Harness {
  h: Handler;
  validator: FakeValidator;
  outcomes: Promise<ValidationOutcome>[];
  /** Awaits every scheduled worker (and any scheduled while waiting) and returns their outcomes. */
  settle(): Promise<ValidationOutcome[]>;
}

function harness(): Harness {
  const validator = new FakeValidator();
  const outcomes: Promise<ValidationOutcome>[] = [];
  const deps = { verifier: createSupabaseTokenVerifier(), db: createServiceClient };
  const h = createHandler([
    ...uploadRoutes(deps),
    ...contributionRoutes({
      ...deps,
      inspector,
      validationPorts: (db) => ({
        repository: supabaseValidationRepository(db),
        evidenceStorage: supabaseEvidenceStorage(db),
        publishedStorage: supabasePublishedStorage(db),
        validator,
        sanitizer: {
          sanitize: () => Promise.resolve({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), contentType: 'image/jpeg' }),
        },
      }),
      schedule: (p) => outcomes.push(p as Promise<ValidationOutcome>),
    }),
  ]);
  return {
    h,
    validator,
    outcomes,
    async settle() {
      const done: ValidationOutcome[] = [];
      while (outcomes.length > 0) done.push(...await Promise.all(outcomes.splice(0)));
      return done;
    },
  };
}

function call(
  h: Handler,
  method: 'GET' | 'POST',
  path: string,
  opts: { token?: string; key?: string; body?: unknown } = {},
): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.token) headers.set('Authorization', `Bearer ${opts.token}`);
  if (opts.key) headers.set('Idempotency-Key', opts.key);
  return h(
    new Request(`${BASE}/api/v1${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
    }),
  );
}

async function tokenFor(fixtures: TestFixtures, user: { id: string; email: string }): Promise<string> {
  const client = await fixtures.signInAs(user);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('fixture sign-in did not return an access token');
  return session.access_token;
}

async function uploadPhoto(h: Handler, fixtures: TestFixtures, token: string): Promise<string> {
  const res = await call(h, 'POST', '/uploads', { token, body: { contentType: 'image/jpeg', sizeBytes: 4 } });
  assertEquals(res.status, 201);
  const { photoPath, uploadToken } = await res.json();
  const { error } = await anonClient().storage.from(EVIDENCE_BUCKET).uploadToSignedUrl(
    photoPath,
    uploadToken,
    new Blob(['jpeg'], { type: 'image/jpeg' }),
    { contentType: 'image/jpeg' },
  );
  assertEquals(error, null);
  fixtures.trackObject(EVIDENCE_BUCKET, photoPath);
  return photoPath;
}

async function createContribution(
  s: Scenario,
  actionType: 'RECYCLING' | 'LITTER_COLLECTION' = 'RECYCLING',
  key: string = crypto.randomUUID(),
): Promise<{ id: string; photoPath: string; key: string }> {
  const photoPath = await uploadPhoto(s.h.h, s.fixtures, s.token);
  const res = await call(s.h.h, 'POST', '/contributions', {
    token: s.token,
    key,
    body: {
      actionType,
      description: 'Reciclado de envases en el contenedor amarillo',
      municipalityCode: MUNICIPALITY_CODE,
      photoPath,
      captureOrigin: 'CAMERA_FLOW',
    },
  });
  assertEquals(res.status, 202);
  const { id } = await res.json();
  s.fixtures.trackObject(PUBLISHED_BUCKET, `${id}/1`);
  s.fixtures.trackObject(PUBLISHED_BUCKET, `${id}/2`);
  return { id, photoPath, key };
}

// deno-lint-ignore no-explicit-any
async function getDto(s: Scenario, id: string, token = s.token): Promise<any> {
  const res = await call(s.h.h, 'GET', `/contributions/${id}`, { token });
  assertEquals(res.status, 200);
  return await res.json();
}

async function publishedFiles(s: Scenario, id: string): Promise<string[]> {
  const { data, error } = await s.fixtures.db.storage.from(PUBLISHED_BUCKET).list(id);
  if (error) throw new Error(`list failed: ${error.message}`);
  return data.map((o) => o.name);
}

interface Scenario {
  fixtures: TestFixtures;
  h: Harness;
  token: string;
  userId: string;
}

async function withScenario(fn: (s: Scenario) => Promise<void>): Promise<void> {
  const fixtures = new TestFixtures();
  try {
    await fixtures.ensureMunicipality();
    const user = await fixtures.createUser();
    const token = await tokenFor(fixtures, user);
    await fn({ fixtures, h: harness(), token, userId: user.id });
  } finally {
    await fixtures.cleanup();
  }
}

Deno.test({
  name: 'create -> worker APPROVED -> GET shows points, no internals, published copy exists',
  ignore,
  async fn() {
    await withScenario(async (s) => {
      const first = await createContribution(s, 'RECYCLING');
      const pending = await getDto(s, first.id);
      assertEquals(pending.status, 'PENDING');
      assertEquals(pending.effectivePoints, 0);
      assertEquals(pending.canCancel, true);
      assertEquals(pending.canRetry, false);

      assertEquals(await s.h.settle(), ['APPROVED']);
      const dto = await getDto(s, first.id);
      assertEquals(dto.status, 'APPROVED');
      assertEquals(dto.effectivePoints, 10);
      assertEquals(dto.canRetry, false);
      assertEquals(dto.canCancel, false);
      assertEquals(dto.canProvideEvidence, false);
      assertEquals(dto.isHidden, false);
      assert(dto.approvedAt);
      assertEquals(await publishedFiles(s, first.id), ['1']);
      for (const key of ['evidence_path', 'evidencePath', 'public_photo_path', 'publicPhotoPath', 'validation_version', 'validationVersion', 'processing_lease_until', 'idempotency_key']) {
        assert(!(key in dto), `DTO exposes internal field ${key}`);
      }
      assertEquals(
        Object.keys(dto).sort(),
        ['actionType', 'approvedAt', 'canCancel', 'canProvideEvidence', 'canRetry', 'effectivePoints', 'id', 'isHidden', 'reason', 'status', 'submittedAt'],
      );

      // A replayed create (same key) never launches a second worker.
      const callsBefore = s.h.validator.calls;
      const replay = await call(s.h.h, 'POST', '/contributions', {
        token: s.token,
        key: first.key,
        body: {
          actionType: 'RECYCLING',
          description: 'Reciclado de envases en el contenedor amarillo',
          municipalityCode: MUNICIPALITY_CODE,
          photoPath: first.photoPath,
          captureOrigin: 'CAMERA_FLOW',
        },
      });
      assertEquals(replay.status, 202);
      assertEquals(await s.h.settle(), []);
      assertEquals(s.h.validator.calls, callsBefore);

      const second = await createContribution(s, 'LITTER_COLLECTION');
      assertEquals(await s.h.settle(), ['APPROVED']);
      assertEquals((await getDto(s, second.id)).effectivePoints, 20);
    });
  },
});

Deno.test({
  name: 'validator failure -> TECHNICAL_ERROR, retry -> new version -> APPROVED',
  ignore,
  async fn() {
    await withScenario(async (s) => {
      s.h.validator.next = () => Promise.reject(new Error('429 sk-secret'));
      const { id } = await createContribution(s);
      assertEquals(await s.h.settle(), ['TECHNICAL_ERROR']);
      const failed = await getDto(s, id);
      assertEquals(failed.status, 'TECHNICAL_ERROR');
      assertEquals(failed.canRetry, true);
      assertEquals(failed.effectivePoints, 0);
      assert(!JSON.stringify(failed).includes('secret'));
      assertEquals((await publishedFiles(s, id)).length, 0);

      s.h.validator.next = () => Promise.resolve({ decision: 'APPROVED', reason: 'Ahora sí' });
      const res = await call(s.h.h, 'POST', `/contributions/${id}/retry`, { token: s.token });
      assertEquals(res.status, 202);
      assertEquals((await res.json()).status, 'PENDING');
      const { data } = await s.fixtures.db.from('contributions').select('validation_version').eq('id', id).single();
      assertEquals(data?.validation_version, 2);

      assertEquals(await s.h.settle(), ['APPROVED']);
      assertEquals((await getDto(s, id)).status, 'APPROVED');
      assertEquals(await publishedFiles(s, id), ['2']);
    });
  },
});

Deno.test({
  name: 'NEEDS_EVIDENCE -> evidence with a new photo -> PENDING -> APPROVED, submittedAt unchanged',
  ignore,
  async fn() {
    await withScenario(async (s) => {
      s.h.validator.next = () => Promise.resolve({ decision: 'NEEDS_EVIDENCE', reason: 'No se ve el contenedor' });
      const { id } = await createContribution(s);
      assertEquals(await s.h.settle(), ['NEEDS_EVIDENCE']);
      const needs = await getDto(s, id);
      assertEquals(needs.status, 'NEEDS_EVIDENCE');
      assertEquals(needs.canProvideEvidence, true);
      assertEquals(needs.reason, 'No se ve el contenedor');

      s.h.validator.next = () => Promise.resolve({ decision: 'APPROVED', reason: 'Ahora se ve' });
      const photoPath = await uploadPhoto(s.h.h, s.fixtures, s.token);
      const res = await call(s.h.h, 'POST', `/contributions/${id}/evidence`, {
        token: s.token,
        body: { photoPath, captureOrigin: 'CAMERA_FLOW' },
      });
      assertEquals(res.status, 202);
      const pending = await res.json();
      assertEquals(pending.status, 'PENDING');
      assertEquals(pending.submittedAt, needs.submittedAt);

      // Same evidence repeated: current state, no second worker.
      const repeat = await call(s.h.h, 'POST', `/contributions/${id}/evidence`, {
        token: s.token,
        body: { photoPath, captureOrigin: 'CAMERA_FLOW' },
      });
      assertEquals(repeat.status, 202);

      assertEquals(await s.h.settle(), ['APPROVED']);
      const done = await getDto(s, id);
      assertEquals(done.status, 'APPROVED');
      assertEquals(done.submittedAt, needs.submittedAt);
      assertEquals(done.effectivePoints, 10);
    });
  },
});

Deno.test({
  name: 'cancel while a slow worker runs -> CANCELLED, worker SKIPPED, no approval and no copy',
  ignore,
  async fn() {
    await withScenario(async (s) => {
      const gate = Promise.withResolvers<Verdict>();
      s.h.validator.next = () => gate.promise;
      const { id } = await createContribution(s);
      await s.h.validator.entered.promise;

      const cancel = await call(s.h.h, 'POST', `/contributions/${id}/cancel`, { token: s.token });
      assertEquals(cancel.status, 200);
      assertEquals((await cancel.json()).status, 'CANCELLED');

      gate.resolve({ decision: 'APPROVED', reason: 'Tarde' });
      assertEquals(await s.h.settle(), ['SKIPPED']);
      const dto = await getDto(s, id);
      assertEquals(dto.status, 'CANCELLED');
      assertEquals(dto.effectivePoints, 0);
      assertEquals((await publishedFiles(s, id)).length, 0);

      // Repeated cancel is idempotent.
      const again = await call(s.h.h, 'POST', `/contributions/${id}/cancel`, { token: s.token });
      assertEquals(again.status, 200);
      assertEquals((await again.json()).status, 'CANCELLED');
    });
  },
});

Deno.test({
  name: 'cancel on APPROVED -> 409; retry on PENDING with a live lease -> 202 current state',
  ignore,
  async fn() {
    await withScenario(async (s) => {
      const gate = Promise.withResolvers<Verdict>();
      s.h.validator.next = () => gate.promise;
      const { id } = await createContribution(s);
      await s.h.validator.entered.promise;

      const retry = await call(s.h.h, 'POST', `/contributions/${id}/retry`, { token: s.token });
      assertEquals(retry.status, 202);
      assertEquals((await retry.json()).status, 'PENDING');
      const { data } = await s.fixtures.db.from('contributions').select('validation_version').eq('id', id).single();
      assertEquals(data?.validation_version, 1);

      gate.resolve({ decision: 'APPROVED', reason: 'Bien' });
      assertEquals(await s.h.settle(), ['APPROVED']);

      const cancel = await call(s.h.h, 'POST', `/contributions/${id}/cancel`, { token: s.token });
      assertEquals(cancel.status, 409);
      assertEquals((await cancel.json()).error.code, 'INVALID_STATE');

      const retryApproved = await call(s.h.h, 'POST', `/contributions/${id}/retry`, { token: s.token });
      assertEquals(retryApproved.status, 409);
    });
  },
});

Deno.test({
  name: 'another user gets 404 on GET, cancel, retry and evidence; no token gets 401',
  ignore,
  async fn() {
    await withScenario(async (s) => {
      const { id } = await createContribution(s);
      await s.h.settle();
      const other = await s.fixtures.createUser();
      const otherToken = await tokenFor(s.fixtures, other);
      const photoPath = await uploadPhoto(s.h.h, s.fixtures, otherToken);

      const get = await call(s.h.h, 'GET', `/contributions/${id}`, { token: otherToken });
      assertEquals(get.status, 404);
      assertEquals((await get.json()).error.code, 'NOT_FOUND');
      for (const action of ['cancel', 'retry']) {
        const res = await call(s.h.h, 'POST', `/contributions/${id}/${action}`, { token: otherToken });
        assertEquals(res.status, 404, action);
        await res.body?.cancel();
      }
      const evidence = await call(s.h.h, 'POST', `/contributions/${id}/evidence`, {
        token: otherToken,
        body: { photoPath, captureOrigin: 'CAMERA_FLOW' },
      });
      assertEquals(evidence.status, 404);
      await evidence.body?.cancel();

      const anonymous = await call(s.h.h, 'GET', `/contributions/${id}`);
      assertEquals(anonymous.status, 401);
      await anonymous.body?.cancel();

      // The author's contribution is untouched.
      assertEquals((await getDto(s, id)).status, 'APPROVED');
      const unknown = await call(s.h.h, 'GET', `/contributions/${crypto.randomUUID()}`, { token: s.token });
      assertEquals(unknown.status, 404);
      await unknown.body?.cancel();
      const malformed = await call(s.h.h, 'GET', '/contributions/not-a-uuid', { token: s.token });
      assertEquals(malformed.status, 404);
      await malformed.body?.cancel();
    });
  },
});
