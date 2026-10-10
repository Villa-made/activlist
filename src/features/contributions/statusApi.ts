import { apiRequest, newIdempotencyKey } from '../../lib/api'
import { getAccessToken } from '../identity/authService'
import type { ActionType, CaptureOrigin } from './contributionApi'
import { contributionErrorMessage } from './contributionApi'

export type ContributionStatusCode =
  | 'PENDING'
  | 'NEEDS_EVIDENCE'
  | 'TECHNICAL_ERROR'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'

export interface OwnContribution {
  id: string
  actionType: ActionType
  status: ContributionStatusCode
  reason: string | null
  submittedAt: string
  approvedAt: string | null
  isHidden: boolean
  effectivePoints: number
  canRetry: boolean
  canProvideEvidence: boolean
  canCancel: boolean
}

const TERMINAL: ReadonlySet<ContributionStatusCode> = new Set([
  'APPROVED',
  'REJECTED',
  'CANCELLED',
])

const POLLABLE: ReadonlySet<ContributionStatusCode> = new Set([
  'PENDING',
  'NEEDS_EVIDENCE',
  'TECHNICAL_ERROR',
])

export function isTerminalStatus(status: ContributionStatusCode): boolean {
  return TERMINAL.has(status)
}

export function shouldPollStatus(status: ContributionStatusCode): boolean {
  return POLLABLE.has(status)
}

/** Nunca convierte fallo de red/timeout en APPROVED. */
export function statusLabel(status: ContributionStatusCode): string {
  switch (status) {
    case 'PENDING':
      return 'En revisión'
    case 'NEEDS_EVIDENCE':
      return 'Se necesita más evidencia'
    case 'TECHNICAL_ERROR':
      return 'Error técnico'
    case 'APPROVED':
      return 'Aprobada'
    case 'REJECTED':
      return 'Rechazada'
    case 'CANCELLED':
      return 'Cancelada'
  }
}

export function statusErrorMessage(e: unknown): string {
  return contributionErrorMessage(e)
}

export function getContribution(
  id: string,
  signal?: AbortSignal,
): Promise<OwnContribution> {
  return apiRequest<OwnContribution>(
    'GET',
    `/v1/contributions/${encodeURIComponent(id)}`,
    { auth: true, getAccessToken, signal },
  )
}

export function provideEvidence(
  id: string,
  photoPath: string,
  captureOrigin: CaptureOrigin,
  idempotencyKey: string = newIdempotencyKey(),
): Promise<OwnContribution> {
  return apiRequest<OwnContribution>(
    'POST',
    `/v1/contributions/${encodeURIComponent(id)}/evidence`,
    {
      auth: true,
      getAccessToken,
      body: { photoPath, captureOrigin },
      idempotencyKey,
    },
  )
}

export function retryContribution(
  id: string,
  idempotencyKey: string = newIdempotencyKey(),
): Promise<OwnContribution> {
  return apiRequest<OwnContribution>(
    'POST',
    `/v1/contributions/${encodeURIComponent(id)}/retry`,
    { auth: true, getAccessToken, body: {}, idempotencyKey },
  )
}

export function cancelContribution(
  id: string,
  idempotencyKey: string = newIdempotencyKey(),
): Promise<OwnContribution> {
  return apiRequest<OwnContribution>(
    'POST',
    `/v1/contributions/${encodeURIComponent(id)}/cancel`,
    { auth: true, getAccessToken, body: {}, idempotencyKey },
  )
}
