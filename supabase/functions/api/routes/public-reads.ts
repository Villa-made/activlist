import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { optionalUser, type TokenVerifier } from '../domain/auth.ts';
import { ERROR_CODES } from '../domain/contracts.ts';
import { ApiError, json } from '../domain/http.ts';
import {
  type PageRequest,
  pageWithNext,
  parsePage,
  toFeedItem,
  toLeaderboardItem,
  type FeedRpcRow,
  type LeaderboardRpcRow,
} from '../domain/public-queries.ts';
import type { Route } from '../index.ts';

export interface PublicReadRouteDeps {
  verifier: TokenVerifier;
  db: () => SupabaseClient;
}

function mapRpcError(error: { code?: string; message?: string }): never {
  if (error.code === 'P0001' && error.message === 'INVALID_REQUEST') {
    throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Parámetro de paginación inválido');
  }
  throw new Error('Public read query failed');
}

async function readPage<TRow, TItem>(
  request: PageRequest,
  query: (limit: number, offset: number) => Promise<{ data: TRow[] | null; error: { code?: string; message?: string } | null }>,
  map: (row: TRow) => TItem,
): Promise<{ items: TItem[]; nextCursor: string | null }> {
  const initial = await query(Math.min(request.limit + 1, 50), request.offset);
  if (initial.error) mapRpcError(initial.error);
  const rows = initial.data ?? [];

  // T16.a caps RPC limits at 50. For the API's limit=50, probe the next row separately.
  if (request.limit === 50 && rows.length === 50) {
    const probe = await query(1, request.offset + 50);
    if (probe.error) mapRpcError(probe.error);
    return pageWithNext([...rows, ...(probe.data ?? [])].map(map), request);
  }
  return pageWithNext(rows.map(map), request);
}

export function publicReadRoutes(deps: PublicReadRouteDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/feed',
      handler: async (req) => {
        const page = parsePage(new URL(req.url));
        const user = await optionalUser(req, deps.verifier);
        return json(await readPage<FeedRpcRow, ReturnType<typeof toFeedItem>>(
          page,
          async (limit, offset) => await deps.db().rpc('get_feed', {
            p_limit: limit, p_offset: offset, p_viewer: user?.userId ?? null,
          }) as { data: FeedRpcRow[] | null; error: { code?: string; message?: string } | null },
          toFeedItem,
        ));
      },
    },
    {
      method: 'GET',
      path: '/leaderboard',
      handler: async (req) => {
        const page = parsePage(new URL(req.url));
        return json(await readPage<LeaderboardRpcRow, ReturnType<typeof toLeaderboardItem>>(
          page,
          async (limit, offset) => await deps.db().rpc('get_leaderboard', {
            p_limit: limit, p_offset: offset,
          }) as { data: LeaderboardRpcRow[] | null; error: { code?: string; message?: string } | null },
          toLeaderboardItem,
        ));
      },
    },
  ];
}
