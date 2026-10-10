// T21 — Turnstile verifier and POST /reports.
// The verifier talks to Cloudflare with the OFFICIAL dummy secrets (injected here, never from
// .env.test): https://developers.cloudflare.com/turnstile/troubleshooting/testing/
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { createHandler } from '../../supabase/functions/api/index.ts';
import { createSupabaseTokenVerifier } from '../../supabase/functions/api/domain/auth.ts';
import { createServiceClient } from '../../supabase/functions/api/domain/db.ts';
import { createTurnstileVerifier } from '../../supabase/functions/api/domain/turnstile.ts';
import { communityRoutes } from '../../supabase/functions/api/routes/community.ts';
import { hasDbEnv, TestFixtures } from '../db/support.ts';

const BASE = 'https://proj.supabase.co';
const ignore = !hasDbEnv();

const SECRET_PASS = '1x0000000000000000000000000000000AA';
const SECRET_FAIL = '2x0000000000000000000000000000000AA';
const SECRET_SPENT = '3x0000000000000000000000000000000AA';
const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

type Handler = (req: Request) => Promise<Response>;

Deno.test('turnstile verifier: official dummy secrets decide the result', async () => {
  assertEquals(await createTurnstileVerifier(SECRET_PASS).verify(DUMMY_TOKEN), true);
  assertEquals(await createTurnstileVerifier(SECRET_FAIL).verify(DUMMY_TOKEN), false);
  assertEquals(await createTurnstileVerifier(SECRET_SPENT).verify(DUMMY_TOKEN), false);
});

Deno.test('turnstile verifier: empty token, network error, non-OK and odd JSON fail closed', async () => {
  let calls = 0;
  const fake = (response: () => Promise<Response>): typeof fetch =>
    ((_input: unknown, _init?: unknown) => {
      calls++;
      return response();
    }) as unknown as typeof fetch;

  assertEquals(await createTurnstileVerifier(SECRET_PASS, fake(() => Promise.reject(new Error('down')))).verify('x'), false);
  assertEquals(
    await createTurnstileVerifier(SECRET_PASS, fake(() => Promise.resolve(new Response('{"success":true}', { status: 500 })))).verify('x'),
    false,
  );
  assertEquals(
    await createTurnstileVerifier(SECRET_PASS, fake(() => Promise.resolve(new Response('<html>')))).verify('x'),
    false,
  );
  for (const body of ['null', '[]', '{"success":"true"}', '{"success":1}', '{}']) {
    assertEquals(
      await createTurnstileVerifier(SECRET_PASS, fake(() => Promise.resolve(new Response(body)))).verify('x'),
      false,
      body,
    );
  }
  assertEquals(
    await createTurnstileVerifier(SECRET_PASS, fake(() => Promise.resolve(new Response('{"success":true}')))).verify('x'),
    true,
  );

  const before = calls;
  assertEquals(await createTurnstileVerifier(SECRET_PASS, fake(() => Promise.resolve(new Response('{"success":true}')))).verify(''), false);
  assertEquals(calls, before, 'an empty token never reaches Cloudflare');
});

function handlerFor(secret: string, key: string): Handler {
  return createHandler(communityRoutes({
    verifier: createSupabaseTokenVerifier(),
    db: createServiceClient,
    turnstile: createTurnstileVerifier(secret),
    rateKey: () => Promise.resolve(key),
  }));
}

function post(h: Handler, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return h(
    new Request(`${BASE}/api/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

async function seed(f: TestFixtures, authorId: string, overrides: Record<string, unknown> = {}, action: 'RECYCLING' | 'LITTER_COLLECTION' = 'RECYCLING'): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await f.db.from('contributions').insert(
    f.contributionRow(authorId, {
      action_type: action,
      points_snapshot: action === 'RECYCLING' ? 10 : 20,
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

async function withScenario(
  fn: (f: TestFixtures, key: string, authorId: string) => Promise<void>,
): Promise<void> {
  const f = new TestFixtures();
  const key = `t21-${crypto.randomUUID().replaceAll('-', '')}`;
  try {
    await f.ensureMunicipality();
    const author = await f.createUser();
    await fn(f, key, author.id);
  } finally {
    await f.db.from('rate_limits').delete().like('bucket', `report:${key}%`);
    await f.cleanup();
  }
}

async function rows(f: TestFixtures, id: string): Promise<number> {
  const { data, error } = await f.db.from('reports').select('id').eq('contribution_id', id);
  if (error) throw new Error(error.message);
  return data.length;
}

async function limitRows(f: TestFixtures, key: string): Promise<number> {
  const { data, error } = await f.db.from('rate_limits').select('bucket').like('bucket', `report:${key}%`);
  if (error) throw new Error(error.message);
  return data.length;
}

Deno.test({
  name: 'POST /reports: valid token -> 202 {accepted:true} and a private row; reveals nothing else',
  ignore,
  fn: () => withScenario(async (f, key, authorId) => {
    const id = await seed(f, authorId);
    const res = await post(handlerFor(SECRET_PASS, key), {
      contributionId: id,
      reason: '  Contiene un rostro identificable ',
      turnstileToken: DUMMY_TOKEN,
    }, { 'x-forwarded-for': '203.0.113.7' });
    assertEquals(res.status, 202);
    const text = await res.text();
    assertEquals(JSON.parse(text), { accepted: true });
    assert(!text.includes(id) && !text.includes(key) && !text.includes('203.0.113.7'));
    const { data } = await f.db.from('reports').select('reason').eq('contribution_id', id);
    assertEquals(data, [{ reason: 'Contiene un rostro identificable' }]);
  }),
});

Deno.test({
  name: 'POST /reports: empty, missing or rejected token -> 403 CAPTCHA_FAILED with no report and no rate-limit row',
  ignore,
  fn: () => withScenario(async (f, key, authorId) => {
    const id = await seed(f, authorId);
    const base = { contributionId: id, reason: 'Motivo' };
    const cases: [Handler, Record<string, unknown>][] = [
      [handlerFor(SECRET_PASS, key), { ...base, turnstileToken: '' }],
      [handlerFor(SECRET_PASS, key), base],
      [handlerFor(SECRET_PASS, key), { ...base, turnstileToken: 42 }],
      [handlerFor(SECRET_FAIL, key), { ...base, turnstileToken: DUMMY_TOKEN }],
      [handlerFor(SECRET_SPENT, key), { ...base, turnstileToken: DUMMY_TOKEN }],
    ];
    for (const [h, body] of cases) {
      const res = await post(h, body);
      assertEquals(res.status, 403);
      assertEquals((await res.json()).error.code, 'CAPTCHA_FAILED');
    }
    assertEquals(await rows(f, id), 0);
    assertEquals(await limitRows(f, key), 0);
  }),
});

Deno.test({
  name: 'POST /reports: bad body -> 400 with details.field, before Turnstile and the database',
  ignore,
  fn: () => withScenario(async (f, key, authorId) => {
    const id = await seed(f, authorId);
    // Verifier that would fail the test if it were reached for a malformed request.
    const h = createHandler(communityRoutes({
      verifier: createSupabaseTokenVerifier(),
      db: createServiceClient,
      turnstile: { verify: () => Promise.reject(new Error('Turnstile must not be called')) },
      rateKey: () => Promise.resolve(key),
    }));
    const token = DUMMY_TOKEN;
    const cases: [unknown, string | null][] = [
      [{ contributionId: id, reason: '', turnstileToken: token }, 'reason'],
      [{ contributionId: id, reason: '   ', turnstileToken: token }, 'reason'],
      [{ contributionId: id, reason: 'a'.repeat(501), turnstileToken: token }, 'reason'],
      [{ contributionId: id, turnstileToken: token }, 'reason'],
      [{ contributionId: 'not-a-uuid', reason: 'x', turnstileToken: token }, 'contributionId'],
      [{ reason: 'x', turnstileToken: token }, 'contributionId'],
      ['{not json', null],
      ['[]', null],
    ];
    for (const [body, field] of cases) {
      const res = await post(h, body);
      assertEquals(res.status, 400);
      const error = (await res.json()).error;
      assertEquals(error.code, 'INVALID_REQUEST');
      if (field !== null) assertEquals(error.details.field, field);
    }
    assertEquals(await rows(f, id), 0);
    assertEquals(await limitRows(f, key), 0);
  }),
});

Deno.test({
  name: 'POST /reports: hidden, pending or unknown target -> 202 without a row',
  ignore,
  fn: () => withScenario(async (f, key, authorId) => {
    const hidden = await seed(f, authorId, { hidden_at: new Date().toISOString() });
    const pending = await seed(f, authorId, { status: 'PENDING', approved_at: null, public_photo_path: null }, 'LITTER_COLLECTION');
    const h = handlerFor(SECRET_PASS, key);
    for (const id of [hidden, pending, crypto.randomUUID()]) {
      const res = await post(h, { contributionId: id, reason: 'Motivo', turnstileToken: DUMMY_TOKEN });
      assertEquals(res.status, 202);
      assertEquals(await res.json(), { accepted: true });
    }
    assertEquals(await rows(f, hidden), 0);
    assertEquals(await rows(f, pending), 0);
    const { data } = await f.db.from('rate_limits').select('hits').eq('bucket', `report:${key}`);
    assertEquals(data?.[0]?.hits, 3, 'attempts on non visible targets consume rate limit');
  }),
});

Deno.test({
  name: 'POST /reports: 4th on one contribution and 6th overall -> 429 RATE_LIMITED; another key still works',
  ignore,
  fn: () => withScenario(async (f, key, authorId) => {
    const first = await seed(f, authorId);
    const second = await seed(f, authorId, {}, 'LITTER_COLLECTION');
    const h = handlerFor(SECRET_PASS, key);
    const send = (contributionId: string, handler: Handler = h) =>
      post(handler, { contributionId, reason: 'Motivo', turnstileToken: DUMMY_TOKEN });

    for (let i = 0; i < 3; i++) assertEquals((await send(first)).status, 202);
    const pair = await send(first);
    assertEquals(pair.status, 429);
    const pairText = await pair.text();
    assertEquals(JSON.parse(pairText).error.code, 'RATE_LIMITED');
    assert(!pairText.includes(first) && !pairText.includes(key));

    for (let i = 0; i < 2; i++) assertEquals((await send(second)).status, 202);
    const overall = await send(second);
    assertEquals(overall.status, 429);
    assertEquals((await overall.json()).error.code, 'RATE_LIMITED');
    assertEquals(await rows(f, first), 3);
    assertEquals(await rows(f, second), 2);

    const otherKey = `${key}-other`;
    try {
      assertEquals((await send(first, handlerFor(SECRET_PASS, otherKey))).status, 202);
      assertEquals(await rows(f, first), 4);
    } finally {
      await f.db.from('rate_limits').delete().like('bucket', `report:${otherKey}%`);
    }
  }),
});

Deno.test({
  name: 'POST /reports fails closed (500, no row) when TURNSTILE_SECRET_KEY or REPORT_RATE_SALT is missing',
  ignore,
  fn: () => withScenario(async (f, _key, authorId) => {
    const id = await seed(f, authorId);
    const names = ['TURNSTILE_SECRET_KEY', 'REPORT_RATE_SALT'];
    const saved = names.map((n) => [n, Deno.env.get(n)] as const);
    const body = { contributionId: id, reason: 'Motivo', turnstileToken: DUMMY_TOKEN };
    const h = createHandler(communityRoutes({ verifier: createSupabaseTokenVerifier(), db: createServiceClient }));
    try {
      // No secret at all: never skip verification.
      for (const n of names) Deno.env.delete(n);
      const noSecret = await post(h, body);
      assertEquals(noSecret.status, 500);
      assertEquals((await noSecret.json()).error.code, 'INTERNAL');

      // Dummy "always passes" secret but no salt: the rate key cannot be derived, so nothing is stored.
      Deno.env.set('TURNSTILE_SECRET_KEY', SECRET_PASS);
      const noSalt = await post(h, body);
      assertEquals(noSalt.status, 500);
      assertEquals(await rows(f, id), 0);
    } finally {
      for (const [n, v] of saved) {
        if (v === undefined) Deno.env.delete(n);
        else Deno.env.set(n, v);
      }
    }
  }),
});
