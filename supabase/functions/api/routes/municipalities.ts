// GET /municipalities?q=&limit= (T10.c1). Public; the catalogue (a few hundred rows) is loaded once
// per instance with the service-role client and searched in memory.
// Contract: docs/design/api-contracts.md §3, §4.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { ERROR_CODES, type MunicipalitiesResponse, type MunicipalityDto } from '../domain/contracts.ts';
import { ApiError, json } from '../domain/http.ts';
import type { Route } from '../index.ts';

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface CatalogueEntry extends MunicipalityDto {
  /** Name without diacritics, lowercase. */
  key: string;
}

/** NFD, no combining marks, lowercase: "Vallès" and "VALLES" compare equal. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function invalid(field: string, message: string): ApiError {
  return new ApiError(400, ERROR_CODES.INVALID_REQUEST, message, { field });
}

function parseLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(raw)) throw invalid('limit', 'limit debe ser un entero');
  const limit = Number(raw);
  if (limit < 1 || limit > MAX_LIMIT) throw invalid('limit', `limit debe estar entre 1 y ${MAX_LIMIT}`);
  return limit;
}

export function municipalityRoutes(deps: { db: () => SupabaseClient }): Route[] {
  let catalogue: Promise<CatalogueEntry[]> | undefined;

  async function loadCatalogue(): Promise<CatalogueEntry[]> {
    const { data, error } = await deps.db().from('municipalities').select('code, name, province_name')
      .order('code').limit(10_000);
    if (error) throw new Error('Municipality catalogue unavailable');
    return (data as { code: string; name: string; province_name: string }[])
      .map((row) => ({
        code: row.code,
        name: row.name,
        provinceName: row.province_name,
        key: normalizeSearch(row.name),
      }))
      .sort((a, b) => a.key.localeCompare(b.key) || a.code.localeCompare(b.code));
  }

  function getCatalogue(): Promise<CatalogueEntry[]> {
    if (!catalogue) {
      catalogue = loadCatalogue().catch((err) => {
        catalogue = undefined; // a failed load must not be cached
        throw err;
      });
    }
    return catalogue;
  }

  return [{
    method: 'GET',
    path: '/municipalities',
    handler: async (req) => {
      const params = new URL(req.url).searchParams;
      const q = (params.get('q') ?? '').trim();
      if (q.length < MIN_QUERY_LENGTH) {
        throw invalid('q', `q debe tener al menos ${MIN_QUERY_LENGTH} caracteres`);
      }
      const limit = parseLimit(params.get('limit'));

      const needle = normalizeSearch(q);
      const digitsOnly = /^\d+$/.test(q);
      const items: MunicipalityDto[] = [];
      for (const m of await getCatalogue()) {
        if (m.key.includes(needle) || (digitsOnly && m.code.startsWith(q))) {
          items.push({ code: m.code, name: m.name, provinceName: m.provinceName });
          if (items.length === limit) break;
        }
      }
      const body: MunicipalitiesResponse = { items, nextCursor: null };
      return json(body);
    },
  }];
}
