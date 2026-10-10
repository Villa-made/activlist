import { ApiError, apiRequest, resolveMediaUrl } from '../../lib/api'
import { getAccessToken, isAuthConfigured } from '../identity/authService'

export type ActionType = 'RECYCLING' | 'LITTER_COLLECTION'

export interface FeedItem {
  id: string
  authorAlias: string
  actionType: ActionType
  description: string
  municipality: { code: string; name: string }
  imageUrl: string
  publishedAt: string
  likeCount: number
  likedByMe: boolean
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  alias: string
  points: number
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

/** Solo DEV + flag explícito; nunca en build de producción. */
export function areDevFixturesEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_USE_FIXTURES === 'true'
}

export function readErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404 || e.code === 'NOT_FOUND') {
      return 'El feed/ranking aún no está disponible en el servidor (T16 pendiente).'
    }
    if (e.code === 'NETWORK_ERROR' || e.code === 'NOT_CONFIGURED') {
      return e.message
    }
    return e.message || 'No se pudo cargar.'
  }
  if (e instanceof Error) return e.message
  return 'No se pudo cargar.'
}

export function mediaSrc(imageUrl: string): string {
  return resolveMediaUrl(imageUrl)
}

function fixtureFeed(): Page<FeedItem> {
  return {
    items: [
      {
        id: 'fix-feed-1',
        authorAlias: 'EcoDemo',
        actionType: 'RECYCLING',
        description: 'Separación de envases (fixture DEV).',
        municipality: { code: '08019', name: 'Barcelona' },
        imageUrl: '/v1/media/fixture-1',
        publishedAt: new Date().toISOString(),
        likeCount: 2,
        likedByMe: false,
      },
    ],
    nextCursor: null,
  }
}

function fixtureLeaderboard(): Page<LeaderboardEntry> {
  return {
    items: [
      { rank: 1, userId: 'u1', alias: 'EcoDemo', points: 30 },
      { rank: 1, userId: 'u2', alias: 'VerdeBCN', points: 30 },
      { rank: 3, userId: 'u3', alias: 'ReciclaYa', points: 10 },
    ],
    nextCursor: null,
  }
}

function qs(limit: number, cursor?: string | null): string {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

async function optionalToken(): Promise<string | null> {
  if (!isAuthConfigured()) return null
  try {
    return await getAccessToken()
  } catch {
    return null
  }
}

export async function fetchFeed(
  limit = 20,
  cursor?: string | null,
  signal?: AbortSignal,
): Promise<Page<FeedItem>> {
  if (areDevFixturesEnabled()) return fixtureFeed()
  const token = await optionalToken()
  return apiRequest<Page<FeedItem>>('GET', `/v1/feed?${qs(limit, cursor)}`, {
    getAccessToken: token ? async () => token : undefined,
    signal,
  })
}

export async function fetchLeaderboard(
  limit = 20,
  cursor?: string | null,
  signal?: AbortSignal,
): Promise<Page<LeaderboardEntry>> {
  if (areDevFixturesEnabled()) return fixtureLeaderboard()
  return apiRequest<Page<LeaderboardEntry>>(
    'GET',
    `/v1/leaderboard?${qs(limit, cursor)}`,
    { signal },
  )
}
