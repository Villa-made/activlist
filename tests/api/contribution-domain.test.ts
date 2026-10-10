// T10.b — contribution creation domain (pure, no network). Fakes stand in for the EXIF inspector (C, T09)
// and for private storage.
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  fingerprint,
  mapCreateRpcError,
  parseCreateContribution,
  parseIdempotencyKey,
  prepareEvidence,
  toCreateResponse,
} from '../../supabase/functions/api/domain/contribution.ts';
import { ApiError } from '../../supabase/functions/api/domain/http.ts';
import type { EvidenceInspector, EvidenceStorage } from '../../supabase/functions/api/domain/ports.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PHOTO = `staging/${USER}/33333333-3333-4333-8333-333333333333`;

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actionType: 'RECYCLING',
    description: 'Reciclado de envases',
    municipalityCode: '08019',
    photoPath: PHOTO,
    captureOrigin: 'CAMERA_FLOW',
    ...overrides,
  };
}

function expectApiError(action: () => unknown, status: number, code: string, details?: Record<string, unknown>) {
  try {
    action();
  } catch (e) {
    assert(e instanceof ApiError, `expected ApiError, got ${e}`);
    assertEquals([e.status, e.code], [status, code]);
    if (details) {
      for (const [k, v] of Object.entries(details)) assertEquals(e.details[k], v);
    }
    return;
  }
  throw new Error('expected an ApiError, nothing thrown');
}

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://x.test/api/v1/contributions', { method: 'POST', headers });
}

// ---- Idempotency-Key -------------------------------------------------------

Deno.test('Idempotency-Key: valid UUID is returned', () => {
  const key = crypto.randomUUID();
  assertEquals(parseIdempotencyKey(req({ 'Idempotency-Key': key })), key);
});

Deno.test('Idempotency-Key: missing or not a UUID is 400 INVALID_REQUEST with details.field', () => {
  expectApiError(() => parseIdempotencyKey(req()), 400, 'INVALID_REQUEST', { field: 'Idempotency-Key' });
  expectApiError(() => parseIdempotencyKey(req({ 'Idempotency-Key': 'abc' })), 400, 'INVALID_REQUEST', {
    field: 'Idempotency-Key',
  });
});

// ---- Body validation -------------------------------------------------------

Deno.test('parseCreateContribution: valid body, description trimmed', () => {
  const out = parseCreateContribution(validBody({ description: '  hola  ' }), USER);
  assertEquals(out, {
    actionType: 'RECYCLING',
    description: 'hola',
    municipalityCode: '08019',
    photoPath: PHOTO,
    captureOrigin: 'CAMERA_FLOW',
  });
});

Deno.test('parseCreateContribution: non-object bodies are 400', () => {
  for (const body of [null, 'x', 5, [], undefined]) {
    expectApiError(() => parseCreateContribution(body, USER), 400, 'INVALID_REQUEST');
  }
});

Deno.test('parseCreateContribution: actionType outside the enum is 400', () => {
  expectApiError(() => parseCreateContribution(validBody({ actionType: 'COMPOSTING' }), USER), 400, 'INVALID_REQUEST', {
    field: 'actionType',
  });
  expectApiError(() => parseCreateContribution(validBody({ actionType: undefined }), USER), 400, 'INVALID_REQUEST');
});

Deno.test('parseCreateContribution: description 1..500 after trim', () => {
  for (const d of ['', '   ', 7, 'a'.repeat(501), `  ${'a'.repeat(501)}  `]) {
    expectApiError(() => parseCreateContribution(validBody({ description: d }), USER), 400, 'INVALID_REQUEST', {
      field: 'description',
    });
  }
  assertEquals(parseCreateContribution(validBody({ description: 'a'.repeat(500) }), USER).description.length, 500);
  assertEquals(
    parseCreateContribution(validBody({ description: ` ${'a'.repeat(500)} ` }), USER).description.length,
    500,
  );
});

Deno.test('parseCreateContribution: municipalityCode must be 5 digits, else 422 INVALID_MUNICIPALITY', () => {
  for (const m of ['8019', '080190', 'abcde', '', 8019, null]) {
    expectApiError(() => parseCreateContribution(validBody({ municipalityCode: m }), USER), 422, 'INVALID_MUNICIPALITY');
  }
});

Deno.test('parseCreateContribution: captureOrigin outside the enum is 400', () => {
  expectApiError(() => parseCreateContribution(validBody({ captureOrigin: 'SCREENSHOT' }), USER), 400, 'INVALID_REQUEST', {
    field: 'captureOrigin',
  });
});

Deno.test('parseCreateContribution: malformed photoPath is 400', () => {
  for (const p of ['', 'staging/x/y', `public/${USER}/33333333-3333-4333-8333-333333333333`, `${PHOTO}/extra`, 5]) {
    expectApiError(() => parseCreateContribution(validBody({ photoPath: p }), USER), 400, 'INVALID_REQUEST', {
      field: 'photoPath',
    });
  }
});

Deno.test('parseCreateContribution: photoPath of another user is 403 NOT_OWNER', () => {
  const foreign = `staging/${OTHER}/33333333-3333-4333-8333-333333333333`;
  expectApiError(() => parseCreateContribution(validBody({ photoPath: foreign }), USER), 403, 'NOT_OWNER');
});

// ---- Fingerprint -----------------------------------------------------------

Deno.test('fingerprint: stable under key order and description whitespace, SHA-256 hex', async () => {
  const a = parseCreateContribution(validBody(), USER);
  const reordered = parseCreateContribution(
    {
      captureOrigin: 'CAMERA_FLOW',
      photoPath: PHOTO,
      municipalityCode: '08019',
      description: '   Reciclado de envases  ',
      actionType: 'RECYCLING',
    },
    USER,
  );
  const fa = await fingerprint(a);
  assert(/^[0-9a-f]{64}$/.test(fa));
  assertEquals(await fingerprint(reordered), fa);
});

Deno.test('fingerprint: changes when any field changes', async () => {
  const base = await fingerprint(parseCreateContribution(validBody(), USER));
  const variants = [
    { actionType: 'LITTER_COLLECTION' },
    { description: 'Otra descripción' },
    { municipalityCode: '08001' },
    { photoPath: `staging/${USER}/44444444-4444-4444-8444-444444444444` },
    { captureOrigin: 'GALLERY' },
  ];
  for (const v of variants) {
    const fp = await fingerprint(parseCreateContribution(validBody(v), USER));
    assert(fp !== base, `fingerprint did not change for ${JSON.stringify(v)}`);
  }
});

// ---- prepareEvidence -------------------------------------------------------

const SERVER_NOW = new Date('2026-10-10T12:00:00.000Z');
const WINDOW_MS = 60 * 60_000;

/** Fake inspector applying the contract rules, using ONLY the serverNow it is given. */
function fakeInspector(exifAt: Date | null): EvidenceInspector {
  return {
    inspect(bytes, origin, serverNow) {
      if (new TextDecoder().decode(bytes) === 'plain text') return { ok: false, code: 'UNSUPPORTED_MEDIA' };
      if (exifAt === null) {
        return origin === 'GALLERY'
          ? { ok: false, code: 'EXIF_REQUIRED' }
          : { ok: true, mime: 'image/jpeg', captureExifAt: null };
      }
      const age = serverNow.getTime() - exifAt.getTime();
      if (age > WINDOW_MS || age < 0) return { ok: false, code: 'PHOTO_TOO_OLD' };
      return { ok: true, mime: 'image/jpeg', captureExifAt: exifAt };
    },
  };
}

function fakeStorage(content: string | null): EvidenceStorage & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    download(path) {
      calls.push(path);
      return Promise.resolve(content === null ? null : new TextEncoder().encode(content));
    },
  };
}

function input(origin: 'GALLERY' | 'CAMERA_FLOW' = 'GALLERY') {
  return parseCreateContribution(validBody({ captureOrigin: origin }), USER);
}

async function assertPrepareFails(promise: Promise<unknown>, status: number, code: string) {
  const e = await assertRejects(() => promise, ApiError);
  assertEquals([e.status, e.code], [status, code]);
}

Deno.test('prepareEvidence: missing file is 422 PHOTO_NOT_FOUND, looked up at the private path', async () => {
  const storage = fakeStorage(null);
  await assertPrepareFails(
    prepareEvidence(input(), { storage, inspector: fakeInspector(null) }, SERVER_NOW),
    422,
    'PHOTO_NOT_FOUND',
  );
  assertEquals(storage.calls, [PHOTO]);
});

Deno.test('prepareEvidence: GALLERY without EXIF is 422 EXIF_REQUIRED', async () => {
  await assertPrepareFails(
    prepareEvidence(input('GALLERY'), { storage: fakeStorage('jpeg'), inspector: fakeInspector(null) }, SERVER_NOW),
    422,
    'EXIF_REQUIRED',
  );
});

Deno.test('prepareEvidence: EXIF 61 min old is 422 PHOTO_TOO_OLD; 59 min passes', async () => {
  const old = new Date(SERVER_NOW.getTime() - 61 * 60_000);
  await assertPrepareFails(
    prepareEvidence(input(), { storage: fakeStorage('jpeg'), inspector: fakeInspector(old) }, SERVER_NOW),
    422,
    'PHOTO_TOO_OLD',
  );
  const fresh = new Date(SERVER_NOW.getTime() - 59 * 60_000);
  const out = await prepareEvidence(
    input(),
    { storage: fakeStorage('jpeg'), inspector: fakeInspector(fresh) },
    SERVER_NOW,
  );
  assertEquals(out, { captureExifAt: fresh });
});

Deno.test('prepareEvidence: plain text is 422 UNSUPPORTED_MEDIA', async () => {
  await assertPrepareFails(
    prepareEvidence(input(), { storage: fakeStorage('plain text'), inspector: fakeInspector(null) }, SERVER_NOW),
    422,
    'UNSUPPORTED_MEDIA',
  );
});

Deno.test('prepareEvidence: passes the caller serverNow and the declared origin to the inspector', async () => {
  let seen: { origin: string; now: Date } | null = null;
  const inspector: EvidenceInspector = {
    inspect(_bytes, origin, now) {
      seen = { origin, now };
      return { ok: true, mime: 'image/png', captureExifAt: null };
    },
  };
  const out = await prepareEvidence(input('CAMERA_FLOW'), { storage: fakeStorage('png'), inspector }, SERVER_NOW);
  assertEquals(out, { captureExifAt: null });
  assertEquals(seen!.origin, 'CAMERA_FLOW');
  assertEquals(seen!.now, SERVER_NOW);
});

// ---- mapCreateRpcError -----------------------------------------------------

function rpcError(message: string, details = '', code = 'P0001') {
  return { code, message, details, hint: '' };
}

Deno.test('mapCreateRpcError: RPC codes map to the catalogue', () => {
  const table: Array<[string, number]> = [
    ['IDEMPOTENCY_CONFLICT', 409],
    ['INVALID_REQUEST', 400],
    ['INVALID_MUNICIPALITY', 422],
    ['PENDING_CONTRIBUTION_EXISTS', 409],
  ];
  for (const [message, status] of table) {
    const e = mapCreateRpcError(rpcError(message));
    assert(e instanceof ApiError);
    assertEquals([e.status, e.code], [status, message]);
  }
});

Deno.test('mapCreateRpcError: COOLDOWN_ACTIVE carries retryAt (normalised to ms) in details', () => {
  const e = mapCreateRpcError(rpcError('COOLDOWN_ACTIVE', '{"retryAt": "2026-10-10T12:30:00.123456Z"}'));
  assert(e instanceof ApiError);
  assertEquals([e.status, e.code], [409, 'COOLDOWN_ACTIVE']);
  assertEquals(e.details, { retryAt: '2026-10-10T12:30:00.123Z' });
});

Deno.test('mapCreateRpcError: 23505 on evidence_path is 409 PHOTO_ALREADY_USED', () => {
  const e = mapCreateRpcError({
    code: '23505',
    message: 'duplicate key value violates unique constraint "contributions_evidence_path_key"',
    details: 'Key (evidence_path)=(staging/a/b) already exists.',
    hint: '',
  });
  assert(e instanceof ApiError);
  assertEquals([e.status, e.code], [409, 'PHOTO_ALREADY_USED']);
});

Deno.test('mapCreateRpcError: anything else is a generic Error, not an ApiError', () => {
  for (
    const err of [
      rpcError('SOMETHING_NEW'),
      { code: '23505', message: 'duplicate key value violates unique constraint "other_key"', details: '', hint: '' },
      { code: '42501', message: 'permission denied for function create_contribution', details: '', hint: '' },
    ]
  ) {
    const e = mapCreateRpcError(err);
    assert(e instanceof Error);
    assert(!(e instanceof ApiError));
  }
});

// ---- toCreateResponse ------------------------------------------------------

Deno.test('toCreateResponse: DTO shape with ISO date and pointsIfApproved', () => {
  const dto = toCreateResponse({
    id: 'abc',
    status: 'PENDING',
    submitted_at: '2026-10-10T12:00:00.5+00:00',
    points_snapshot: 20,
    validation_version: 1,
    created: true,
  });
  assertEquals(dto, {
    id: 'abc',
    status: 'PENDING',
    submittedAt: '2026-10-10T12:00:00.500Z',
    pointsIfApproved: 20,
  });
});
