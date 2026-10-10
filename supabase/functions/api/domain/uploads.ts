import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import {
  ALLOWED_IMAGE_TYPES,
  ERROR_CODES,
  MAX_IMAGE_BYTES,
  type CreateUploadRequest,
  type CreateUploadResponse,
} from './contracts.ts';
import { ApiError } from './http.ts';

const EVIDENCE_BUCKET = 'evidence-private';
const SIGNED_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;

export function parseUploadRequest(body: unknown): CreateUploadRequest {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Cuerpo de solicitud inválido');
  }
  const input = body as Record<string, unknown>;
  if (
    typeof input.contentType !== 'string' ||
    typeof input.sizeBytes !== 'number' ||
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes <= 0
  ) {
    throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Solicitud de subida inválida');
  }
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(input.contentType)) {
    throw new ApiError(422, ERROR_CODES.UNSUPPORTED_MEDIA, 'Tipo de imagen no admitido');
  }
  if (input.sizeBytes > MAX_IMAGE_BYTES) {
    throw new ApiError(413, ERROR_CODES.IMAGE_TOO_LARGE, 'La imagen supera el tamaño máximo');
  }
  return { contentType: input.contentType, sizeBytes: input.sizeBytes };
}

export function buildPhotoPath(userId: string): string {
  return `staging/${userId}/${crypto.randomUUID()}`;
}

export async function createUploadToken(
  userId: string,
  _input: CreateUploadRequest,
  db: SupabaseClient,
): Promise<CreateUploadResponse> {
  const photoPath = buildPhotoPath(userId);
  const { data, error } = await db.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(photoPath);
  if (error || !data) throw new Error('Signed upload token creation failed');

  // T01.c measured the actual Supabase signed-upload token lifetime as 7200 seconds.
  // Source: https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl
  return {
    photoPath,
    uploadToken: data.token,
    expiresAt: new Date(Date.now() + SIGNED_UPLOAD_TTL_MS).toISOString(),
  };
}
