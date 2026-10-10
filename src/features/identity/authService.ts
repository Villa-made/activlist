import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ApiError, apiRequest } from '../../lib/api'

export interface Profile {
  userId: string
  alias: string
}

/** Contrato v1 / T04: trim + patrón. */
export const ALIAS_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/
export const ALIAS_RULE =
  'El alias debe tener 3–24 caracteres: letras, números, punto, guion o guion bajo.'

const env = import.meta.env
const SUPABASE_URL = (env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''
export const TURNSTILE_SITE_KEY =
  (env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? ''

let client: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new ApiError(
      0,
      'NOT_CONFIGURED',
      'La autenticación no está configurada (faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
    )
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

export function isAuthConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

export async function getAccessToken(): Promise<string | null> {
  if (!isAuthConfigured()) return null
  const { data } = await getSupabase().auth.getSession()
  return data.session?.access_token ?? null
}

export function validateAlias(raw: string): string {
  const alias = raw.trim()
  if (!ALIAS_PATTERN.test(alias)) throw new Error(ALIAS_RULE)
  return alias
}

export function validateAdultDeclared(adult: boolean): void {
  if (!adult) {
    throw new Error('Solo pueden participar personas mayores de 18 años.')
  }
}

export function userFacingAuthError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'ALIAS_TAKEN':
        return 'Ese alias ya está en uso. Elige otro.'
      case 'ADULT_DECLARATION_REQUIRED':
        return 'Debes declarar que eres mayor de 18 años.'
      case 'PROFILE_EXISTS':
        return 'Ya tienes un perfil. Recarga o inicia sesión de nuevo.'
      case 'PROFILE_REQUIRED':
        return 'Completa tu perfil para continuar.'
      case 'INVALID_CREDENTIALS':
        return 'Email o contraseña incorrectos.'
      case 'EMAIL_IN_USE':
        return 'Ya existe una cuenta con ese email. Inicia sesión.'
      case 'CAPTCHA_FAILED':
        return 'La verificación anti-bots ha fallado. Vuelve a intentarlo.'
      case 'WEAK_PASSWORD':
        return 'La contraseña no es válida: usa al menos 8 caracteres.'
      case 'RATE_LIMITED':
        return 'Demasiados intentos. Espera un momento.'
      case 'NOT_CONFIGURED':
        return e.message
      default:
        return e.message || 'Ha ocurrido un error inesperado.'
    }
  }
  if (e instanceof Error) return e.message
  return 'Ha ocurrido un error inesperado.'
}

function toAuthError(message: string, status?: number): ApiError {
  const m = message.toLowerCase()
  if (m.includes('invalid login')) {
    return new ApiError(400, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.')
  }
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('already exists')) {
    return new ApiError(400, 'EMAIL_IN_USE', 'Ya existe una cuenta con ese email. Inicia sesión.')
  }
  if (m.includes('captcha')) {
    return new ApiError(400, 'CAPTCHA_FAILED', 'La verificación anti-bots ha fallado. Vuelve a intentarlo.')
  }
  if (m.includes('password')) {
    return new ApiError(400, 'WEAK_PASSWORD', 'La contraseña no es válida: usa al menos 8 caracteres.')
  }
  if (status === 429) {
    return new ApiError(429, 'RATE_LIMITED', 'Demasiados intentos. Espera un momento.')
  }
  return new ApiError(status ?? 0, 'AUTH_ERROR', 'No se pudo completar la autenticación.')
}

export async function fetchMyProfile(): Promise<Profile | null> {
  try {
    return await apiRequest<Profile>('GET', '/v1/profiles/me', {
      auth: true,
      getAccessToken,
    })
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.code === 'PROFILE_REQUIRED')) {
      return null
    }
    throw e
  }
}

export async function createProfile(alias: string): Promise<Profile> {
  const normalized = validateAlias(alias)
  return apiRequest<Profile>('POST', '/v1/profiles', {
    auth: true,
    getAccessToken,
    body: { alias: normalized, adultDeclared: true },
  })
}

export async function signUp(
  email: string,
  password: string,
  captchaToken: string | null,
): Promise<void> {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  })
  if (error) throw toAuthError(error.message, error.status)
  if (!data.session) {
    throw new ApiError(
      0,
      'NO_SESSION',
      'La cuenta se creó pero no se inició sesión. Prueba a entrar con tus datos.',
    )
  }
}

export async function signIn(
  email: string,
  password: string,
  captchaToken: string | null,
): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  })
  if (error) throw toAuthError(error.message, error.status)
}

export async function signOut(): Promise<void> {
  if (!isAuthConfigured()) return
  await getSupabase().auth.signOut()
}

export async function hasSession(): Promise<boolean> {
  if (!isAuthConfigured()) return false
  const { data } = await getSupabase().auth.getSession()
  return data.session !== null
}

export function subscribeAuth(onChange: () => void): () => void {
  if (!isAuthConfigured()) return () => {}
  const { data } = getSupabase().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      onChange()
    }
  })
  return () => data.subscription.unsubscribe()
}
