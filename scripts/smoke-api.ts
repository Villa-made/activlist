// T23-A — Smoke test of a deployed `api` Edge Function (docs/design/api-contracts.md §1–§4, §6).
//
//   deno run --allow-net scripts/smoke-api.ts <API_BASE> [--origin <url>]
//   API_BASE = https://<ref>.supabase.co/functions/v1/api/v1
//
// Anonymous requests only, no token and no secrets: nothing is created in the database
// (POST /reports uses an invalid Turnstile token and stops at 403 before touching it).
// One request per check, no retries. Prints one PASS/FAIL line per check; exit 1 if any fails,
// exit 2 on bad arguments. Runbook: docs/tasks/deploy-backend-runbook.md.

const USAGE = 'Uso: deno run --allow-net scripts/smoke-api.ts <API_BASE> [--origin <url>]\n' +
  '  API_BASE: https://<ref>.supabase.co/functions/v1/api/v1\n' +
  '  --origin: origen del front (p. ej. https://<proyecto>.pages.dev) para probar el preflight CORS';
const TIMEOUT_MS = 15_000;

/** Error bodies must not reveal stacks, privileged key names or server file paths. */
const LEAK_PATTERNS: [string, RegExp][] = [
  ['stack', /stack/i],
  ['service_role', /service_role/i],
  ['ruta interna', /file:\/\/|\/(?:home|var|tmp|usr|opt|srv|etc)\/|[A-Za-z]:\\\\|supabase\/functions|\.ts:\d+/],
];

interface Reply {
  status: number;
  headers: Headers;
  text: string;
}

interface Result {
  status: 'PASS' | 'FAIL' | 'SKIP';
  name: string;
  detail: string;
}

function parseArgs(args: string[]): { base: string; origin: string | null } | null {
  let base: string | null = null;
  let origin: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--origin') {
      const value = args[++i];
      if (value === undefined || !isHttpUrl(value)) return null;
      origin = value;
    } else if (base === null && isHttpUrl(args[i])) {
      base = args[i].replace(/\/+$/, '');
    } else {
      return null;
    }
  }
  return base === null ? null : { base, origin };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function errorCode(text: string): string | undefined {
  try {
    return JSON.parse(text)?.error?.code;
  } catch {
    return undefined;
  }
}

function describe(reply: Reply): string {
  const code = errorCode(reply.text);
  return code === undefined ? `${reply.status}` : `${reply.status} ${code}`;
}

export async function runSmoke(base: string, origin: string | null): Promise<Result[]> {
  const results: Result[] = [];
  const errorReplies: { name: string; text: string }[] = [];
  const record = (ok: boolean, name: string, detail: string) =>
    results.push({ status: ok ? 'PASS' : 'FAIL', name, detail });

  async function call(method: string, path: string, init: { body?: unknown; headers?: HeadersInit } = {}) {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const reply: Reply = { status: res.status, headers: res.headers, text: await res.text() };
    if (reply.status >= 400) errorReplies.push({ name: `${method} ${path}`, text: reply.text });
    return reply;
  }

  /** Runs one check; a network error or timeout is a FAIL of that check, never retried. */
  async function check(name: string, fn: () => Promise<[boolean, string]>) {
    try {
      const [ok, detail] = await fn();
      record(ok, name, detail);
    } catch (err) {
      record(false, name, `sin respuesta (${err instanceof Error ? err.name : 'error'})`);
    }
  }

  const expectError = (status: number, code: string, reply: Reply): [boolean, string] => {
    const ok = reply.status === status && errorCode(reply.text) === code;
    return [ok, ok ? describe(reply) : `${describe(reply)} (esperado ${status} ${code})`];
  };

  const expectPage = (reply: Reply): [boolean, string] => {
    if (reply.status !== 200) return [false, `${describe(reply)} (esperado 200)`];
    try {
      const body = JSON.parse(reply.text);
      const ok = Array.isArray(body?.items) &&
        (body.nextCursor === null || typeof body.nextCursor === 'string');
      return [ok, ok ? '200 {items,nextCursor}' : '200 sin forma {items,nextCursor}'];
    } catch {
      return [false, '200 con cuerpo no JSON'];
    }
  };

  const id = crypto.randomUUID();

  await check('GET /feed?limit=1', async () => expectPage(await call('GET', '/feed?limit=1')));
  await check('GET /leaderboard?limit=1', async () => expectPage(await call('GET', '/leaderboard?limit=1')));
  await check('GET /feed?limit=99', async () => {
    const reply = await call('GET', '/feed?limit=99');
    const [ok, detail] = expectError(400, 'INVALID_REQUEST', reply);
    let field: unknown;
    try {
      field = JSON.parse(reply.text)?.error?.details?.field;
    } catch { /* reported below */ }
    return field === 'limit' ? [ok, `${detail} field=limit`] : [false, `${detail} (falta details.field "limit")`];
  });
  await check('GET /municipalities?q=sabad&limit=1', async () => {
    const reply = await call('GET', '/municipalities?q=sabad&limit=1');
    if (reply.status !== 200) return [false, `${describe(reply)} (esperado 200)`];
    try {
      const item = JSON.parse(reply.text)?.items?.[0];
      const ok = item?.code === '08187' && item?.name === 'Sabadell';
      return [ok, ok ? '200 Sabadell 08187' : '200 sin Sabadell 08187 (¿falta la migración 000300?)'];
    } catch {
      return [false, '200 con cuerpo no JSON'];
    }
  });
  await check('GET /media/<uuid> y /media/x', async () => {
    const a = await call('GET', `/media/${id}`);
    const b = await call('GET', '/media/x');
    const [ok, detail] = expectError(404, 'NOT_FOUND', a);
    if (!ok) return [false, `/media/<uuid>: ${detail}`];
    if (b.status !== 404 || b.text !== a.text) return [false, `/media/x: ${describe(b)} (esperado el mismo 404)`];
    return [true, '404 NOT_FOUND con el mismo cuerpo'];
  });

  const unauthenticated: [string, string, unknown?][] = [
    ['PUT', `/contributions/${id}/like`],
    ['DELETE', `/contributions/${id}/like`],
    ['POST', `/contributions/${id}/hide`],
    ['GET', `/contributions/${id}`],
    ['POST', '/uploads', { contentType: 'image/jpeg', sizeBytes: 1024 }],
    ['GET', '/profiles/me'],
  ];
  for (const [method, path, body] of unauthenticated) {
    const label = `${method} ${path.replace(id, '<uuid>')} sin token`;
    await check(label, async () => expectError(401, 'AUTH_REQUIRED', await call(method, path, { body })));
  }

  await check('POST /reports con turnstileToken inválido', async () => {
    const reply = await call('POST', '/reports', {
      body: { contributionId: id, reason: 'smoke test T23-A', turnstileToken: 'invalid' },
    });
    const [ok, detail] = expectError(403, 'CAPTCHA_FAILED', reply);
    if (ok) return [ok, detail];
    if (reply.status === 500) return [false, `${detail}. Pista: faltan TURNSTILE_SECRET_KEY / REPORT_RATE_SALT`];
    if (reply.status === 404) return [false, `${detail}. Pista: la función desplegada no incluye /reports`];
    return [false, detail];
  });

  if (origin === null) {
    results.push({ status: 'SKIP', name: 'OPTIONS preflight CORS', detail: 'sin --origin' });
  } else {
    await check(`OPTIONS preflight CORS desde ${origin}`, async () => {
      const reply = await call('OPTIONS', `/contributions/${id}/like`, {
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'authorization, content-type',
        },
      });
      const allowOrigin = reply.headers.get('Access-Control-Allow-Origin');
      const methods = (reply.headers.get('Access-Control-Allow-Methods') ?? '').toUpperCase();
      const ok = reply.status === 204 && allowOrigin === origin && /\bPUT\b/.test(methods) &&
        /\bDELETE\b/.test(methods);
      const detail = `${reply.status} Allow-Origin=${allowOrigin ?? '(ausente)'} Allow-Methods=${methods || '(ausente)'}`;
      return [ok, ok ? detail : `${detail}. Pista: revisa ALLOWED_ORIGINS`];
    });
  }

  // Only the pattern name is printed, never the body itself.
  const leaks = errorReplies.flatMap(({ name, text }) =>
    LEAK_PATTERNS.filter(([, re]) => re.test(text)).map(([label]) => `${name} contiene "${label}"`)
  );
  record(
    leaks.length === 0,
    'Respuestas de error sin stack, service_role ni rutas internas',
    leaks.length === 0 ? `${errorReplies.length} respuestas revisadas` : leaks.join('; '),
  );

  return results;
}

if (import.meta.main) {
  const args = parseArgs(Deno.args);
  if (args === null) {
    console.error(USAGE);
    Deno.exit(2);
  }
  console.log(`Smoke API: ${args.base}${args.origin ? ` (origin ${args.origin})` : ''}`);
  const results = await runSmoke(args.base, args.origin);
  for (const r of results) console.log(`${r.status}  ${r.name} → ${r.detail}`);
  const count = (status: Result['status']) => results.filter((r) => r.status === status).length;
  const failed = count('FAIL');
  console.log(`Resumen: ${count('PASS')} PASS, ${failed} FAIL, ${count('SKIP')} SKIP`);
  Deno.exit(failed === 0 ? 0 : 1);
}
