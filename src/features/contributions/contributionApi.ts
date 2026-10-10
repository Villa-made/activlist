import { createClient } from '@supabase/supabase-js'
import { ApiError, apiRequest, newIdempotencyKey } from '../../lib/api'
import { getAccessToken, isAuthConfigured } from '../identity/authService'

export type ActionType = 'RECYCLING' | 'LITTER_COLLECTION'
export type CaptureOrigin = 'GALLERY' | 'CAMERA_FLOW'

export interface Municipality {
  code: string
  name: string
  provinceName?: string
}

export interface CreateContributionRequest {
  actionType: ActionType
  description: string
  municipalityCode: string
  photoPath: string
  captureOrigin: CaptureOrigin
}

export interface CreateContributionResponse {
  id: string
  status: 'PENDING'
  submittedAt: string
  pointsIfApproved: number
}

interface UploadTicket {
  photoPath: string
  uploadToken: string
  expiresAt: string
}

interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export const EVIDENCE_BUCKET = 'evidence-private'
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

const env = import.meta.env
const SUPABASE_URL = (env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

export function validateDescription(raw: string): string {
  const description = raw.trim()
  if (description.length < 1 || description.length > 500) {
    throw new Error('La descripción debe tener entre 1 y 500 caracteres.')
  }
  return description
}

export function validatePhotoFile(file: File): void {
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Usa una imagen JPEG, PNG o WebP.')
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error('La imagen supera 5 MB.')
  }
}

export function idempotencyStorageKey(actionType: ActionType): string {
  return `21fib:idempotency:contribution:${actionType}`
}

/** Misma clave por intención (actionType) mientras no se complete un envío nuevo. */
export function getOrCreateIdempotencyKey(actionType: ActionType): string {
  const key = idempotencyStorageKey(actionType)
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const created = newIdempotencyKey()
    sessionStorage.setItem(key, created)
    return created
  } catch {
    return newIdempotencyKey()
  }
}

export function clearIdempotencyKey(actionType: ActionType): void {
  try {
    sessionStorage.removeItem(idempotencyStorageKey(actionType))
  } catch {
    /* ignore */
  }
}

export function contributionErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) {
    return e instanceof Error ? e.message : 'Ha ocurrido un error inesperado.'
  }
  switch (e.code) {
    case 'AUTH_REQUIRED':
      return 'Tu sesión ha caducado. Vuelve a iniciar sesión.'
    case 'PENDING_CONTRIBUTION_EXISTS':
      return 'Ya tienes una contribución de este tipo en revisión. Espera el resultado o cancélala.'
    case 'COOLDOWN_ACTIVE': {
      const retryAt =
        typeof e.details.retryAt === 'string' ? new Date(e.details.retryAt) : null
      return retryAt && !Number.isNaN(retryAt.getTime())
        ? `Ya registraste esta acción hace poco. Podrás volver a hacerlo a las ${retryAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`
        : 'Ya registraste esta acción hace menos de 60 minutos.'
    }
    case 'EXIF_REQUIRED':
      return 'La foto de la galería no tiene fecha de captura. Haz una foto nueva con la cámara.'
    case 'PHOTO_TOO_OLD':
      return 'La foto se hizo hace más de 60 minutos. Haz una foto nueva con la cámara.'
    case 'INVALID_MUNICIPALITY':
      return 'Selecciona un municipio de la lista.'
    case 'UNSUPPORTED_MEDIA':
      return 'Tipo de imagen no admitido. Usa JPEG, PNG o WebP.'
    case 'IMAGE_TOO_LARGE':
      return 'La imagen supera 5 MB.'
    case 'INVALID_STATE':
      return 'Esta acción ya no está disponible para esta contribución.'
    case 'IDEMPOTENCY_CONFLICT':
      return 'Se detectó un envío duplicado con datos distintos. Recarga la página e inténtalo de nuevo.'
    case 'NOT_FOUND':
      return 'El servicio aún no está disponible (endpoint pendiente en el backend).'
    case 'UPLOAD_FAILED':
      return e.message
    default:
      if (e.status === 413) return 'La imagen supera 5 MB.'
      if (e.status === 429) return 'Demasiadas peticiones. Espera un momento.'
      if (e.status === 404) {
        return 'El servicio aún no está disponible (endpoint pendiente en el backend).'
      }
      return e.message || 'Ha ocurrido un error inesperado.'
  }
}

export async function searchMunicipalities(
  q: string,
  signal?: AbortSignal,
): Promise<Municipality[]> {
  const trimmed = q.trim()
  if (trimmed.length < 2) return []
  const page = await apiRequest<Page<Municipality>>(
    'GET',
    `/v1/municipalities?q=${encodeURIComponent(trimmed)}&limit=10`,
    { signal },
  )
  return page.items
}

export async function requestUpload(file: File): Promise<UploadTicket> {
  return apiRequest<UploadTicket>('POST', '/v1/uploads', {
    auth: true,
    getAccessToken,
    body: { contentType: file.type, sizeBytes: file.size },
  })
}

/** Token T07 + subida directa a Storage privado. Devuelve `photoPath`. */
export async function uploadEvidence(file: File): Promise<string> {
  validatePhotoFile(file)
  const ticket = await requestUpload(file)
  if (!isAuthConfigured() || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new ApiError(0, 'NOT_CONFIGURED', 'La subida de fotos no está configurada.')
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .uploadToSignedUrl(ticket.photoPath, ticket.uploadToken, file, {
      contentType: file.type,
    })
  if (error) {
    throw new ApiError(0, 'UPLOAD_FAILED', 'No se pudo subir la foto. Inténtalo de nuevo.')
  }
  return ticket.photoPath
}

export function createContribution(
  req: CreateContributionRequest,
  idempotencyKey: string,
): Promise<CreateContributionResponse> {
  return apiRequest<CreateContributionResponse>('POST', '/v1/contributions', {
    auth: true,
    getAccessToken,
    body: req,
    idempotencyKey,
  })
}
