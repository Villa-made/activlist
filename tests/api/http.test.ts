import { assertEquals, assertExists, assertFalse } from 'jsr:@std/assert@1';
import { createHandler, handler } from '../../supabase/functions/api/index.ts';
import type { Route } from '../../supabase/functions/api/index.ts';
import { json } from '../../supabase/functions/api/domain/http.ts';

const ALLOWED = 'https://app.example.com';
// The platform strips /functions/v1: the function receives paths starting at /api/v1.
const BASE = 'https://proj.supabase.co';

function withAllowedOrigins<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const previous = Deno.env.get('ALLOWED_ORIGINS');
  if (value === undefined) Deno.env.delete('ALLOWED_ORIGINS');
  else Deno.env.set('ALLOWED_ORIGINS', value);
  return fn().finally(() => {
    if (previous === undefined) Deno.env.delete('ALLOWED_ORIGINS');
    else Deno.env.set('ALLOWED_ORIGINS', previous);
  });
}

Deno.test('unknown route returns 404 NOT_FOUND with the error format', async () => {
  const res = await handler(new Request(`${BASE}/api/v1/desconocido`));
  assertEquals(res.status, 404);
  assertEquals(res.headers.get('content-type')?.startsWith('application/json'), true);
  const body = await res.json();
  assertEquals(body.error.code, 'NOT_FOUND');
  assertEquals(typeof body.error.message, 'string');
  assertEquals(body.error.details, {});
});

Deno.test('path outside /api/v1 returns 404 NOT_FOUND', async () => {
  const res = await handler(new Request(`${BASE}/api/otra-cosa`));
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error.code, 'NOT_FOUND');
});

Deno.test('known path with a different method returns 404 NOT_FOUND', async () => {
  const routes: Route[] = [{ method: 'GET', path: '/ping', handler: () => json({ ok: true }) }];
  const res = await createHandler(routes)(new Request(`${BASE}/api/v1/ping`, { method: 'POST' }));
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error.code, 'NOT_FOUND');
});

Deno.test('registered route is served under the /api/v1 prefix', async () => {
  const routes: Route[] = [{ method: 'GET', path: '/ping', handler: () => json({ ok: true }) }];
  const res = await createHandler(routes)(new Request(`${BASE}/api/v1/ping`));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
});

Deno.test('preflight from an allowed origin returns CORS headers', () =>
  withAllowedOrigins(`${ALLOWED}, https://otro.example.com`, async () => {
    const res = await handler(
      new Request(`${BASE}/api/v1/contributions`, {
        method: 'OPTIONS',
        headers: {
          Origin: ALLOWED,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization, idempotency-key',
        },
      }),
    );
    assertEquals(res.status, 204);
    assertEquals(res.headers.get('access-control-allow-origin'), ALLOWED);
    assertEquals(res.headers.get('vary')?.toLowerCase().includes('origin'), true);
    const methods = res.headers.get('access-control-allow-methods') ?? '';
    for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) assertEquals(methods.includes(m), true);
    const headers = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    for (const h of ['authorization', 'content-type', 'idempotency-key']) assertEquals(headers.includes(h), true);
  }));

Deno.test('preflight from a disallowed origin has no Access-Control-Allow-Origin', () =>
  withAllowedOrigins(ALLOWED, async () => {
    const res = await handler(
      new Request(`${BASE}/api/v1/contributions`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' },
      }),
    );
    assertFalse(res.headers.has('access-control-allow-origin'));
  }));

Deno.test('without ALLOWED_ORIGINS no origin is allowed', () =>
  withAllowedOrigins(undefined, async () => {
    const res = await handler(
      new Request(`${BASE}/api/v1/contributions`, { method: 'OPTIONS', headers: { Origin: ALLOWED } }),
    );
    assertFalse(res.headers.has('access-control-allow-origin'));
  }));

Deno.test('regular responses carry CORS headers only for allowed origins', () =>
  withAllowedOrigins(ALLOWED, async () => {
    const ok = await handler(new Request(`${BASE}/api/v1/nada`, { headers: { Origin: ALLOWED } }));
    assertEquals(ok.status, 404);
    assertEquals(ok.headers.get('access-control-allow-origin'), ALLOWED);

    const bad = await handler(new Request(`${BASE}/api/v1/nada`, { headers: { Origin: 'https://evil.example.com' } }));
    assertFalse(bad.headers.has('access-control-allow-origin'));
  }));

Deno.test('unhandled exception returns 500 INTERNAL without leaking the internal message', async () => {
  const secret = 'db password=hunter2 at /srv/private/file.ts';
  const routes: Route[] = [{
    method: 'GET',
    path: '/boom',
    handler: () => {
      throw new Error(secret);
    },
  }];
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await createHandler(routes)(new Request(`${BASE}/api/v1/boom`));
    assertEquals(res.status, 500);
    const text = await res.text();
    assertEquals(text.includes('hunter2'), false);
    assertEquals(text.includes('/srv/private'), false);
    assertEquals(text.includes('stack'), false);
    const body = JSON.parse(text);
    assertEquals(body.error.code, 'INTERNAL');
    assertExists(body.error.message);
    assertEquals(body.error.details, {});
  } finally {
    console.error = originalError;
  }
});

Deno.test('rejected promise from a route also returns 500 INTERNAL', async () => {
  const routes: Route[] = [{
    method: 'GET',
    path: '/boom-async',
    handler: () => Promise.reject(new Error('internal detail')),
  }];
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await createHandler(routes)(new Request(`${BASE}/api/v1/boom-async`));
    assertEquals(res.status, 500);
    const text = await res.text();
    assertEquals(text.includes('internal detail'), false);
    assertEquals(JSON.parse(text).error.code, 'INTERNAL');
  } finally {
    console.error = originalError;
  }
});
