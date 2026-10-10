// T13.b — pure unit tests of the validation orchestrator: every port is a fake, no network.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import type { Decision } from '../../supabase/functions/api/domain/contracts.ts';
import type {
  ValidationContribution,
  ValidationRepository,
} from '../../supabase/functions/api/domain/ports.ts';
import {
  MAX_REASON_LENGTH,
  runValidation,
  TECHNICAL_ERROR_REASON,
  type ValidationPorts,
} from '../../supabase/functions/api/domain/validation-workflow.ts';

const ID = '11111111-1111-4111-8111-111111111111';
const ORIGINAL = new Uint8Array([1, 2, 3]);
const SANITIZED = new Uint8Array([9, 9]);

interface Calls {
  validate: number;
  sanitize: number;
  upload: Array<{ path: string; bytes: Uint8Array; contentType: string }>;
  remove: string[];
  complete: Array<{ id: string; version: number; decision: Decision; reason: string; photo?: string }>;
  technical: Array<{ id: string; version: number; reason: string }>;
}

interface Overrides {
  row?: Partial<ValidationContribution> | null;
  download?: Uint8Array | null;
  validate?: () => Promise<{ decision: Decision; reason: string }>;
  sanitize?: () => Promise<{ bytes: Uint8Array; contentType: string }>;
  complete?: boolean;
  load?: () => Promise<ValidationContribution | null>;
  markTechnicalError?: () => Promise<boolean>;
}

function setup(o: Overrides = {}): { ports: ValidationPorts; calls: Calls } {
  const calls: Calls = { validate: 0, sanitize: 0, upload: [], remove: [], complete: [], technical: [] };
  const row: ValidationContribution | null = o.row === null ? null : {
    id: ID,
    actionType: 'RECYCLING',
    description: 'Botella en el contenedor',
    evidencePath: 'user/photo.jpg',
    status: 'PENDING',
    validationVersion: 1,
    ...o.row,
  };
  const repository: ValidationRepository = {
    load: o.load ?? (() => Promise.resolve(row)),
    complete(id, version, decision, reason, photo) {
      calls.complete.push({ id, version, decision, reason, photo });
      return Promise.resolve(o.complete ?? true);
    },
    markTechnicalError(id, version, reason) {
      calls.technical.push({ id, version, reason });
      return o.markTechnicalError ? o.markTechnicalError() : Promise.resolve(true);
    },
  };
  const ports: ValidationPorts = {
    repository,
    evidenceStorage: {
      download: () => Promise.resolve(o.download === undefined ? ORIGINAL : o.download),
    },
    validator: {
      validate(input) {
        calls.validate++;
        assertEquals(input.originalImageBytes, ORIGINAL);
        return o.validate
          ? o.validate()
          : Promise.resolve({ decision: 'APPROVED' as const, reason: 'Se ve el contenedor' });
      },
    },
    sanitizer: {
      sanitize() {
        calls.sanitize++;
        return o.sanitize
          ? o.sanitize()
          : Promise.resolve({ bytes: SANITIZED, contentType: 'image/jpeg' });
      },
    },
    publishedStorage: {
      upload(path, bytes, contentType) {
        calls.upload.push({ path, bytes, contentType });
        return Promise.resolve();
      },
      remove(path) {
        calls.remove.push(path);
        return Promise.resolve();
      },
    },
  };
  return { ports, calls };
}

Deno.test('APPROVED uploads the sanitized copy and completes with its path', async () => {
  const { ports, calls } = setup();
  assertEquals(await runValidation(ID, 1, ports), 'APPROVED');
  assertEquals(calls.upload.length, 1);
  assertEquals(calls.upload[0].path, `${ID}/1`);
  assertEquals(calls.upload[0].bytes, SANITIZED);
  assertEquals(calls.upload[0].contentType, 'image/jpeg');
  assertEquals(calls.complete, [
    { id: ID, version: 1, decision: 'APPROVED', reason: 'Se ve el contenedor', photo: `${ID}/1` },
  ]);
  assertEquals(calls.technical.length, 0);
  assertEquals(calls.remove.length, 0);
});

for (
  const [name, error] of [
    ['timeout', new Error('timeout after 15000ms')],
    ['429', new Error('429 rate limited sk-secret-token')],
    ['invalid JSON', new SyntaxError('Unexpected token')],
  ] as const
) {
  Deno.test(`validator failure (${name}) -> TECHNICAL_ERROR without upload or complete`, async () => {
    const { ports, calls } = setup({ validate: () => Promise.reject(error) });
    assertEquals(await runValidation(ID, 1, ports), 'TECHNICAL_ERROR');
    assertEquals(calls.upload.length, 0);
    assertEquals(calls.complete.length, 0);
    assertEquals(calls.technical, [{ id: ID, version: 1, reason: TECHNICAL_ERROR_REASON }]);
    assert(!calls.technical[0].reason.includes('secret'));
  });
}

Deno.test('sanitizer failure -> TECHNICAL_ERROR, never APPROVED, no upload', async () => {
  const { ports, calls } = setup({ sanitize: () => Promise.reject(new Error('decode failed')) });
  assertEquals(await runValidation(ID, 1, ports), 'TECHNICAL_ERROR');
  assertEquals(calls.upload.length, 0);
  assertEquals(calls.complete.length, 0);
  assertEquals(calls.technical.length, 1);
});

Deno.test('complete returns false after upload -> copy removed and SKIPPED', async () => {
  const { ports, calls } = setup({ complete: false });
  assertEquals(await runValidation(ID, 1, ports), 'SKIPPED');
  assertEquals(calls.upload.length, 1);
  assertEquals(calls.remove, [`${ID}/1`]);
  assertEquals(calls.technical.length, 0);
});

for (const decision of ['NEEDS_EVIDENCE', 'REJECTED'] as const) {
  Deno.test(`${decision} completes without photo and without touching sanitizer/storage`, async () => {
    const { ports, calls } = setup({
      validate: () => Promise.resolve({ decision, reason: 'Motivo claro' }),
    });
    assertEquals(await runValidation(ID, 1, ports), decision);
    assertEquals(calls.complete, [{ id: ID, version: 1, decision, reason: 'Motivo claro', photo: undefined }]);
    assertEquals(calls.sanitize, 0);
    assertEquals(calls.upload.length, 0);
  });

  Deno.test(`${decision} with complete=false -> SKIPPED`, async () => {
    const { ports } = setup({
      complete: false,
      validate: () => Promise.resolve({ decision, reason: 'x' }),
    });
    assertEquals(await runValidation(ID, 1, ports), 'SKIPPED');
  });
}

Deno.test('reason is stripped of HTML, control chars, collapsed and capped', async () => {
  const dirty = '<script>alert(1)</script>Hola\n\n  mundo\u0000\t<b>fin</b>';
  const a = setup({ validate: () => Promise.resolve({ decision: 'REJECTED', reason: dirty }) });
  await runValidation(ID, 1, a.ports);
  assertEquals(a.calls.complete[0].reason, 'alert(1) Hola mundo fin');

  const b = setup({
    validate: () => Promise.resolve({ decision: 'NEEDS_EVIDENCE', reason: 'a'.repeat(1000) }),
  });
  await runValidation(ID, 1, b.ports);
  assertEquals(b.calls.complete[0].reason.length, MAX_REASON_LENGTH);

  const c = setup({ validate: () => Promise.resolve({ decision: 'REJECTED', reason: '<i></i> \n ' }) });
  await runValidation(ID, 1, c.ports);
  assert(c.calls.complete[0].reason.length > 0);
  assert(!/[<>]/.test(c.calls.complete[0].reason));
});

for (
  const [name, o] of [
    ['missing row', { row: null }],
    ['status not PENDING', { row: { status: 'CANCELLED' as const } }],
    ['other version', { row: { validationVersion: 2 } }],
  ] as const
) {
  Deno.test(`${name} -> SKIPPED without calling validator or writing`, async () => {
    const { ports, calls } = setup(o);
    assertEquals(await runValidation(ID, 1, ports), 'SKIPPED');
    assertEquals(calls.validate, 0);
    assertEquals(calls.complete.length, 0);
    assertEquals(calls.technical.length, 0);
    assertEquals(calls.upload.length, 0);
  });
}

Deno.test('download null -> TECHNICAL_ERROR without calling validator', async () => {
  const { ports, calls } = setup({ download: null });
  assertEquals(await runValidation(ID, 1, ports), 'TECHNICAL_ERROR');
  assertEquals(calls.validate, 0);
  assertEquals(calls.technical.length, 1);
});

Deno.test('unexpected repository exception never throws', async () => {
  const { ports, calls } = setup({ load: () => Promise.reject(new Error('db down')) });
  assertEquals(await runValidation(ID, 1, ports), 'TECHNICAL_ERROR');
  assertEquals(calls.technical.length, 1);
});

Deno.test('repository throws on load and on markTechnicalError -> still TECHNICAL_ERROR, no throw', async () => {
  const { ports } = setup({
    load: () => Promise.reject(new Error('db down')),
    markTechnicalError: () => Promise.reject(new Error('db down')),
  });
  assertEquals(await runValidation(ID, 1, ports), 'TECHNICAL_ERROR');
});

Deno.test('complete throws after upload -> copy kept (DB may have approved), TECHNICAL_ERROR', async () => {
  const { ports, calls } = setup();
  ports.repository.complete = () => Promise.reject(new Error('rpc failed'));
  assertEquals(await runValidation(ID, 1, ports), 'TECHNICAL_ERROR');
  assertEquals(calls.remove.length, 0);
});

Deno.test('validator returning an unknown decision is a technical error', async () => {
  const { ports, calls } = setup({
    validate: () => Promise.resolve({ decision: 'MAYBE' as Decision, reason: 'x' }),
  });
  assertEquals(await runValidation(ID, 1, ports), 'TECHNICAL_ERROR');
  assertEquals(calls.complete.length, 0);
});
