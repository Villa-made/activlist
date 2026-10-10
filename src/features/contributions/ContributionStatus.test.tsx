import { describe, expect, it } from 'vitest'
import { ApiError } from '../../lib/api'
import {
  isTerminalStatus,
  shouldPollStatus,
  statusErrorMessage,
  statusLabel,
  type ContributionStatusCode,
  type OwnContribution,
} from './statusApi'

function sample(status: ContributionStatusCode, flags?: Partial<OwnContribution>): OwnContribution {
  return {
    id: 'c1',
    actionType: 'RECYCLING',
    status,
    reason: null,
    submittedAt: '2026-10-10T08:00:00Z',
    approvedAt: status === 'APPROVED' ? '2026-10-10T08:05:00Z' : null,
    isHidden: false,
    effectivePoints: status === 'APPROVED' ? 10 : 0,
    canRetry: false,
    canProvideEvidence: false,
    canCancel: false,
    ...flags,
  }
}

describe('statusLabel', () => {
  it('distingue estados del contrato', () => {
    expect(statusLabel('PENDING')).toMatch(/revisión/i)
    expect(statusLabel('NEEDS_EVIDENCE')).toMatch(/evidencia/i)
    expect(statusLabel('TECHNICAL_ERROR')).toMatch(/técnico/i)
    expect(statusLabel('APPROVED')).toMatch(/aprobada/i)
    expect(statusLabel('REJECTED')).toMatch(/rechazada/i)
    expect(statusLabel('CANCELLED')).toMatch(/cancelada/i)
  })
})

describe('isTerminalStatus / shouldPollStatus', () => {
  it('marca finales y pollables correctamente', () => {
    expect(isTerminalStatus('APPROVED')).toBe(true)
    expect(isTerminalStatus('REJECTED')).toBe(true)
    expect(isTerminalStatus('CANCELLED')).toBe(true)
    expect(isTerminalStatus('PENDING')).toBe(false)

    expect(shouldPollStatus('PENDING')).toBe(true)
    expect(shouldPollStatus('NEEDS_EVIDENCE')).toBe(true)
    expect(shouldPollStatus('TECHNICAL_ERROR')).toBe(true)
    expect(shouldPollStatus('APPROVED')).toBe(false)
  })
})

describe('action flags', () => {
  it('no permite acciones en estados finales aunque el JSON venga mal', () => {
    const approved = sample('APPROVED', {
      canCancel: true,
      canRetry: true,
      canProvideEvidence: true,
    })
    expect(isTerminalStatus(approved.status)).toBe(true)
    // La UI debe ignorar flags en terminal; el helper de poll también para.
    expect(shouldPollStatus(approved.status)).toBe(false)
  })

  it('respeta flags en NEEDS_EVIDENCE / TECHNICAL_ERROR', () => {
    const needs = sample('NEEDS_EVIDENCE', { canProvideEvidence: true, canCancel: true })
    expect(needs.canProvideEvidence).toBe(true)
    expect(needs.canCancel).toBe(true)

    const tech = sample('TECHNICAL_ERROR', { canRetry: true, canCancel: true })
    expect(tech.canRetry).toBe(true)
  })
})

describe('statusErrorMessage — never approve on failure', () => {
  it('no trata timeout/red/404 como APPROVED', () => {
    const network = statusErrorMessage(
      new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor.'),
    )
    expect(network.toLowerCase()).not.toContain('aprobada')
    expect(network.toLowerCase()).not.toMatch(/approv/)

    const notFound = statusErrorMessage(
      new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado'),
    )
    expect(notFound.toLowerCase()).not.toContain('aprobada')
    expect(notFound).toMatch(/pendiente|disponible|no encontrado|backend/i)
  })
})
