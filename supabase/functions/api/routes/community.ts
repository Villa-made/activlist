// Community routes. Contract: docs/design/api-contracts.md §3, §4, §6.
//  - PUT / DELETE /contributions/{id}/like (T20): idempotent, answer the final state, no points.
//  - POST /reports (T21): public, Turnstile verified server-side, rate limited.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { requireProfile, requireUser, type TokenVerifier } from '../domain/auth.ts';
import { ERROR_CODES, type LikeResponse, type ReportResponse } from '../domain/contracts.ts';
import { isUuid, mapCommandRpcError } from '../domain/contribution.ts';
import { ApiError, json } from '../domain/http.ts';
import { createTurnstileVerifier, type TurnstileVerifier } from '../domain/turnstile.ts';
import type { Route } from '../index.ts';

export interface CommunityRouteDeps {
  verifier: TokenVerifier;
  db: () => SupabaseClient;
  /** Defaults to the real Cloudflare verifier with TURNSTILE_SECRET_KEY (fails closed when unset). */
  turnstile?: TurnstileVerifier;
  /** Rate-limit key for a request. Defaults to SHA-256(IP + REPORT_RATE_SALT) (fails closed when unset). */
  rateKey?: (req: Request) => Promise<string>;
}

const REASON_MAX_LENGTH = 500;

function invalid(field: string, message: string): ApiError {
  return new ApiError(400, ERROR_CODES.INVALID_REQUEST, message, { field });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name) ?? '';
  // Never skip verification or hash with an empty salt: a missing secret is a 500, not a bypass.
  if (value === '') throw new Error(`${name} is not configured`);
  return value;
}

/** SHA-256 hex of (first x-forwarded-for value + salt). The IP is neither stored nor logged. */
async function defaultRateKey(req: Request): Promise<string> {
  const salt = requiredEnv('REPORT_RATE_SALT');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + salt));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function communityRoutes(deps: CommunityRouteDeps): Route[] {
  const setLike = (liked: boolean): Route['handler'] => async (req, params) => {
    const user = await requireUser(req, deps.verifier);
    const db = deps.db();
    await requireProfile(user.userId, db);
    if (!isUuid(params.id)) {
      throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Publicación no encontrada');
    }
    const { data, error } = await db.rpc('set_like', {
      p_user: user.userId,
      p_id: params.id,
      p_liked: liked,
    });
    if (error) throw mapCommandRpcError(error);
    const row = (Array.isArray(data) ? data[0] : data) as { liked?: boolean; like_count?: number } | undefined;
    if (!row || typeof row.liked !== 'boolean' || typeof row.like_count !== 'number') {
      throw new Error('set_like returned no row');
    }
    const body: LikeResponse = { liked: row.liked, likeCount: row.like_count };
    return json(body, 200);
  };

  const report: Route['handler'] = async (req) => {
    // 1. Parsing (400). A missing or non-string token is not a parsing error: it fails Turnstile (403).
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Cuerpo de solicitud inválido');
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Cuerpo de solicitud inválido');
    }
    const input = body as Record<string, unknown>;
    if (typeof input.contributionId !== 'string' || !isUuid(input.contributionId)) {
      throw invalid('contributionId', 'contributionId debe ser un UUID');
    }
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (reason.length < 1 || reason.length > REASON_MAX_LENGTH) {
      throw invalid('reason', `El motivo debe tener entre 1 y ${REASON_MAX_LENGTH} caracteres`);
    }

    // 2. Turnstile, before touching the database.
    const token = typeof input.turnstileToken === 'string' ? input.turnstileToken : '';
    const turnstile = deps.turnstile ?? createTurnstileVerifier(requiredEnv('TURNSTILE_SECRET_KEY'));
    if (token === '' || !(await turnstile.verify(token))) {
      throw new ApiError(403, ERROR_CODES.CAPTCHA_FAILED, 'No se pudo verificar que eres una persona');
    }

    // 3. Rate limit + insert, atomically in the RPC.
    const keyHash = await (deps.rateKey ?? defaultRateKey)(req);
    const { error } = await deps.db().rpc('submit_report', {
      p_key_hash: keyHash,
      p_contribution: input.contributionId.toLowerCase(),
      p_reason: reason,
    });
    if (error) {
      if (error.code === 'P0001' && error.message === 'RATE_LIMITED') {
        throw new ApiError(429, ERROR_CODES.RATE_LIMITED, 'Demasiadas denuncias; inténtalo más tarde');
      }
      throw mapCommandRpcError(error);
    }
    // Accepted whether or not a row was inserted: the answer reveals nothing about the target.
    const accepted: ReportResponse = { accepted: true };
    return json(accepted, 202);
  };

  return [
    { method: 'PUT', path: '/contributions/:id/like', handler: setLike(true) },
    { method: 'DELETE', path: '/contributions/:id/like', handler: setLike(false) },
    { method: 'POST', path: '/reports', handler: report },
  ];
}
