import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { createHandler, handler as productionHandler } from '../../supabase/functions/api/index.ts';
import { createSupabaseTokenVerifier } from '../../supabase/functions/api/domain/auth.ts';
import { createServiceClient } from '../../supabase/functions/api/domain/db.ts';
import type { EvidenceInspection, EvidenceInspector } from '../../supabase/functions/api/domain/ports.ts';
import { contributionRoutes } from '../../supabase/functions/api/routes/contributions.ts';
import { uploadRoutes } from '../../supabase/functions/api/routes/uploads.ts';
import { anonClient, hasDbEnv, MUNICIPALITY_CODE, TestFixtures } from '../db/support.ts';

const BASE = 'https://proj.supabase.co';
const ignore = !hasDbEnv();
const BUCKET = 'evidence-private';

type Handler = (req: Request) => Promise<Response>;

interface FakeInspector extends EvidenceInspector {
  calls: number;
  result: EvidenceInspection;
}

function fakeInspector(result: EvidenceInspection = { ok: true, mime: 'image/jpeg', captureExifAt: null }): FakeInspector {
  const fake: FakeInspector = {
    calls: 0,
    result,
    inspect() {
      fake.calls++;
      return fake.result;
    },
  };
  return fake;
}

function buildHandler(inspector: EvidenceInspector): Handler {
  const deps = { verifier: createSupabaseTokenVerifier(), db: createServiceClient };
  return createHandler([...uploadRoutes(deps), ...contributionRoutes({ ...deps, inspector })]);
}

function send(h: Handler, path: string, opts: { token?: string; key?: string; body?: unknown }): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.token) headers.set('Authorization', `Bearer ${opts.token}`);
  if (opts.key) headers.set('Idempotency-Key', opts.key);
  return h(
    new Request(`${BASE}/api/v1${path}`, {
      method: 'POST',
      headers,
      body: typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body ?? {}),
    }),
  );
}

async function tokenFor(fixtures: TestFixtures, user: { id: string; email: string }): Promise<string> {
  const client = await fixtures.signInAs(user);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('fixture sign-in did not return an access token');
  return session.access_token;
}

/** Real flow: POST /uploads for a token, then upload a tiny JPEG with uploadToSignedUrl. */
async function uploadPhoto(h: Handler, fixtures: TestFixtures, token: string): Promise<string> {
  const res = await send(h, '/uploads', { token, body: { contentType: 'image/jpeg', sizeBytes: 4 } });
  assertEquals(res.status, 201);
  const { photoPath, uploadToken } = await res.json();
  const { error } = await anonClient().storage.from(BUCKET).uploadToSignedUrl(
    photoPath,
    uploadToken,
    new Blob(['jpeg'], { type: 'image/jpeg' }),
    { contentType: 'image/jpeg' },
  );
  assertEquals(error, null);
  fixtures.trackObject(BUCKET, photoPath);
  return photoPath;
}

function createBody(photoPath: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actionType: 'RECYCLING',
    description: 'Reciclado de envases en el contenedor amarillo',
    municipalityCode: MUNICIPALITY_CODE,
    photoPath,
    captureOrigin: 'CAMERA_FLOW',
    ...overrides,
  };
}

async function errorOf(res: Response): Promise<{ code: string; details: Record<string, unknown> }> {
  return (await res.json()).error;
}

async function countRows(fixtures: TestFixtures, authorId: string): Promise<number> {
  const { data, error } = await fixtures.db.from('contributions').select('id').eq('author_id', authorId);
  if (error) throw new Error(`count failed: ${error.message}`);
  return data.length;
}

/** Server clock (ms) from the PostgREST `Date` header: the DB decides the cooldown with its own now(). */
async function serverNowMs(): Promise<number> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/`, {
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')! },
  });
  await res.body?.cancel();
  const header = res.headers.get('Date');
  assert(header, 'PostgREST response has no Date header');
  return new Date(header).getTime();
}

interface Scenario {
  fixtures: TestFixtures;
  inspector: FakeInspector;
  h: Handler;
  userId: string;
  token: string;
}

async function withScenario(fn: (s: Scenario) => Promise<void>, inspector = fakeInspector()): Promise<void> {
  const fixtures = new TestFixtures();
  try {
    await fixtures.ensureMunicipality();
    const user = await fixtures.createUser();
    const token = await tokenFor(fixtures, user);
    await fn({ fixtures, inspector, h: buildHandler(inspector), userId: user.id, token });
  } finally {
    await fixtures.cleanup();
  }
}

Deno.test({
  name: 'POST /contributions creates a PENDING contribution and replays by idempotency key',
  ignore,
  fn: () =>
    withScenario(async ({ fixtures, inspector, h, userId, token }) => {
      const photoPath = await uploadPhoto(h, fixtures, token);
      const key = crypto.randomUUID();
      const first = await send(h, '/contributions', { token, key, body: createBody(photoPath) });
      assertEquals(first.status, 202);
      const created = await first.json();
      assertMatch(created.id, /^[0-9a-f-]{36}$/);
      assertEquals(created.status, 'PENDING');
      assertEquals(created.pointsIfApproved, 10);
      assert(!Number.isNaN(new Date(created.submittedAt).getTime()));
      assertEquals(inspector.calls, 1);

      const replay = await send(h, '/contributions', { token, key, body: createBody(photoPath) });
      assertEquals(replay.status, 202);
      assertEquals(await replay.json(), created);
      assertEquals(inspector.calls, 1, 'replay must not re-inspect the photo');
      assertEquals(await countRows(fixtures, userId), 1);

      const conflict = await send(h, '/contributions', {
        token,
        key,
        body: createBody(photoPath, { description: 'Otra descripción distinta' }),
      });
      assertEquals(conflict.status, 409);
      assertEquals((await errorOf(conflict)).code, 'IDEMPOTENCY_CONFLICT');
      assertEquals(inspector.calls, 1);
    }),
});

Deno.test({
  name: 'POST /contributions gives 20 points for LITTER_COLLECTION',
  ignore,
  fn: () =>
    withScenario(async ({ fixtures, h, token }) => {
      const photoPath = await uploadPhoto(h, fixtures, token);
      const res = await send(h, '/contributions', {
        token,
        key: crypto.randomUUID(),
        body: createBody(photoPath, { actionType: 'LITTER_COLLECTION' }),
      });
      assertEquals(res.status, 202);
      assertEquals((await res.json()).pointsIfApproved, 20);
    }),
});

Deno.test({
  name: 'POST /contributions request validation and authorization',
  ignore,
  fn: () =>
    withScenario(async ({ fixtures, inspector, h, userId, token }) => {
      const photoPath = await uploadPhoto(h, fixtures, token);

      const noKey = await send(h, '/contributions', { token, body: createBody(photoPath) });
      assertEquals(noKey.status, 400);
      const noKeyError = await errorOf(noKey);
      assertEquals(noKeyError.code, 'INVALID_REQUEST');
      assertEquals(noKeyError.details.field, 'Idempotency-Key');

      const badJson = await send(h, '/contributions', { token, key: crypto.randomUUID(), body: '{not json' });
      assertEquals(badJson.status, 400);
      assertEquals((await errorOf(badJson)).code, 'INVALID_REQUEST');

      const noToken = await send(h, '/contributions', { key: crypto.randomUUID(), body: createBody(photoPath) });
      assertEquals(noToken.status, 401);

      const other = await fixtures.createUser();
      const otherToken = await tokenFor(fixtures, other);
      const notOwner = await send(h, '/contributions', {
        token: otherToken,
        key: crypto.randomUUID(),
        body: createBody(photoPath),
      });
      assertEquals(notOwner.status, 403);
      assertEquals((await errorOf(notOwner)).code, 'NOT_OWNER');

      const missing = await send(h, '/contributions', {
        token,
        key: crypto.randomUUID(),
        body: createBody(`staging/${userId}/${crypto.randomUUID()}`),
      });
      assertEquals(missing.status, 422);
      assertEquals((await errorOf(missing)).code, 'PHOTO_NOT_FOUND');

      const badMunicipality = await send(h, '/contributions', {
        token,
        key: crypto.randomUUID(),
        body: createBody(photoPath, { municipalityCode: '28079' }),
      });
      assertEquals(badMunicipality.status, 422);
      assertEquals((await errorOf(badMunicipality)).code, 'INVALID_MUNICIPALITY');

      assertEquals(inspector.calls, 1, 'only the INVALID_MUNICIPALITY request reached the inspector');
      assertEquals(await countRows(fixtures, userId), 0);
    }),
});

Deno.test({
  name: 'POST /contributions requires a profile',
  ignore,
  fn: async () => {
    const fixtures = new TestFixtures();
    try {
      const user = await fixtures.createAuthUser();
      const token = await tokenFor(fixtures, user);
      const res = await send(buildHandler(fakeInspector()), '/contributions', {
        token,
        key: crypto.randomUUID(),
        body: createBody(`staging/${user.id}/${crypto.randomUUID()}`),
      });
      assertEquals(res.status, 403);
      assertEquals((await errorOf(res)).code, 'PROFILE_REQUIRED');
    } finally {
      await fixtures.cleanup();
    }
  },
});

Deno.test({
  name: 'POST /contributions maps inspector rejections to 422 and creates nothing',
  ignore,
  fn: () =>
    withScenario(async ({ fixtures, h, userId, token }) => {
      const photoPath = await uploadPhoto(h, fixtures, token);
      const res = await send(h, '/contributions', {
        token,
        key: crypto.randomUUID(),
        body: createBody(photoPath, { captureOrigin: 'GALLERY' }),
      });
      assertEquals(res.status, 422);
      assertEquals((await errorOf(res)).code, 'EXIF_REQUIRED');
      assertEquals(await countRows(fixtures, userId), 0);
    }, fakeInspector({ ok: false, code: 'EXIF_REQUIRED' })),
});

Deno.test({
  name: 'POST /contributions enforces one pending per type and one contribution per photo',
  ignore,
  fn: () =>
    withScenario(async ({ fixtures, h, token }) => {
      const photoPath = await uploadPhoto(h, fixtures, token);
      const first = await send(h, '/contributions', { token, key: crypto.randomUUID(), body: createBody(photoPath) });
      assertEquals(first.status, 202);

      const secondPhoto = await uploadPhoto(h, fixtures, token);
      const pending = await send(h, '/contributions', {
        token,
        key: crypto.randomUUID(),
        body: createBody(secondPhoto),
      });
      assertEquals(pending.status, 409);
      assertEquals((await errorOf(pending)).code, 'PENDING_CONTRIBUTION_EXISTS');

      const reused = await send(h, '/contributions', {
        token,
        key: crypto.randomUUID(),
        body: createBody(photoPath, { actionType: 'LITTER_COLLECTION' }),
      });
      assertEquals(reused.status, 409);
      assertEquals((await errorOf(reused)).code, 'PHOTO_ALREADY_USED');
    }),
});

Deno.test({
  name: 'POST /contributions returns COOLDOWN_ACTIVE with retryAt after a recent APPROVED',
  ignore,
  fn: () =>
    withScenario(async ({ fixtures, h, userId, token }) => {
      const at = new Date((await serverNowMs()) - 30 * 60_000).toISOString();
      const { error } = await fixtures.db.from('contributions').insert(
        fixtures.contributionRow(userId, {
          status: 'APPROVED',
          submitted_at: at,
          approved_at: at,
          public_photo_path: `public/${userId}/${crypto.randomUUID()}.jpg`,
        }),
      );
      assertEquals(error, null);

      const photoPath = await uploadPhoto(h, fixtures, token);
      const res = await send(h, '/contributions', { token, key: crypto.randomUUID(), body: createBody(photoPath) });
      assertEquals(res.status, 409);
      const body = await errorOf(res);
      assertEquals(body.code, 'COOLDOWN_ACTIVE');
      assertEquals(typeof body.details.retryAt, 'string');
      const retryMs = new Date(body.details.retryAt as string).getTime();
      assert(Math.abs(retryMs - (new Date(at).getTime() + 60 * 60_000)) < 60_000);
    }),
});

Deno.test({
  name: 'production handler fails closed without an EXIF inspector and creates no row',
  ignore,
  fn: () =>
    withScenario(async ({ fixtures, h, userId, token }) => {
      const photoPath = await uploadPhoto(h, fixtures, token);
      const res = await send(productionHandler, '/contributions', {
        token,
        key: crypto.randomUUID(),
        body: createBody(photoPath),
      });
      assertEquals(res.status, 500);
      assertEquals((await errorOf(res)).code, 'INTERNAL');
      assertEquals(await countRows(fixtures, userId), 0);
    }),
});
