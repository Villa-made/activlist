import { describe, expect, it } from 'vitest'
import { ApiError } from '../../lib/api'
import {
  areDevFixturesEnabled,
  mediaSrc,
  readErrorMessage,
} from './readApi'

describe('areDevFixturesEnabled', () => {
  it('no activa fixtures fuera del flag DEV explícito', () => {
    // En vitest/node, import.meta.env.DEV puede ser true; el flag VITE_USE_FIXTURES no está.
    expect(areDevFixturesEnabled()).toBe(
      Boolean(import.meta.env.DEV && import.meta.env.VITE_USE_FIXTURES === 'true'),
    )
    expect(import.meta.env.VITE_USE_FIXTURES === 'true').toBe(false)
  })
})

describe('mediaSrc', () => {
  it('resuelve imageUrl relativa a la base API', () => {
    const src = mediaSrc('/v1/media/abc')
    expect(src.endsWith('/v1/media/abc') || src.includes('/v1/media/abc')).toBe(true)
  })

  it('no reescribe URLs absolutas', () => {
    expect(mediaSrc('https://cdn.example/x.jpg')).toBe('https://cdn.example/x.jpg')
  })
})

describe('readErrorMessage', () => {
  it('explica 404 de T16 sin filtrar internos', () => {
    const msg = readErrorMessage(new ApiError(404, 'NOT_FOUND', 'Recurso no encontrado'))
    expect(msg).toMatch(/T16|disponible|servidor/i)
    expect(msg.toLowerCase()).not.toContain('stack')
  })

  it('propaga network/config', () => {
    expect(
      readErrorMessage(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor.')),
    ).toMatch(/conectar/i)
  })
})
