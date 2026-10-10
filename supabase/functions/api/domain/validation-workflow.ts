// Validation orchestrator (T13.b, architecture §3, ADR-003). Runs in the background after the 202:
// it must never throw and never log bytes, raw AI output or tokens (only id and result).
import type { Decision } from './contracts.ts';
import type {
  EvidenceSanitizer,
  EvidenceStorage,
  EvidenceValidator,
  PublishedStorage,
  ValidationRepository,
} from './ports.ts';

export interface ValidationPorts {
  repository: ValidationRepository;
  evidenceStorage: EvidenceStorage;
  validator: EvidenceValidator;
  sanitizer: EvidenceSanitizer;
  publishedStorage: PublishedStorage;
}

export type ValidationOutcome = Decision | 'TECHNICAL_ERROR' | 'SKIPPED';

export const TECHNICAL_ERROR_REASON = 'No se pudo validar automáticamente; puedes reintentar';
export const MAX_REASON_LENGTH = 300;

const FALLBACK_REASON: Record<Decision, string> = {
  APPROVED: 'Evidencia aprobada',
  NEEDS_EVIDENCE: 'Se necesita más evidencia',
  REJECTED: 'La evidencia no es válida para esta acción',
};

/** Strips HTML tags and control characters, collapses whitespace and caps the length. */
export function sanitizeReason(raw: unknown, decision: Decision): string {
  const text = typeof raw === 'string' ? raw : '';
  const clean = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_REASON_LENGTH)
    .trim();
  return clean === '' ? FALLBACK_REASON[decision] : clean;
}

async function technicalError(
  id: string,
  version: number,
  ports: ValidationPorts,
): Promise<'TECHNICAL_ERROR' | 'SKIPPED'> {
  try {
    const applied = await ports.repository.markTechnicalError(id, version, TECHNICAL_ERROR_REASON);
    return applied ? 'TECHNICAL_ERROR' : 'SKIPPED';
  } catch {
    // The lease expiry plus retry (T13.a) recovers a row we could not mark.
    return 'TECHNICAL_ERROR';
  }
}

export async function runValidation(
  id: string,
  version: number,
  ports: ValidationPorts,
): Promise<ValidationOutcome> {
  let result: ValidationOutcome;
  try {
    result = await execute(id, version, ports);
  } catch {
    result = await technicalError(id, version, ports);
    if (result === 'SKIPPED') result = 'TECHNICAL_ERROR';
  }
  console.info('validation finished', id, result);
  return result;
}

async function execute(
  id: string,
  version: number,
  ports: ValidationPorts,
): Promise<ValidationOutcome> {
  const row = await ports.repository.load(id);
  if (row === null || row.status !== 'PENDING' || row.validationVersion !== version) return 'SKIPPED';

  const original = await ports.evidenceStorage.download(row.evidencePath);
  if (original === null) return await technicalError(id, version, ports);

  let decision: Decision;
  let reason: string;
  try {
    const verdict = await ports.validator.validate({
      actionType: row.actionType,
      description: row.description,
      originalImageBytes: original,
    });
    decision = verdict.decision;
    if (decision !== 'APPROVED' && decision !== 'NEEDS_EVIDENCE' && decision !== 'REJECTED') {
      throw new Error('invalid decision');
    }
    reason = sanitizeReason(verdict.reason, decision);
  } catch {
    return await technicalError(id, version, ports);
  }

  if (decision !== 'APPROVED') {
    const applied = await ports.repository.complete(id, version, decision, reason);
    return applied ? decision : 'SKIPPED';
  }

  // Never approve without a sanitized copy.
  const publicPath = `${id}/${version}`;
  try {
    const copy = await ports.sanitizer.sanitize(original);
    await ports.publishedStorage.upload(publicPath, copy.bytes, copy.contentType);
  } catch {
    return await technicalError(id, version, ports);
  }

  // If complete() throws, the database may have stored the approval before the failure: keep the
  // copy (harmless in a private bucket). It is removed only when complete() answers false.
  const applied = await ports.repository.complete(id, version, 'APPROVED', reason, publicPath);
  if (!applied) {
    await removeQuietly(ports, publicPath);
    return 'SKIPPED';
  }
  return 'APPROVED';
}

async function removeQuietly(ports: ValidationPorts, path: string): Promise<void> {
  try {
    await ports.publishedStorage.remove(path);
  } catch {
    // Orphan copy in a private bucket; never surfaced to the user.
  }
}
