/// <reference types="vitest/importMeta" />
/**
 * Cliente HTTP del contrato API v1.
 * Base: `${VITE_SUPABASE_URL}/functions/v1/api` + rutas `/v1/...`
 * No decide puntos, estados ni cooldown: solo transporta peticiones.
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RequestOptions {
  body?: unknown
  /** Si true y no hay token, lanza AUTH_REQUIRED sin llamar al servidor. */
  auth?: boolean
  /** Misma clave en reintentos de la misma intención (contrato v1). */
  idempotencyKey?: string
  signal?: AbortSignal
  /** Inyectable para tests / Auth (T05). */
  getAccessToken?: () => Promise<string | null>
  /** Override de base URL (tests). */
  apiBase?: string
}

type ErrorPayload = {
  error?: { code?: string; message?: string; details?: Record<string, unknown> }
}

/** Base del Edge Function `api`; las rutas del contrato empiezan por `/v1`. */
export function getApiBase(env?: { VITE_SUPABASE_URL?: string }): string {
  const url =
    env?.VITE_SUPABASE_URL ??
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
    ''
  return url ? `${url.replace(/\/$/, '')}/functions/v1/api` : ''
}

export function parseApiError(
  status: number,
  payload: unknown,
): ApiError {
  const err = (payload as ErrorPayload | null)?.error
  return new ApiError(
    status,
    err?.code ?? 'UNKNOWN_ERROR',
    err?.message ?? 'Se ha producido un error inesperado.',
    err?.details ?? {},
  )
}

export async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const base = options.apiBase ?? getApiBase()
  if (!base) {
    throw new ApiError(
      0,
      'NOT_CONFIGURED',
      'La aplicación no está configurada (falta VITE_SUPABASE_URL).',
    )
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = options.getAccessToken
    ? await options.getAccessToken()
    : null
  if (token) headers.Authorization = `Bearer ${token}`
  else if (options.auth) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Necesitas iniciar sesión.')
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey

  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No se pudo conectar con el servidor. Revisa tu conexión.',
    )
  }

  if (response.status === 204) return undefined as T

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) throw parseApiError(response.status, payload)
  return payload as T
}

/** `imageUrl` del feed es relativa a la base del API. */
export function resolveMediaUrl(imageUrl: string): string {
  if (/^(https?:|data:|blob:)/.test(imageUrl)) return imageUrl
  return `${getApiBase()}${imageUrl}`
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest

  describe('getApiBase', () => {
    it('devuelve vacío sin VITE_SUPABASE_URL', () => {
      expect(getApiBase({ VITE_SUPABASE_URL: '' })).toBe('')
    })

    it('añade /functions/v1/api sin barra final duplicada', () => {
      expect(
        getApiBase({ VITE_SUPABASE_URL: 'https://proj.supabase.co/' }),
      ).toBe('https://proj.supabase.co/functions/v1/api')
    })
  })

  describe('parseApiError', () => {
    it('mapea error estructurado del contrato v1', () => {
      const err = parseApiError(409, {
        error: {
          code: 'ALIAS_TAKEN',
          message: 'Alias ocupado',
          details: { field: 'alias' },
        },
      })
      expect(err.status).toBe(409)
      expect(err.code).toBe('ALIAS_TAKEN')
      expect(err.message).toBe('Alias ocupado')
      expect(err.details).toEqual({ field: 'alias' })
    })

    it('usa fallbacks seguros si el cuerpo no tiene error', () => {
      const err = parseApiError(500, null)
      expect(err.code).toBe('UNKNOWN_ERROR')
      expect(err.message).toBe('Se ha producido un error inesperado.')
    })
  })

  describe('resolveMediaUrl', () => {
    it('no reescribe URLs absolutas', () => {
      expect(resolveMediaUrl('https://cdn.example/x.jpg')).toBe(
        'https://cdn.example/x.jpg',
      )
    })
  })

  describe('apiRequest', () => {
    it('exige auth sin llamar a fetch cuando falta token', async () => {
      await expect(
        apiRequest('GET', '/v1/profiles/me', {
          auth: true,
          apiBase: 'https://example.test/functions/v1/api',
          getAccessToken: async () => null,
        }),
      ).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 })
    })
  })
}
