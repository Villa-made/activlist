import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { ALIAS_PATTERN, ERROR_CODES, type CreateProfileRequest, type ProfileDto } from './contracts.ts';
import { ApiError } from './http.ts';

export function parseCreateProfile(body: unknown): CreateProfileRequest {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Cuerpo de solicitud inválido');
  }
  const input = body as Record<string, unknown>;
  if (typeof input.alias !== 'string') {
    throw new ApiError(422, ERROR_CODES.INVALID_ALIAS, 'Alias inválido');
  }
  const alias = input.alias.trim();
  if (!ALIAS_PATTERN.test(alias)) {
    throw new ApiError(422, ERROR_CODES.INVALID_ALIAS, 'Alias inválido');
  }
  if (input.adultDeclared !== true) {
    throw new ApiError(422, ERROR_CODES.ADULT_DECLARATION_REQUIRED, 'Debes declarar que eres mayor de edad');
  }
  return { alias, adultDeclared: true };
}

function uniqueConstraint(error: { code: string; message: string }, name: string): boolean {
  return error.code === '23505' && error.message.includes(name);
}

export async function createProfile(
  userId: string,
  input: CreateProfileRequest,
  db: SupabaseClient,
): Promise<ProfileDto> {
  const { data, error } = await db.from('profiles').insert({
    user_id: userId,
    alias: input.alias,
    adult_declared_at: new Date().toISOString(),
  }).select('user_id, alias').single();
  if (error) {
    if (uniqueConstraint(error, 'profiles_pkey')) {
      throw new ApiError(409, ERROR_CODES.PROFILE_EXISTS, 'El perfil ya existe');
    }
    if (uniqueConstraint(error, 'profiles_alias_lower_key')) {
      throw new ApiError(409, ERROR_CODES.ALIAS_TAKEN, 'El alias ya está en uso');
    }
    throw new Error('Profile creation failed');
  }
  return { userId: data.user_id, alias: data.alias };
}

export async function getOwnProfile(userId: string, db: SupabaseClient): Promise<ProfileDto> {
  const { data, error } = await db.from('profiles').select('user_id, alias').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('Profile lookup failed');
  if (!data) throw new ApiError(404, ERROR_CODES.PROFILE_REQUIRED, 'Completa tu perfil');
  return { userId: data.user_id, alias: data.alias };
}
