import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { ERROR_CODES, type ProfileDto } from './contracts.ts';
import { createServiceClient } from './db.ts';
import { ApiError } from './http.ts';

export interface TokenVerifier {
  verify(token: string): Promise<{ userId: string } | null>;
}

/**
 * Verifies Supabase Auth access tokens with getUser(token) and derives identity from `user.id`.
 * getUser asks Auth, so it detects sessions that were revoked after the JWT was issued.
 * Source: https://supabase.com/docs/guides/auth/server-side/advanced-guide
 */
export function createSupabaseTokenVerifier(): TokenVerifier {
  return {
    async verify(token: string): Promise<{ userId: string } | null> {
      try {
        const { data, error } = await createServiceClient().auth.getUser(token);
        const userId = data?.user?.id;
        return error || typeof userId !== 'string' || userId.length === 0 ? null : { userId };
      } catch {
        return null;
      }
    },
  };
}

function bearerToken(req: Request): string | null {
  const value = req.headers.get('Authorization');
  const match = value === null ? null : /^Bearer\s+([^\s]+)$/i.exec(value);
  return match?.[1] ?? null;
}

export async function requireUser(req: Request, verifier: TokenVerifier): Promise<{ userId: string }> {
  const token = bearerToken(req);
  const user = token === null ? null : await verifier.verify(token);
  if (user === null) {
    throw new ApiError(401, ERROR_CODES.AUTH_REQUIRED, 'Autenticación requerida');
  }
  return user;
}

export async function optionalUser(req: Request, verifier: TokenVerifier): Promise<{ userId: string } | null> {
  const token = bearerToken(req);
  return token === null ? null : await verifier.verify(token);
}

export async function requireProfile(userId: string, db: SupabaseClient): Promise<ProfileDto> {
  const { data, error } = await db
    .from('profiles')
    .select('user_id, alias')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Profile lookup failed');
  if (!data) {
    throw new ApiError(403, ERROR_CODES.PROFILE_REQUIRED, 'Completa tu perfil');
  }
  return { userId: data.user_id, alias: data.alias };
}
