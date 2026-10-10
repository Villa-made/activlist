import { ERROR_CODES } from './domain/contracts.ts';
import { createSupabaseTokenVerifier } from './domain/auth.ts';
import { createServiceClient } from './domain/db.ts';
import { ApiError, corsHeaders, httpError, parseAllowedOrigins, withCors } from './domain/http.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import {
  type EvidenceInspector,
  type EvidenceSanitizer,
  type EvidenceValidator,
  supabaseEvidenceStorage,
  supabasePublishedStorage,
  supabaseValidationRepository,
} from './domain/ports.ts';
import type { ValidationPorts } from './domain/validation-workflow.ts';
import { communityRoutes } from './routes/community.ts';
import { contributionRoutes } from './routes/contributions.ts';
import { mediaRoutes } from './routes/media.ts';
import { municipalityRoutes } from './routes/municipalities.ts';
import { publicReadRoutes } from './routes/public-reads.ts';
import { profileRoutes } from './routes/profiles.ts';
import { uploadRoutes } from './routes/uploads.ts';

// Supabase keeps the function name in the path: a call to
// https://<project>.supabase.co/functions/v1/api/v1/... reaches this function as /api/v1/...
// Source: https://supabase.com/docs/guides/functions/routing
const API_PREFIX = '/api/v1';

export interface Route {
  method: string;
  /** Path relative to /api/v1, URLPattern syntax (e.g. `/contributions/:id`). */
  path: string;
  handler: (req: Request, params: Record<string, string>) => Response | Promise<Response>;
}

// Dependencies remain lazy: createServiceClient() reads secrets only inside route handlers.
const productionDeps = { verifier: createSupabaseTokenVerifier(), db: createServiceClient };

// Temporal hasta T09 de C: media/evidence.ts aún no existe. Falla cerrado: sin inspector EXIF real no se
// acepta ninguna foto (el router lo convierte en 500 sin detalles). Nunca sustituirlo por uno permisivo.
const failClosedInspector: EvidenceInspector = {
  inspect() {
    throw new Error('EXIF inspector not available');
  },
};

// Temporal hasta T06/T09 de C (ai/validator.ts, media/): fallan cerrado. Cada validación acaba en
// TECHNICAL_ERROR, nunca en APPROVED. Se sustituyen en T13.d; jamás por un validador que apruebe.
const failClosedValidator: EvidenceValidator = {
  validate() {
    return Promise.reject(new Error('AI validator not available'));
  },
};
const failClosedSanitizer: EvidenceSanitizer = {
  sanitize() {
    return Promise.reject(new Error('Image sanitizer not available'));
  },
};

const productionValidationPorts = (db: SupabaseClient): ValidationPorts => ({
  repository: supabaseValidationRepository(db),
  evidenceStorage: supabaseEvidenceStorage(db),
  publishedStorage: supabasePublishedStorage(db),
  validator: failClosedValidator,
  sanitizer: failClosedSanitizer,
});

const productionRoutes: Route[] = [
  ...profileRoutes(productionDeps),
  ...uploadRoutes(productionDeps),
  ...municipalityRoutes(productionDeps),
  ...publicReadRoutes(productionDeps),
  ...mediaRoutes(productionDeps),
  ...contributionRoutes({
    ...productionDeps,
    inspector: failClosedInspector,
    validationPorts: productionValidationPorts,
  }),
  ...communityRoutes(productionDeps),
];

export function createHandler(routes: Route[]): (req: Request) => Promise<Response> {
  const compiled = routes.map((r) => ({
    method: r.method.toUpperCase(),
    pattern: new URLPattern({ pathname: `${API_PREFIX}${r.path}` }),
    handler: r.handler,
  }));

  return async function handle(req: Request): Promise<Response> {
    const cors = corsHeaders(req, parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS')));

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const url = new URL(req.url);
      for (const route of compiled) {
        if (route.method !== req.method) continue;
        const match = route.pattern.exec({ pathname: url.pathname });
        if (match === null) continue;
        const params = match.pathname.groups as Record<string, string>;
        return withCors(await route.handler(req, params), cors);
      }
      return withCors(httpError(404, ERROR_CODES.NOT_FOUND, 'Recurso no encontrado'), cors);
    } catch (err) {
      if (err instanceof ApiError) {
        return withCors(httpError(err.status, err.code, err.message, err.details), cors);
      }
      // Never expose the stack or the internal message; log only the error class.
      console.error('unhandled error', err instanceof Error ? err.name : typeof err);
      return withCors(httpError(500, ERROR_CODES.INTERNAL, 'Error interno'), cors);
    }
  };
}

export const handler = createHandler(productionRoutes);

if (import.meta.main) {
  Deno.serve(handler);
}
