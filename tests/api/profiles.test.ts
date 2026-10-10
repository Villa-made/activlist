import { assert, assertEquals } from 'jsr:@std/assert@1';
import { handler } from '../../supabase/functions/api/index.ts';
import { hasDbEnv, randomSuffix, TestFixtures } from '../db/support.ts';

const BASE = 'https://proj.supabase.co';
const ignore = !hasDbEnv();

async function tokenFor(fixtures: TestFixtures, user: { id: string; email: string }): Promise<string> {
  const client = await fixtures.signInAs(user);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('fixture sign-in did not return an access token');
  return session.access_token;
}

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

async function errorCode(response: Response, status: number, code: string): Promise<void> {
  assertEquals(response.status, status);
  assertEquals((await response.json()).error.code, code);
}

Deno.test({
  name: 'POST /profiles trims aliases and derives the profile user from the token',
  ignore,
  fn: async () => {
    const fixtures = new TestFixtures();
    try {
      const user = await fixtures.createAuthUser();
      const response = await request('POST', '/profiles', await tokenFor(fixtures, user), {
        alias: '  EcoX123  ', adultDeclared: true, userId: crypto.randomUUID(), email: user.email,
      });
      assertEquals(response.status, 201);
      const body = await response.json();
      assertEquals(body, { userId: user.id, alias: 'EcoX123' });
      assertEquals(JSON.stringify(body).includes(user.email), false);
    } finally {
      await fixtures.cleanup();
    }
  },
});

Deno.test({
  name: 'POST /profiles rejects aliases case-insensitively and concurrent duplicates leave one profile',
  ignore,
  fn: async () => {
    const fixtures = new TestFixtures();
    try {
      const first = await fixtures.createAuthUser();
      const second = await fixtures.createAuthUser();
      const alias = `EcoDup${randomSuffix()}`;
      assertEquals((await request('POST', '/profiles', await tokenFor(fixtures, first), { alias, adultDeclared: true })).status, 201);
      await errorCode(await request('POST', '/profiles', await tokenFor(fixtures, second), { alias: alias.toLowerCase(), adultDeclared: true }), 409, 'ALIAS_TAKEN');

      const third = await fixtures.createAuthUser();
      const fourth = await fixtures.createAuthUser();
      const concurrentAlias = `EcoRace${randomSuffix()}`;
      const responses = await Promise.all([
        request('POST', '/profiles', await tokenFor(fixtures, third), { alias: concurrentAlias, adultDeclared: true }),
        request('POST', '/profiles', await tokenFor(fixtures, fourth), { alias: concurrentAlias.toLowerCase(), adultDeclared: true }),
      ]);
      assertEquals(responses.map((response) => response.status).sort(), [201, 409]);
    } finally {
      await fixtures.cleanup();
    }
  },
});

Deno.test({
  name: 'POST /profiles maps profile existence and validation errors to the contract',
  ignore,
  fn: async () => {
    const fixtures = new TestFixtures();
    try {
      const user = await fixtures.createAuthUser();
      const token = await tokenFor(fixtures, user);
      assertEquals((await request('POST', '/profiles', token, { alias: `Eco${randomSuffix()}`, adultDeclared: true })).status, 201);
      await errorCode(await request('POST', '/profiles', token, { alias: `Other${randomSuffix()}`, adultDeclared: true }), 409, 'PROFILE_EXISTS');
      for (const alias of ['ab', 'Eco Usuario', 'Ecó', 'a'.repeat(25)]) {
        await errorCode(await request('POST', '/profiles', token, { alias, adultDeclared: true }), 422, 'INVALID_ALIAS');
      }
      await errorCode(await request('POST', '/profiles', token, { alias: 'EcoValid', adultDeclared: false }), 422, 'ADULT_DECLARATION_REQUIRED');
      await errorCode(await request('POST', '/profiles', token, { alias: 'EcoValid', adultDeclared: 'true' }), 422, 'ADULT_DECLARATION_REQUIRED');
      await errorCode(await request('POST', '/profiles', token, 'no-json'), 400, 'INVALID_REQUEST');
      await errorCode(await request('POST', '/profiles', token, []), 400, 'INVALID_REQUEST');
    } finally {
      await fixtures.cleanup();
    }
  },
});

Deno.test({
  name: 'profile endpoints require a token and GET /profiles/me distinguishes missing profiles',
  ignore,
  fn: async () => {
    const fixtures = new TestFixtures();
    try {
      await errorCode(await request('POST', '/profiles', undefined, { alias: 'EcoValid', adultDeclared: true }), 401, 'AUTH_REQUIRED');
      await errorCode(await request('GET', '/profiles/me'), 401, 'AUTH_REQUIRED');

      const user = await fixtures.createAuthUser();
      const token = await tokenFor(fixtures, user);
      await errorCode(await request('GET', '/profiles/me', token), 404, 'PROFILE_REQUIRED');
      const alias = `Eco${randomSuffix()}`;
      assertEquals((await request('POST', '/profiles', token, { alias, adultDeclared: true })).status, 201);
      const own = await request('GET', '/profiles/me', token);
      assertEquals(own.status, 200);
      const text = await own.text();
      assertEquals(text.includes(user.email), false);
      assertEquals(JSON.parse(text), { userId: user.id, alias });
    } finally {
      await fixtures.cleanup();
    }
  },
});

Deno.test({
  name: 'global logout invalidates a retained access token',
  ignore,
  fn: async () => {
    const fixtures = new TestFixtures();
    try {
      const user = await fixtures.createUser();
      const client = await fixtures.signInAs(user);
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('fixture sign-in did not return an access token');
      const { error } = await client.auth.signOut({ scope: 'global' });
      if (error) throw new Error(`global sign-out failed: ${error.message}`);
      const response = await request('GET', '/profiles/me', session.access_token);
      await errorCode(response, 401, 'AUTH_REQUIRED');
    } finally {
      await fixtures.cleanup();
    }
  },
});
