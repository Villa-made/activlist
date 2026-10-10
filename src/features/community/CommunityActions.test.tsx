import { describe, expect, it } from 'vitest'
import { ApiError } from '../../lib/api'
import { areDevFixturesEnabled } from './readApi'
import {
  applyLikeToggle,
  assertReportInput,
  canToggleLike,
  communityErrorMessage,
  isOwnPost,
} from './communityApi'

describe('isOwnPost / canToggleLike', () => {
  it('bloquea like propio por alias', () => {
    expect(isOwnPost('EcoDemo', 'EcoDemo')).toBe(true)
    expect(canToggleLike('EcoDemo', 'EcoDemo')).toBe(false)
  })

  it('permite like a publicación ajena con sesión', () => {
    expect(isOwnPost('VerdeBCN', 'EcoDemo')).toBe(false)
    expect(canToggleLike('VerdeBCN', 'EcoDemo')).toBe(true)
  })

  it('sin alias de sesión no permite like', () => {
    expect(canToggleLike('VerdeBCN', null)).toBe(false)
    expect(canToggleLike('VerdeBCN', undefined)).toBe(false)
  })
})

describe('applyLikeToggle', () => {
  it('alterna likedByMe y ajusta contador sin tocar puntos', () => {
    expect(applyLikeToggle(false, 2)).toEqual({ likedByMe: true, likeCount: 3 })
    expect(applyLikeToggle(true, 3)).toEqual({ likedByMe: false, likeCount: 2 })
    expect(applyLikeToggle(true, 0)).toEqual({ likedByMe: false, likeCount: 0 })
  })
})

describe('assertReportInput', () => {
  it('exige motivo; CAPTCHA obligatorio si hay site key o sin fixtures', () => {
    expect(() => assertReportInput('', 'tok')).toThrow(ApiError)
    // Sin VITE_TURNSTILE_SITE_KEY en vitest y sin fixtures → aún exige token (API real).
    expect(() => assertReportInput('motivo', null)).toThrow(ApiError)
    expect(() => assertReportInput('  rostros  ', 'tok')).not.toThrow()
  })
})

describe('communityErrorMessage', () => {
  it('explica 404 de T19–T21 sin inventar puntos', () => {
    const msg = communityErrorMessage(new ApiError(404, 'NOT_FOUND', 'missing'))
    expect(msg).toMatch(/T19|T21|disponible|servidor/i)
    expect(msg.toLowerCase()).not.toMatch(/puntos?\s*\+|\+10|\+20/)
  })

  it('mapea AUTH_REQUIRED, NOT_OWNER y CAPTCHA', () => {
    expect(communityErrorMessage(new ApiError(401, 'AUTH_REQUIRED', 'x'))).toMatch(/sesión/i)
    expect(communityErrorMessage(new ApiError(403, 'NOT_OWNER', 'x'))).toMatch(/autor/i)
    expect(
      communityErrorMessage(new ApiError(400, 'CAPTCHA_FAILED', 'CAPTCHA fallido')),
    ).toMatch(/CAPTCHA|anti-bots/i)
  })
})

describe('fixtures gated', () => {
  it('no activa fixtures sin VITE_USE_FIXTURES', () => {
    expect(areDevFixturesEnabled()).toBe(
      Boolean(import.meta.env.DEV && import.meta.env.VITE_USE_FIXTURES === 'true'),
    )
    expect(import.meta.env.VITE_USE_FIXTURES === 'true').toBe(false)
  })
})
