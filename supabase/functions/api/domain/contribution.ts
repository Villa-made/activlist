// Contribution creation domain (T10.b): request parsing, canonical fingerprint, evidence preparation
// and RPC error mapping. Pure logic; I/O only through the injected ports.
// Contract: docs/design/api-contracts.md §1, §4 (create contribution), §6.
import {
  ACTION_TYPES,
  CAPTURE_ORIGINS,
  DESCRIPTION_MAX_LENGTH,
  ERROR_CODES,
  type ActionType,
  type CaptureOrigin,
  type CreateContributionRequest,
  type ContributionDto,
  type ContributionStatus,
  type CreateContributionResponse,
  type ProvideEvidenceRequest,
} from './contracts.ts';
import { ApiError } from './http.ts';
import type { EvidenceInspector, EvidenceStorage } from './ports.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_PATH = /^staging\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/i;
const MUNICIPALITY = /^\d{5}$/;

function invalid(field: string, message: string): ApiError {
  return new ApiError(400, ERROR_CODES.INVALID_REQUEST, message, { field });
}

/** `Idempotency-Key` header: a UUID, otherwise 400 INVALID_REQUEST with details.field. */
export function parseIdempotencyKey(req: Request): string {
  const value = req.headers.get('Idempotency-Key')?.trim() ?? '';
  if (!UUID.test(value)) {
    throw invalid('Idempotency-Key', 'Idempotency-Key ausente o no es un UUID');
  }
  return value.toLowerCase();
}

/** Validates the create body. The description is returned already trimmed. */
export function parseCreateContribution(body: unknown, userId: string): CreateContributionRequest {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Cuerpo de solicitud inválido');
  }
  const input = body as Record<string, unknown>;

  if (typeof input.actionType !== 'string' || !(ACTION_TYPES as readonly string[]).includes(input.actionType)) {
    throw invalid('actionType', 'Tipo de acción inválido');
  }
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length < 1 || description.length > DESCRIPTION_MAX_LENGTH) {
    throw invalid('description', `La descripción debe tener entre 1 y ${DESCRIPTION_MAX_LENGTH} caracteres`);
  }
  if (typeof input.municipalityCode !== 'string' || !MUNICIPALITY.test(input.municipalityCode)) {
    throw new ApiError(422, ERROR_CODES.INVALID_MUNICIPALITY, 'Municipio inválido', { field: 'municipalityCode' });
  }
  const { photoPath, captureOrigin } = parseEvidenceFields(input, userId);

  return {
    actionType: input.actionType as ActionType,
    description,
    municipalityCode: input.municipalityCode,
    photoPath,
    captureOrigin,
  };
}

/** Shared by create and evidence: capture origin and the private staging path owned by the user. */
function parseEvidenceFields(
  input: Record<string, unknown>,
  userId: string,
): ProvideEvidenceRequest {
  if (
    typeof input.captureOrigin !== 'string' ||
    !(CAPTURE_ORIGINS as readonly string[]).includes(input.captureOrigin)
  ) {
    throw invalid('captureOrigin', 'Origen de captura inválido');
  }
  const match = typeof input.photoPath === 'string' ? PHOTO_PATH.exec(input.photoPath) : null;
  if (!match || !UUID.test(match[1]) || !UUID.test(match[2])) {
    throw invalid('photoPath', 'Ruta de foto inválida');
  }
  if (match[1].toLowerCase() !== userId.toLowerCase()) {
    throw new ApiError(403, ERROR_CODES.NOT_OWNER, 'La foto no pertenece al usuario');
  }
  return {
    photoPath: input.photoPath as string,
    captureOrigin: input.captureOrigin as CaptureOrigin,
  };
}

/** Body of `POST /contributions/{id}/evidence`, same rules as creation. */
export function parseProvideEvidence(body: unknown, userId: string): ProvideEvidenceRequest {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Cuerpo de solicitud inválido');
  }
  return parseEvidenceFields(body as Record<string, unknown>, userId);
}

/** True when `id` has the UUID shape (anything else cannot exist: 404 without hitting the DB). */
export function isUuid(id: string): boolean {
  return UUID.test(id);
}

/** SHA-256 hex of the canonical JSON (sorted keys) of the fields that define the intent. */
export async function fingerprint(input: CreateContributionRequest): Promise<string> {
  const canonical = {
    actionType: input.actionType,
    captureOrigin: input.captureOrigin,
    description: input.description.trim(),
    municipalityCode: input.municipalityCode,
    photoPath: input.photoPath,
  };
  const sorted = Object.fromEntries(Object.entries(canonical).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(sorted)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Downloads the private photo and inspects it. `serverNow` is supplied by the caller (server clock),
 * never taken from the client.
 */
export async function prepareEvidence(
  input: Pick<CreateContributionRequest, 'photoPath' | 'captureOrigin'>,
  ports: { storage: EvidenceStorage; inspector: EvidenceInspector },
  serverNow: Date,
): Promise<{ captureExifAt: Date | null }> {
  const bytes = await ports.storage.download(input.photoPath);
  if (bytes === null) {
    throw new ApiError(422, ERROR_CODES.PHOTO_NOT_FOUND, 'La foto no existe o no se ha subido');
  }
  const result = ports.inspector.inspect(bytes, input.captureOrigin, serverNow);
  if (!result.ok) {
    const messages = {
      EXIF_REQUIRED: 'La foto de galería necesita datos EXIF válidos; usa la cámara',
      PHOTO_TOO_OLD: 'La foto es demasiado antigua',
      UNSUPPORTED_MEDIA: 'Tipo de imagen no admitido',
    } as const;
    throw new ApiError(422, ERROR_CODES[result.code], messages[result.code]);
  }
  return { captureExifAt: result.captureExifAt };
}

/** Error shape of supabase-js / PostgREST: RAISE message → `message`, DETAIL → `details`, SQLSTATE → `code`.
 * Source: https://docs.postgrest.org/en/stable/references/errors.html */
export interface RpcError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/** Translates errors of the create_contribution RPC (T10.a). Unknown ones come back as a generic Error (500). */
export function mapCreateRpcError(error: RpcError): Error {
  const message = error.message ?? '';
  if (error.code === 'P0001') {
    switch (message) {
      case 'IDEMPOTENCY_CONFLICT':
        return new ApiError(409, ERROR_CODES.IDEMPOTENCY_CONFLICT, 'La clave de idempotencia ya se usó con otro contenido');
      case 'INVALID_REQUEST':
        return new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Solicitud inválida');
      case 'INVALID_MUNICIPALITY':
        return new ApiError(422, ERROR_CODES.INVALID_MUNICIPALITY, 'Municipio inválido');
      case 'PENDING_CONTRIBUTION_EXISTS':
        return new ApiError(
          409,
          ERROR_CODES.PENDING_CONTRIBUTION_EXISTS,
          'Ya tienes una aportación sin resolver de este tipo',
        );
      case 'COOLDOWN_ACTIVE':
        return new ApiError(409, ERROR_CODES.COOLDOWN_ACTIVE, 'Debes esperar antes de enviar otra aportación', retryAt(error.details));
    }
  }
  if (
    error.code === '23505' &&
    (message.includes('contributions_evidence_path_key') || (error.details ?? '').includes('(evidence_path)'))
  ) {
    return new ApiError(409, ERROR_CODES.PHOTO_ALREADY_USED, 'La foto ya está asociada a otra aportación');
  }
  return new Error('Create contribution failed');
}

function retryAt(detail: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(detail ?? '') as { retryAt?: unknown };
    if (typeof parsed.retryAt === 'string') {
      const at = new Date(parsed.retryAt);
      if (!Number.isNaN(at.getTime())) return { retryAt: at.toISOString() };
    }
  } catch {
    // fall through: no usable detail
  }
  return {};
}

export interface CreateRpcRow {
  id: string;
  status: string;
  submitted_at: string;
  points_snapshot: number;
  validation_version: number;
  created: boolean;
}

export function toCreateResponse(row: CreateRpcRow): CreateContributionResponse {
  return {
    id: row.id,
    status: row.status as CreateContributionResponse['status'],
    submittedAt: new Date(row.submitted_at).toISOString(),
    pointsIfApproved: row.points_snapshot,
  };
}

/** Columns `toContributionDto` needs; the route selects exactly these. */
export const CONTRIBUTION_DTO_COLUMNS =
  'id, action_type, status, ai_reason, submitted_at, approved_at, hidden_at, points_snapshot, processing_lease_until';

export interface ContributionRow {
  id: string;
  action_type: ActionType;
  status: ContributionStatus;
  ai_reason: string | null;
  submitted_at: string;
  approved_at: string | null;
  hidden_at: string | null;
  points_snapshot: number;
  processing_lease_until: string | null;
}

/** PENDING with no live reservation: nobody is validating it, so it can be retried. */
export function isLeaseLive(row: Pick<ContributionRow, 'status' | 'processing_lease_until'>, now: Date): boolean {
  return row.status === 'PENDING' && row.processing_lease_until !== null &&
    new Date(row.processing_lease_until).getTime() > now.getTime();
}

/** api-contracts §4. Never exposes evidence/public paths, version, lease or idempotency data. */
export function toContributionDto(row: ContributionRow, now: Date): ContributionDto {
  const hidden = row.hidden_at !== null;
  return {
    id: row.id,
    actionType: row.action_type,
    status: row.status,
    reason: row.ai_reason,
    submittedAt: new Date(row.submitted_at).toISOString(),
    approvedAt: row.approved_at === null ? null : new Date(row.approved_at).toISOString(),
    isHidden: hidden,
    effectivePoints: row.status === 'APPROVED' && !hidden ? row.points_snapshot : 0,
    canRetry: row.status === 'TECHNICAL_ERROR' ||
      (row.status === 'PENDING' && !isLeaseLive(row, now)),
    canProvideEvidence: row.status === 'NEEDS_EVIDENCE',
    canCancel: row.status === 'PENDING' || row.status === 'NEEDS_EVIDENCE' ||
      row.status === 'TECHNICAL_ERROR',
  };
}

/** Errors of cancel_contribution / retry_validation / submit_evidence (T13.a). */
export function mapCommandRpcError(error: RpcError): Error {
  const message = error.message ?? '';
  if (error.code === 'P0001') {
    switch (message) {
      case 'NOT_FOUND':
        return new ApiError(404, ERROR_CODES.NOT_FOUND, 'Aportación no encontrada');
      case 'INVALID_STATE':
        return new ApiError(409, ERROR_CODES.INVALID_STATE, 'La aportación no está en un estado que lo permita');
      case 'INVALID_REQUEST':
        return new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Solicitud inválida');
      case 'RATE_LIMITED':
        return new ApiError(429, ERROR_CODES.RATE_LIMITED, 'Demasiadas denuncias; inténtalo más tarde');
      case 'CANNOT_LIKE_OWN':
        return new ApiError(403, ERROR_CODES.CANNOT_LIKE_OWN, 'No puedes dar Me gusta a tu propia publicación');
    }
  }
  if (
    error.code === '23505' &&
    (message.includes('contributions_evidence_path_key') || (error.details ?? '').includes('(evidence_path)'))
  ) {
    return new ApiError(409, ERROR_CODES.PHOTO_ALREADY_USED, 'La foto ya está asociada a otra aportación');
  }
  return new Error('Contribution command failed');
}
