import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { createHandler, type Route } from '../../supabase/functions/api/index.ts';
import { createSupabaseTokenVerifier, optionalUser, requireProfile, requireUser, type TokenVerifier } from '../../supabase/functions/api/domain/auth.ts';
import { createServiceClient } from '../../supabase/functions/api/domain/db.ts';
import { ApiError } from '../../supabase/functions/api/domain/http.ts';
import { anonClient, hasDbEnv, randomSuffix, TestFixtures } from '../db/support.ts';

const BASE = 'https://proj.supabase.co';
const ignore = !hasDbEnv();

const acceptedVerifier: TokenVerifier = {
  verify: (token: string) => Promise.resolve(token === 'valid-token' ? { userId: 'verified-user' } : null),
};

async function assertAuthRequired(operation: () => Promise<unknown>): Promise<void> {
  const error = await assertRejects(operation, ApiError) as ApiError;
  assertEquals(error.status, 401);
  assertEquals(error.code, 'AUTH_REQUIRED');
}

Deno.test('requireUser rejects a missing, malformed, or rejected bearer token', async () => {
  await assertAuthRequired(() => requireUser(new Request(`${BASE}/api/v1/profiles`), acceptedVerifier));
  await assertAuthRequired(() => requireUser(new Request(`${BASE}/api/v1/profiles`, {
    headers: { Authorization: 'Basic valid-token' },
  }), acceptedVerifier));
  await assertAuthRequired(() => requireUser(new Request(`${BASE}/api/v1/profiles`, {
    headers: { Authorization: 'Bearer rejected-token' },
  }), acceptedVerifier));
});

Deno.test('requireUser derives the user only from a verified bearer token', async () => {
  const req = new Request(`${BASE}/api/v1/profiles?userId=query-user`, {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'body-user' }),
  });
  assertEquals(await requireUser(req, acceptedVerifier), { userId: 'verified-user' });
});

Deno.test('optionalUser treats an invalid bearer token as anonymous', async () => {
  assertEquals(await optionalUser(new Request(`${BASE}/api/v1/feed`), acceptedVerifier), null);
  assertEquals(await optionalUser(new Request(`${BASE}/api/v1/feed`, {
    headers: { Authorization: 'Bearer rejected-token' },
  }), acceptedVerifier), null);
});

Deno.test('router serializes ApiError and keeps unexpected errors internal', async () => {
  const secret = 'access-token=secret-token-value';
  const routes: Route[] = [
    {
      method: 'GET',
      path: '/profile-required',
      handler: () => { throw new ApiError(403, 'PROFILE_REQUIRED', 'Completa tu perfil'); },
    },
    {
      method: 'GET',
      path: '/unexpected',
      handler: () => { throw new Error(secret); },
    },
  ];
  const handler = createHandler(routes);
  const originalError = console.error;
  console.error = () => {};
  try {
    const profileRequired = await handler(new Request(`${BASE}/api/v1/profile-required`));
    assertEquals(profileRequired.status, 403);
    assertEquals(await profileRequired.json(), {
      error: { code: 'PROFILE_REQUIRED', message: 'Completa tu perfil', details: {} },
    });

    const unexpected = await handler(new Request(`${BASE}/api/v1/unexpected`));
    const unexpectedText = await unexpected.text();
    assertEquals(unexpected.status, 500);
    assertEquals(unexpectedText.includes(secret), false);
    assertEquals(JSON.parse(unexpectedText).error.code, 'INTERNAL');
  } finally {
    console.error = originalError;
  }
});

Deno.test({
  name: 'real verifier validates DEV tokens and requireProfile reads only existing profiles',
  ignore,
  fn: async () => {
    const fixtures = new TestFixtures();
    let withoutProfileId: string | undefined;
    try {
      const withProfile = await fixtures.createUser();
      const signedIn = await fixtures.signInAs(withProfile);
      const { data: { session } } = await signedIn.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('fixture sign-in did not return an access token');

      const verifier = createSupabaseTokenVerifier();
      assertEquals(await verifier.verify(token), { userId: withProfile.id });
      const [header, payload, signature] = token.split('.');
      const alteredSignature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
      const alteredToken = `${header}.${payload}.${alteredSignature}`;
      assertEquals(await verifier.verify(alteredToken), null);
      assertEquals(await requireProfile(withProfile.id, createServiceClient()), {
        userId: withProfile.id,
        alias: withProfile.alias,
      });

      const email = `t04a-${randomSuffix()}@example.test`;
      const password = crypto.randomUUID();
      const { data, error } = await fixtures.db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`create unprofiled user failed: ${error?.message}`);
      withoutProfileId = data.user.id;
      const unsignedProfile = await assertRejects(
        () => requireProfile(withoutProfileId!, createServiceClient()),
        ApiError,
      ) as ApiError;
      assertEquals(unsignedProfile.status, 403);
      assertEquals(unsignedProfile.code, 'PROFILE_REQUIRED');
    } finally {
      if (withoutProfileId) await fixtures.db.auth.admin.deleteUser(withoutProfileId);
      await fixtures.cleanup();
    }
  },
});
