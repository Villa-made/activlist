import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { handler } from '../../supabase/functions/api/index.ts';
import { buildPhotoPath, parseUploadRequest } from '../../supabase/functions/api/domain/uploads.ts';
import { anonClient, hasDbEnv, TestFixtures } from '../db/support.ts';

const BASE = 'https://proj.supabase.co';
const ignore = !hasDbEnv();

function request(method: string, path: string, token?: string, body?: unknown): Promise<Response> {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return handler(new Request(`${BASE}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }));
}

async function tokenFor(fixtures: TestFixtures, user: { id: string; email: string }): Promise<string> {
  const client = await fixtures.signInAs(user);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('fixture sign-in did not return an access token');
  return session.access_token;
}

function assertApiError(action: () => unknown, status: number, code: string): void {
  try {
    action();
    throw new Error('expected an ApiError');
  } catch (error) {
    assertEquals((error as { status?: number }).status, status);
    assertEquals((error as { code?: string }).code, code);
  }
}

Deno.test('parseUploadRequest validates image MIME types and sizes', () => {
  assertApiError(() => parseUploadRequest({ contentType: 'text/plain', sizeBytes: 10 }), 422, 'UNSUPPORTED_MEDIA');
  assertApiError(() => parseUploadRequest({ contentType: 'image/jpeg', sizeBytes: 5_242_881 }), 413, 'IMAGE_TOO_LARGE');
  for (const sizeBytes of [0, -1, 1.5, '100']) {
    assertApiError(() => parseUploadRequest({ contentType: 'image/jpeg', sizeBytes }), 400, 'INVALID_REQUEST');
  }
  assertApiError(() => parseUploadRequest([]), 400, 'INVALID_REQUEST');
});

Deno.test('buildPhotoPath is server-generated and scoped to the authenticated user', () => {
  const userId = crypto.randomUUID();
  const photoPath = buildPhotoPath(userId);
  assertMatch(photoPath, new RegExp(`^staging/${userId}/[0-9a-f-]{36}$`));
  assertEquals(photoPath.includes('client-selected-path'), false);
});

Deno.test({
  name: 'POST /uploads issues a private upload token only to a profiled user',
  ignore,
  fn: async () => {
    const fixtures = new TestFixtures();
    try {
      const user = await fixtures.createUser();
      const token = await tokenFor(fixtures, user);
      const response = await request('POST', '/uploads', token, {
        contentType: 'image/jpeg', sizeBytes: 4, photoPath: 'client-selected-path',
      });
      assertEquals(response.status, 201);
      const body = await response.json();
      assertMatch(body.photoPath, new RegExp(`^staging/${user.id}/[0-9a-f-]{36}$`));
      assertEquals(body.photoPath.includes('client-selected-path'), false);
      assertEquals(typeof body.uploadToken, 'string');
      assertEquals(typeof body.expiresAt, 'string');

      const { error: uploadError } = await anonClient().storage.from('evidence-private').uploadToSignedUrl(
        body.photoPath,
        body.uploadToken,
        new Blob(['jpeg'], { type: 'image/jpeg' }),
        { contentType: 'image/jpeg' },
      );
      assertEquals(uploadError, null);
      fixtures.trackObject('evidence-private', body.photoPath);

      const { error: anonymousDownloadError } = await anonClient().storage.from('evidence-private').download(body.photoPath);
      assert(anonymousDownloadError !== null);
      const otherUser = await fixtures.createUser();
      const otherClient = await fixtures.signInAs(otherUser);
      const { error: otherDownloadError } = await otherClient.storage.from('evidence-private').download(body.photoPath);
      assert(otherDownloadError !== null);
    } finally {
      await fixtures.cleanup();
    }
  },
});

Deno.test({
  name: 'POST /uploads requires a session and a profile',
  ignore,
  fn: async () => {
    const fixtures = new TestFixtures();
    try {
      const noToken = await request('POST', '/uploads', undefined, { contentType: 'image/png', sizeBytes: 1 });
      assertEquals(noToken.status, 401);
      assertEquals((await noToken.json()).error.code, 'AUTH_REQUIRED');

      const withoutProfile = await fixtures.createAuthUser();
      const response = await request(
        'POST',
        '/uploads',
        await tokenFor(fixtures, withoutProfile),
        { contentType: 'image/png', sizeBytes: 1 },
      );
      assertEquals(response.status, 403);
      assertEquals((await response.json()).error.code, 'PROFILE_REQUIRED');
    } finally {
      await fixtures.cleanup();
    }
  },
});
