import { ApiError, apiRequest, newIdempotencyKey } from '../../lib/api'
import { getAccessToken, TURNSTILE_SITE_KEY } from '../identity/authService'
import { areDevFixturesEnabled } from './readApi'

export interface ReportAccepted {
  accepted: true
}

/** Autoría por alias público del feed (DTO sin userId/isMine). */
export function isOwnPost(authorAlias: string, myAlias: string | null | undefined): boolean {
  if (!myAlias) return false
  return authorAlias.localeCompare(myAlias, undefined, { sensitivity: 'accent' }) === 0
}

/** COM-04: no like propio. */
export function canToggleLike(authorAlias: string, myAlias: string | null | undefined): boolean {
  return Boolean(myAlias) && !isOwnPost(authorAlias, myAlias)
}

/** Actualización local de likes tras PUT/DELETE exitoso; no toca puntos. */
export function applyLikeToggle(
  likedByMe: boolean,
  likeCount: number,
): { likedByMe: boolean; likeCount: number } {
  if (likedByMe) {
    return { likedByMe: false, likeCount: Math.max(0, likeCount - 1) }
  }
  return { likedByMe: true, likeCount: likeCount + 1 }
}

export function communityErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404 || e.code === 'NOT_FOUND') {
      return 'Las interacciones de comunidad aún no están disponibles en el servidor (T19–T21 pendientes).'
    }
    if (e.code === 'AUTH_REQUIRED') {
      return 'Necesitas iniciar sesión para esta acción.'
    }
    if (e.code === 'NOT_OWNER') {
      return 'Solo el autor puede ocultar esta publicación.'
    }
    if (e.code === 'CAPTCHA_FAILED') {
      return e.message || 'La verificación anti-bots ha fallado. Vuelve a intentarlo.'
    }
    if (e.code === 'INVALID_STATE') {
      return e.message || 'Esta acción no está permitida en el estado actual.'
    }
    if (e.code === 'NETWORK_ERROR' || e.code === 'NOT_CONFIGURED') {
      return e.message
    }
    return e.message || 'No se pudo completar la acción.'
  }
  if (e instanceof Error) return e.message
  return 'No se pudo completar la acción.'
}

export function assertReportInput(reason: string, turnstileToken: string | null): void {
  const trimmed = reason.trim()
  if (!trimmed) {
    throw new ApiError(400, 'INVALID_REQUEST', 'Indica el motivo de la denuncia.')
  }
  const captchaRequired = Boolean(TURNSTILE_SITE_KEY) || !areDevFixturesEnabled()
  if (captchaRequired && !turnstileToken) {
    throw new ApiError(400, 'CAPTCHA_FAILED', 'Completa la verificación anti-bots.')
  }
}

export async function likeContribution(contributionId: string): Promise<void> {
  if (areDevFixturesEnabled()) return
  await apiRequest<void>('PUT', `/v1/contributions/${encodeURIComponent(contributionId)}/like`, {
    auth: true,
    getAccessToken,
    idempotencyKey: newIdempotencyKey(),
  })
}

export async function unlikeContribution(contributionId: string): Promise<void> {
  if (areDevFixturesEnabled()) return
  await apiRequest<void>(
    'DELETE',
    `/v1/contributions/${encodeURIComponent(contributionId)}/like`,
    {
      auth: true,
      getAccessToken,
      idempotencyKey: newIdempotencyKey(),
    },
  )
}

export async function hideContribution(contributionId: string): Promise<void> {
  if (areDevFixturesEnabled()) return
  await apiRequest<void>('POST', `/v1/contributions/${encodeURIComponent(contributionId)}/hide`, {
    auth: true,
    getAccessToken,
    body: {},
    idempotencyKey: newIdempotencyKey(),
  })
}

export async function reportContribution(
  contributionId: string,
  reason: string,
  turnstileToken: string | null,
): Promise<ReportAccepted> {
  assertReportInput(reason, turnstileToken)
  if (areDevFixturesEnabled()) return { accepted: true }
  return apiRequest<ReportAccepted>('POST', '/v1/reports', {
    body: {
      contributionId,
      reason: reason.trim(),
      turnstileToken: turnstileToken ?? '',
    },
  })
}
