import { describe, expect, it } from 'vitest'
import { ApiError } from '../../lib/api'
import {
  ALIAS_PATTERN,
  ALIAS_RULE,
  userFacingAuthError,
  validateAdultDeclared,
  validateAlias,
} from './authService'

describe('validateAlias', () => {
  it('acepta alias válido del contrato v1', () => {
    expect(validateAlias('Eco_Marta.1')).toBe('Eco_Marta.1')
    expect(ALIAS_PATTERN.test('abc')).toBe(true)
  })

  it('rechaza alias inválido con mensaje seguro', () => {
    expect(() => validateAlias('ab')).toThrow(ALIAS_RULE)
    expect(() => validateAlias('bad alias!')).toThrow(ALIAS_RULE)
    expect(() => validateAlias('  ')).toThrow(ALIAS_RULE)
  })

  it('aplica trim antes de validar', () => {
    expect(validateAlias('  EcoUser  ')).toBe('EcoUser')
  })
})

describe('validateAdultDeclared', () => {
  it('exige declaración adulta', () => {
    expect(() => validateAdultDeclared(false)).toThrow(
      /mayor de 18|mayores de 18/i,
    )
    expect(() => validateAdultDeclared(true)).not.toThrow()
  })
})

describe('userFacingAuthError', () => {
  it('explica alias ocupado sin filtrar datos internos', () => {
    const msg = userFacingAuthError(
      new ApiError(409, 'ALIAS_TAKEN', 'El alias ya está en uso'),
    )
    expect(msg).toMatch(/alias/i)
    expect(msg).not.toMatch(/stack|sql|token/i)
  })

  it('explica credenciales inválidas', () => {
    const msg = userFacingAuthError(
      new ApiError(400, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.'),
    )
    expect(msg).toMatch(/email|contraseña/i)
  })

  it('explica fallo de CAPTCHA', () => {
    const msg = userFacingAuthError(
      new ApiError(400, 'CAPTCHA_FAILED', 'La verificación anti-bots ha fallado.'),
    )
    expect(msg).toMatch(/anti-bots|CAPTCHA|verificación/i)
  })

  it('explica menor sin declaración', () => {
    const msg = userFacingAuthError(
      new ApiError(
        422,
        'ADULT_DECLARATION_REQUIRED',
        'Debes declarar que eres mayor de edad',
      ),
    )
    expect(msg).toMatch(/18|mayor/i)
  })
})
