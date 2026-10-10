import { ERROR_CODES } from './contracts.ts';
import { ApiError } from './http.ts';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface PageRequest {
  limit: number;
  offset: number;
}

export interface FeedRpcRow {
  id: string;
  author_alias: string;
  action_type: string;
  description: string;
  municipality_code: string;
  municipality_name: string;
  published_at: string;
  like_count: number | string;
  liked_by_me: boolean;
}

export interface LeaderboardRpcRow {
  rank: number | string;
  user_id: string;
  alias: string;
  points: number | string;
}

function invalid(field: 'limit' | 'cursor'): ApiError {
  return new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Parámetro de paginación inválido', { field });
}

export function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ o: offset })).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeCursor(cursor: string): number {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalid('cursor');
  try {
    const base64 = cursor.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - cursor.length % 4) % 4);
    const decoded: unknown = JSON.parse(atob(base64));
    if (decoded === null || typeof decoded !== 'object' || !Number.isInteger((decoded as { o?: unknown }).o)) {
      throw invalid('cursor');
    }
    const offset = (decoded as { o: number }).o;
    if (offset < 0) throw invalid('cursor');
    return offset;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalid('cursor');
  }
}

export function parsePage(url: URL): PageRequest {
  const rawLimit = url.searchParams.get('limit');
  if (rawLimit !== null && (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(Number(rawLimit)))) {
    throw invalid('limit');
  }
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  if (limit < 1 || limit > MAX_LIMIT) throw invalid('limit');
  const cursor = url.searchParams.get('cursor');
  return { limit, offset: cursor === null ? 0 : decodeCursor(cursor) };
}

export function toFeedItem(row: FeedRpcRow) {
  return {
    id: row.id,
    authorAlias: row.author_alias,
    actionType: row.action_type,
    description: row.description,
    municipality: { code: row.municipality_code, name: row.municipality_name },
    imageUrl: `/v1/media/${row.id}`,
    publishedAt: new Date(row.published_at).toISOString(),
    likeCount: Number(row.like_count),
    likedByMe: row.liked_by_me,
  };
}

export function toLeaderboardItem(row: LeaderboardRpcRow) {
  return { rank: Number(row.rank), userId: row.user_id, alias: row.alias, points: Number(row.points) };
}

export function pageWithNext<T>(rows: T[], request: PageRequest): { items: T[]; nextCursor: string | null } {
  const hasNext = rows.length > request.limit;
  return {
    items: hasNext ? rows.slice(0, request.limit) : rows,
    nextCursor: hasNext ? encodeCursor(request.offset + request.limit) : null,
  };
}
