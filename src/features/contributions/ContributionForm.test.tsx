import { describe, expect, it } from 'vitest'
import { ApiError } from '../../lib/api'
import {
  contributionErrorMessage,
  idempotencyStorageKey,
  validateDescription,
  validatePhotoFile,
} from './contributionApi'

describe('validateDescription', () => {
  it('acepta descripción 1–500 tras trim', () => {
    expect(validateDescription('  Hola  ')).toBe('Hola')
  })

  it('rechaza vacía o demasiado larga', () => {
    expect(() => validateDescription('   ')).toThrow(/descripción/i)
    expect(() => validateDescription('x'.repeat(501))).toThrow(/500/)
  })
})

describe('validatePhotoFile', () => {
  it('rechaza tipo no permitido', () => {
    const file = new File(['x'], 'a.gif', { type: 'image/gif' })
    expect(() => validatePhotoFile(file)).toThrow(/jpeg|png|webp|imagen/i)
  })

  it('rechaza > 5 MB', () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.jpg', {
      type: 'image/jpeg',
    })
    expect(() => validatePhotoFile(big)).toThrow(/5\s*MB/i)
  })

  it('acepta jpeg pequeño', () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    expect(() => validatePhotoFile(file)).not.toThrow()
  })
})

describe('idempotencyStorageKey', () => {
  it('es estable para la misma intención actionType', () => {
    expect(idempotencyStorageKey('RECYCLING')).toBe(
      idempotencyStorageKey('RECYCLING'),
    )
    expect(idempotencyStorageKey('RECYCLING')).not.toBe(
      idempotencyStorageKey('LITTER_COLLECTION'),
    )
  })
})

describe('contributionErrorMessage', () => {
  it('explica cooldown y pendiente sin filtrar internos', () => {
    expect(
      contributionErrorMessage(
        new ApiError(409, 'COOLDOWN_ACTIVE', 'cooldown', {
          retryAt: '2026-10-10T12:00:00Z',
        }),
      ),
    ).toMatch(/60 minutos|Podrás volver/i)

    expect(
      contributionErrorMessage(
        new ApiError(409, 'PENDING_CONTRIBUTION_EXISTS', 'pending'),
      ),
    ).toMatch(/en revisión|pendiente/i)

    expect(
      contributionErrorMessage(
        new ApiError(422, 'EXIF_REQUIRED', 'exif'),
      ),
    ).toMatch(/cámara|galería/i)

    expect(
      contributionErrorMessage(
        new ApiError(413, 'IMAGE_TOO_LARGE', 'big'),
      ),
    ).toMatch(/5 MB/i)
  })
})
