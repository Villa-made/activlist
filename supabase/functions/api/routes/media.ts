import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { ERROR_CODES } from '../domain/contracts.ts';
import { ApiError } from '../domain/http.ts';
import { PUBLISHED_BUCKET } from '../domain/ports.ts';
import type { Route } from '../index.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function notFound(): never {
  throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Recurso no encontrado');
}

export function mediaRoutes(deps: { db: () => SupabaseClient }): Route[] {
  return [{
    method: 'GET',
    path: '/media/:id',
    handler: async (_req, params) => {
      if (!UUID.test(params.id)) notFound();

      const db = deps.db();
      const { data, error } = await db
        .from('contributions')
        .select('status, hidden_at, public_photo_path')
        .eq('id', params.id)
        .maybeSingle();
      if (error || !data || data.status !== 'APPROVED' || data.hidden_at !== null || data.public_photo_path === null) {
        notFound();
      }

      // The database-selected path is the only storage path trusted for public media.
      const { data: blob, error: downloadError } = await db.storage
        .from(PUBLISHED_BUCKET)
        .download(data.public_photo_path, {}, { cache: 'no-store' });
      if (downloadError || !blob || !IMAGE_TYPES.has(blob.type)) notFound();

      return new Response(blob, {
        headers: {
          'Content-Type': blob.type,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    },
  }];
}
