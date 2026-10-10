import {
  ALLOWED_IMAGE_TYPES,
  DECISIONS,
  type Decision,
  type ValidationResult,
} from '../domain/contracts.ts';

/** Keep an externally generated explanation bounded before any later persistence. */
export const MAX_VALIDATION_REASON_LENGTH = 500;
export type ImageMediaType = (typeof ALLOWED_IMAGE_TYPES)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The internal validation contract carries image bytes, not a client-declared
 * MIME type. Recognize only the server-approved formats from their bytes.
 */
export function detectImageMediaType(bytes: Uint8Array): ImageMediaType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Accept only the exact internal validation contract. A malformed provider result
 * is deliberately represented by null so the caller can map it to a technical
 * error; it must never become an approval.
 */
export function parseValidationResult(raw: string): ValidationResult | null {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;

  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'decision' || keys[1] !== 'reason') return null;
  if (typeof value.decision !== 'string' || !DECISIONS.includes(value.decision as Decision)) return null;
  if (typeof value.reason !== 'string') return null;

  const reason = value.reason.replace(/\s+/g, ' ').trim();
  if (
    reason.length === 0 ||
    reason.length > MAX_VALIDATION_REASON_LENGTH ||
    [...reason].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    return null;
  }

  return { decision: value.decision as Decision, reason };
}
