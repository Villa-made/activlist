// Contribution routes (T10.c2, T13.c). Contract: docs/design/api-contracts.md §4, plan §4.
// POST /contributions, GET /contributions/{id}, and the cancel / retry / evidence commands. Creation,
// retry and evidence launch the validation worker in the background after answering 202.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { requireProfile, requireUser, type TokenVerifier } from '../domain/auth.ts';
import {
  CONTRIBUTION_DTO_COLUMNS,
  type ContributionRow,
  type CreateRpcRow,
  fingerprint,
  isLeaseLive,
  isUuid,
  mapCommandRpcError,
  mapCreateRpcError,
  parseCreateContribution,
  parseIdempotencyKey,
  parseProvideEvidence,
  prepareEvidence,
  toContributionDto,
  toCreateResponse,
} from '../domain/contribution.ts';
import { ERROR_CODES } from '../domain/contracts.ts';
import { ApiError, json } from '../domain/http.ts';
import { type EvidenceInspector, type EvidenceStorage, supabaseEvidenceStorage } from '../domain/ports.ts';
import { runValidation, type ValidationPorts } from '../domain/validation-workflow.ts';
import type { Route } from '../index.ts';

export interface ContributionRouteDeps {
  verifier: TokenVerifier;
  db: () => SupabaseClient;
  inspector: EvidenceInspector;
  storage?: (db: SupabaseClient) => EvidenceStorage;
  now?: () => Date;
  /** Ports of the validation worker for a given service client. Without them no worker is launched
   * (the row stays PENDING until its lease expires and the author retries). Production always sets it. */
  validationPorts?: (db: SupabaseClient) => ValidationPorts;
  /** Keeps a background promise alive after the response. Defaults to `defaultSchedule`. */
  schedule?: (p: Promise<unknown>) => void;
}

/**
 * Runs a promise after the response. Supabase documents `EdgeRuntime.waitUntil(promise)`: the
 * instance keeps running until the promise settles (do not await it). Without that runtime (tests,
 * local) the promise simply keeps running; its errors are swallowed here (runValidation never throws).
 * Source: https://supabase.com/docs/guides/functions/background-tasks
 */
export function defaultSchedule(p: Promise<unknown>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  const guarded = p.catch(() => undefined);
  if (typeof runtime?.waitUntil === 'function') runtime.waitUntil(guarded);
}

const notFound = () => new ApiError(404, ERROR_CODES.NOT_FOUND, 'Aportación no encontrada');

type OwnRow = ContributionRow & { evidence_path: string };

export function contributionRoutes(deps: ContributionRouteDeps): Route[] {
  const nowFn = deps.now ?? (() => new Date());
  const schedule = deps.schedule ?? defaultSchedule;

  /** The author's own row, or 404 (missing and foreign are indistinguishable). */
  async function ownRow(db: SupabaseClient, id: string, userId: string): Promise<OwnRow> {
    if (!isUuid(id)) throw notFound();
    const { data, error } = await db
      .from('contributions')
      .select(`${CONTRIBUTION_DTO_COLUMNS}, evidence_path`)
      .eq('id', id)
      .eq('author_id', userId)
      .maybeSingle();
    if (error) throw new Error('Contribution lookup failed');
    if (!data) throw notFound();
    return data as OwnRow;
  }

  function launch(db: SupabaseClient, id: string, version: number): void {
    if (!deps.validationPorts) return;
    schedule(runValidation(id, version, deps.validationPorts(db)));
  }

  function newVersion(data: unknown): number {
    const row = (Array.isArray(data) ? data[0] : data) as { validation_version?: number } | undefined;
    if (!row || typeof row.validation_version !== 'number') throw new Error('Command returned no version');
    return row.validation_version;
  }

  return [{
    method: 'GET',
    path: '/contributions/:id',
    handler: async (req, params) => {
      const user = await requireUser(req, deps.verifier);
      const row = await ownRow(deps.db(), params.id, user.userId);
      return json(toContributionDto(row, nowFn()), 200);
    },
  }, {
    method: 'POST',
    path: '/contributions/:id/cancel',
    handler: async (req, params) => {
      const user = await requireUser(req, deps.verifier);
      const db = deps.db();
      await requireProfile(user.userId, db);
      await ownRow(db, params.id, user.userId);
      const { error } = await db.rpc('cancel_contribution', { p_id: params.id, p_author: user.userId });
      if (error) throw mapCommandRpcError(error);
      return json(toContributionDto(await ownRow(db, params.id, user.userId), nowFn()), 200);
    },
  }, {
    // T19: hide an own APPROVED contribution (revokes its points and feed visibility; idempotent).
    method: 'POST',
    path: '/contributions/:id/hide',
    handler: async (req, params) => {
      const user = await requireUser(req, deps.verifier);
      const db = deps.db();
      await requireProfile(user.userId, db);
      await ownRow(db, params.id, user.userId);
      const { error } = await db.rpc('hide_contribution', { p_id: params.id, p_author: user.userId });
      if (error) throw mapCommandRpcError(error);
      return json(toContributionDto(await ownRow(db, params.id, user.userId), nowFn()), 200);
    },
  }, {
    method: 'POST',
    path: '/contributions/:id/retry',
    handler: async (req, params) => {
      const user = await requireUser(req, deps.verifier);
      const db = deps.db();
      await requireProfile(user.userId, db);
      const row = await ownRow(db, params.id, user.userId);
      // Same intent repeated while a worker holds the reservation: current state, no error.
      if (isLeaseLive(row, nowFn())) return json(toContributionDto(row, nowFn()), 202);

      const { data, error } = await db.rpc('retry_validation', { p_id: params.id, p_author: user.userId });
      if (error) {
        if (error.code === 'P0001' && error.message === 'INVALID_STATE') {
          // Lost a race with another retry: if it is now pending with a live lease, answer as a repeat.
          const current = await ownRow(db, params.id, user.userId);
          if (isLeaseLive(current, nowFn())) return json(toContributionDto(current, nowFn()), 202);
        }
        throw mapCommandRpcError(error);
      }
      launch(db, params.id, newVersion(data));
      return json(toContributionDto(await ownRow(db, params.id, user.userId), nowFn()), 202);
    },
  }, {
    method: 'POST',
    path: '/contributions/:id/evidence',
    handler: async (req, params) => {
      const user = await requireUser(req, deps.verifier);
      const db = deps.db();
      await requireProfile(user.userId, db);
      const row = await ownRow(db, params.id, user.userId);

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Cuerpo de solicitud inválido');
      }
      const input = parseProvideEvidence(body, user.userId);
      // The same evidence repeated after it was accepted: current state.
      if (row.status === 'PENDING' && row.evidence_path === input.photoPath) {
        return json(toContributionDto(row, nowFn()), 202);
      }
      if (row.status !== 'NEEDS_EVIDENCE') {
        throw new ApiError(409, ERROR_CODES.INVALID_STATE, 'La aportación no admite nueva evidencia');
      }

      const storage = (deps.storage ?? supabaseEvidenceStorage)(db);
      const { captureExifAt } = await prepareEvidence(input, { storage, inspector: deps.inspector }, nowFn());

      const { data, error } = await db.rpc('submit_evidence', {
        p_id: params.id,
        p_author: user.userId,
        p_evidence_path: input.photoPath,
        p_capture_origin: input.captureOrigin,
        p_capture_exif_at: captureExifAt ? captureExifAt.toISOString() : null,
      });
      if (error) throw mapCommandRpcError(error);
      launch(db, params.id, newVersion(data));
      return json(toContributionDto(await ownRow(db, params.id, user.userId), nowFn()), 202);
    },
  }, {
    method: 'POST',
    path: '/contributions',
    handler: async (req) => {
      const user = await requireUser(req, deps.verifier);
      const db = deps.db();
      await requireProfile(user.userId, db);
      const idempotencyKey = parseIdempotencyKey(req);

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Cuerpo de solicitud inválido');
      }
      const input = parseCreateContribution(body, user.userId);
      const print = await fingerprint(input);

      // Replay before touching the photo: same key + same fingerprint never re-inspects nor re-runs the RPC.
      const { data: existing, error: lookupError } = await db
        .from('contributions')
        .select('id, status, submitted_at, points_snapshot, validation_version, idempotency_fingerprint')
        .eq('author_id', user.userId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (lookupError) throw new Error('Idempotency lookup failed');
      if (existing) {
        if (existing.idempotency_fingerprint !== print) {
          throw new ApiError(
            409,
            ERROR_CODES.IDEMPOTENCY_CONFLICT,
            'La clave de idempotencia ya se usó con otro contenido',
          );
        }
        return json(toCreateResponse({ ...(existing as Omit<CreateRpcRow, 'created'>), created: false }), 202);
      }

      const storage = (deps.storage ?? supabaseEvidenceStorage)(db);
      const { captureExifAt } = await prepareEvidence(input, { storage, inspector: deps.inspector }, nowFn());

      const { data, error } = await db.rpc('create_contribution', {
        p_author_id: user.userId,
        p_action_type: input.actionType,
        p_description: input.description,
        p_municipality_code: input.municipalityCode,
        p_evidence_path: input.photoPath,
        p_capture_origin: input.captureOrigin,
        p_capture_exif_at: captureExifAt ? captureExifAt.toISOString() : null,
        p_idempotency_key: idempotencyKey,
        p_idempotency_fingerprint: print,
      });
      if (error) throw mapCreateRpcError(error);
      const row = (Array.isArray(data) ? data[0] : data) as CreateRpcRow | undefined;
      if (!row) throw new Error('Create contribution returned no row');
      // A replay resolved inside the RPC (created = false) never launches a second worker.
      if (row.created) launch(db, row.id, row.validation_version);
      return json(toCreateResponse(row), 202);
    },
  }];
}
