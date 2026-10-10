// T23-A — scripts/smoke-api.ts against a local fake API (Deno.serve on port 0). Never touches DEV.
// Each case runs the script as a subprocess, exactly as a human would, to check the exit code
// and the printed hints.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

const SCRIPT = new URL('../../scripts/smoke-api.ts', import.meta.url);
const ORIGIN = 'https://app-21fib.pages.dev';
const PREFIX = '/functions/v1/api/v1';

interface FakeOptions {
  /** How POST /reports behaves: as deployed with secrets, missing secrets, or not deployed. */
  reports?: 'captcha' | 'missing-secrets' | 'not-deployed';
  /** Whether ALLOWED_ORIGINS contains ORIGIN. */
  cors?: boolean;
  /** Leak a stack trace in error bodies. */
  leak?: boolean;
  /** Return a different body for /media/x than for /media/<uuid>. */
  mediaOracle?: boolean;
}

function errorBody(code: string, message: string, details: Record<string, unknown>, leak: boolean) {
  const body: Record<string, unknown> = { error: { code, message, details } };
  if (leak) body.stack = 'Error at file:///var/tmp/sb-compile-edge-runtime/api/index.ts:42:7';
  return body;
}

function fakeApi(opts: FakeOptions = {}): (req: Request) => Response {
  const { reports = 'captcha', cors = true, leak = false, mediaOracle = false } = opts;
  const err = (status: number, code: string, message: string, details: Record<string, unknown> = {}) =>
    Response.json(errorBody(code, message, details, leak), { status });

  return (req) => {
    const url = new URL(req.url);
    const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : '/__outside__';
    const headers = new Headers({ Vary: 'Origin' });
    const origin = req.headers.get('Origin');
    if (cors && origin === ORIGIN) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'authorization, content-type, idempotency-key');
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const respond = (res: Response) => {
      headers.forEach((v, k) => res.headers.set(k, v));
      return res;
    };
    const authed = req.headers.has('Authorization');
    const route = `${req.method} ${path}`;

    if (req.method === 'GET' && (path === '/feed' || path === '/leaderboard')) {
      const limit = url.searchParams.get('limit');
      if (limit !== null && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 50)) {
        return respond(err(400, 'INVALID_REQUEST', 'Parámetro de paginación inválido', { field: 'limit' }));
      }
      return respond(Response.json({ items: [], nextCursor: null }));
    }
    if (route === 'GET /municipalities') {
      return respond(Response.json({
        items: [{ code: '08187', name: 'Sabadell', provinceName: 'Barcelona' }],
        nextCursor: null,
      }));
    }
    if (req.method === 'GET' && path.startsWith('/media/')) {
      if (mediaOracle && path === '/media/x') return respond(err(400, 'INVALID_REQUEST', 'id inválido'));
      return respond(err(404, 'NOT_FOUND', 'Recurso no encontrado'));
    }
    const needsAuth = /^(PUT|DELETE) \/contributions\/[^/]+\/like$/.test(route) ||
      /^POST \/contributions\/[^/]+\/hide$/.test(route) ||
      /^GET \/contributions\/[^/]+$/.test(route) ||
      route === 'POST /uploads' || route === 'GET /profiles/me';
    if (needsAuth && !authed) return respond(err(401, 'AUTH_REQUIRED', 'Autenticación requerida'));
    if (route === 'POST /reports') {
      if (reports === 'missing-secrets') return respond(err(500, 'INTERNAL', 'Error interno'));
      if (reports === 'captcha') {
        return respond(err(403, 'CAPTCHA_FAILED', 'No se pudo verificar que eres una persona'));
      }
    }
    return respond(err(404, 'NOT_FOUND', 'Recurso no encontrado'));
  };
}

async function runScript(args: string[]): Promise<{ code: number; out: string }> {
  const output = await new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-net', SCRIPT.href, ...args],
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  const decoder = new TextDecoder();
  return { code: output.code, out: decoder.decode(output.stdout) + decoder.decode(output.stderr) };
}

async function withFake(
  opts: FakeOptions,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, fakeApi(opts));
  try {
    await fn(`http://127.0.0.1:${server.addr.port}${PREFIX}`);
  } finally {
    await server.shutdown();
  }
}

const failLines = (out: string) => out.split('\n').filter((l) => l.startsWith('FAIL'));

Deno.test('healthy API with --origin: every check passes and exit code is 0', async () => {
  await withFake({}, async (base) => {
    const { code, out } = await runScript([base, '--origin', ORIGIN]);
    assertEquals(failLines(out), []);
    assertEquals(code, 0, out);
    assertStringIncludes(out, 'PASS');
    assertStringIncludes(out, 'CAPTCHA_FAILED');
    assertStringIncludes(out, 'OPTIONS');
  });
});

Deno.test('a trailing slash in API_BASE is accepted', async () => {
  await withFake({}, async (base) => {
    const { code, out } = await runScript([`${base}/`]);
    assertEquals(code, 0, out);
  });
});

Deno.test('without --origin the CORS preflight is skipped, not failed', async () => {
  await withFake({ cors: false }, async (base) => {
    const { code, out } = await runScript([base]);
    assertEquals(code, 0, out);
    assertStringIncludes(out, 'SKIP');
  });
});

Deno.test('POST /reports answering 500 fails with the missing-secrets hint', async () => {
  await withFake({ reports: 'missing-secrets' }, async (base) => {
    const { code, out } = await runScript([base]);
    assertEquals(code, 1, out);
    const fails = failLines(out);
    assertEquals(fails.length, 1, out);
    assertStringIncludes(fails[0], 'faltan TURNSTILE_SECRET_KEY / REPORT_RATE_SALT');
  });
});

Deno.test('POST /reports answering 404 fails with the not-deployed hint', async () => {
  await withFake({ reports: 'not-deployed' }, async (base) => {
    const { code, out } = await runScript([base]);
    assertEquals(code, 1, out);
    const fails = failLines(out);
    assertEquals(fails.length, 1, out);
    assertStringIncludes(fails[0], 'la función desplegada no incluye /reports');
  });
});

Deno.test('origin not allowed fails the preflight with the ALLOWED_ORIGINS hint', async () => {
  await withFake({ cors: false }, async (base) => {
    const { code, out } = await runScript([base, '--origin', ORIGIN]);
    assertEquals(code, 1, out);
    const fails = failLines(out);
    assertEquals(fails.length, 1, out);
    assertStringIncludes(fails[0], 'revisa ALLOWED_ORIGINS');
  });
});

Deno.test('a leaked stack trace in error bodies fails the leak check', async () => {
  await withFake({ leak: true }, async (base) => {
    const { code, out } = await runScript([base]);
    assertEquals(code, 1, out);
    const fails = failLines(out);
    assert(fails.some((l) => l.includes('stack')), out);
  });
});

Deno.test('different bodies for /media/<uuid> and /media/x fail the media check', async () => {
  await withFake({ mediaOracle: true }, async (base) => {
    const { code, out } = await runScript([base]);
    assertEquals(code, 1, out);
    assert(failLines(out).some((l) => l.includes('/media')), out);
  });
});

Deno.test('unreachable API fails every check without retrying', async () => {
  // Port 9 (discard) on loopback: nothing listens there, connections are refused immediately.
  const { code, out } = await runScript(['http://127.0.0.1:9/functions/v1/api/v1']);
  assertEquals(code, 1, out);
  assert(failLines(out).length > 0, out);
});

Deno.test('missing or invalid arguments print usage and exit 2', async () => {
  for (const args of [[], ['not-a-url'], ['http://127.0.0.1:1/x', '--origin']]) {
    const { code, out } = await runScript(args);
    assertEquals(code, 2, `${args.join(' ')}: ${out}`);
    assertStringIncludes(out, 'Uso:');
  }
});
