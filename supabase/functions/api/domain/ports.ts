// Ports consumed by the domain (plan §4, D7). Real implementations of the EXIF inspector belong
// to Dev C (media/evidence.ts, T09); the domain only sees these interfaces so it can run with fakes.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import type {
  ActionType,
  CaptureOrigin,
  ContributionStatus,
  Decision,
  ValidationInput,
  ValidationResult,
} from './contracts.ts';

export type EvidenceInspection =
  | { ok: true; mime: string; captureExifAt: Date | null }
  | { ok: false; code: 'EXIF_REQUIRED' | 'PHOTO_TOO_OLD' | 'UNSUPPORTED_MEDIA' };

export interface EvidenceInspector {
  /** `serverNow` always comes from the server clock, never from client data. */
  inspect(bytes: Uint8Array, origin: CaptureOrigin, serverNow: Date): EvidenceInspection;
}

export interface EvidenceStorage {
  /** Bytes of a private evidence object, or `null` when it does not exist. */
  download(path: string): Promise<Uint8Array | null>;
}

export const EVIDENCE_BUCKET = 'evidence-private';

/**
 * EvidenceStorage over the private bucket, using the service-role client.
 * Source: https://supabase.com/docs/reference/javascript/storage-from-download
 */
export function supabaseEvidenceStorage(db: SupabaseClient): EvidenceStorage {
  return {
    async download(path) {
      const { data, error } = await db.storage.from(EVIDENCE_BUCKET).download(path);
      if (error) {
        const e = error as { status?: number | string; statusCode?: number | string; message?: string };
        const missing = String(e.statusCode ?? e.status) === '404' || /not found/i.test(e.message ?? '');
        if (missing) return null;
        throw new Error('Evidence download failed');
      }
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

// ---- Validation workflow ports (T13.b, plan §4, D7) ------------------------

export interface EvidenceValidator {
  /** Throws on any technical failure (timeout, 429, invalid JSON); never fabricates a decision. */
  validate(input: ValidationInput): Promise<ValidationResult>;
}

export interface EvidenceSanitizer {
  /** Re-encodes the image without metadata. Throws when it cannot (implemented by Dev C, T09). */
  sanitize(bytes: Uint8Array): Promise<{ bytes: Uint8Array; contentType: string }>;
}

export interface ValidationContribution {
  id: string;
  actionType: ActionType;
  description: string;
  evidencePath: string;
  status: ContributionStatus;
  validationVersion: number;
}

export interface ValidationRepository {
  load(id: string): Promise<ValidationContribution | null>;
  /** `false` when the guard (PENDING + version + live lease) does not hold; nothing changed. */
  complete(
    id: string,
    version: number,
    decision: Decision,
    reason: string,
    publicPhotoPath?: string,
  ): Promise<boolean>;
  markTechnicalError(id: string, version: number, reason: string): Promise<boolean>;
}

export interface PublishedStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export const PUBLISHED_BUCKET = 'published-private';

/** ValidationRepository over the T13.a RPC (service_role only). */
export function supabaseValidationRepository(db: SupabaseClient): ValidationRepository {
  return {
    async load(id) {
      const { data, error } = await db
        .from('contributions')
        .select('id, action_type, description, evidence_path, status, validation_version')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error('Validation load failed');
      if (!data) return null;
      return {
        id: data.id,
        actionType: data.action_type,
        description: data.description,
        evidencePath: data.evidence_path,
        status: data.status,
        validationVersion: data.validation_version,
      };
    },
    async complete(id, version, decision, reason, publicPhotoPath) {
      const { data, error } = await db.rpc('complete_validation', {
        p_id: id,
        p_version: version,
        p_decision: decision,
        p_reason: reason,
        p_public_photo_path: publicPhotoPath ?? null,
      });
      if (error) throw new Error('Validation complete failed');
      return data === true;
    },
    async markTechnicalError(id, version, reason) {
      const { data, error } = await db.rpc('mark_technical_error', {
        p_id: id,
        p_version: version,
        p_reason: reason,
      });
      if (error) throw new Error('Validation technical error mark failed');
      return data === true;
    },
  };
}

/**
 * PublishedStorage over the private `published-private` bucket (service-role client, upsert).
 * Source: https://supabase.com/docs/reference/javascript/storage-from-upload
 */
export function supabasePublishedStorage(db: SupabaseClient): PublishedStorage {
  return {
    async upload(path, bytes, contentType) {
      const { error } = await db.storage.from(PUBLISHED_BUCKET).upload(path, bytes, {
        contentType,
        upsert: true,
      });
      if (error) throw new Error('Published upload failed');
    },
    async remove(path) {
      const { error } = await db.storage.from(PUBLISHED_BUCKET).remove([path]);
      if (error) throw new Error('Published remove failed');
    },
  };
}
