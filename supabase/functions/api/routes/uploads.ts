import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { requireProfile, requireUser, type TokenVerifier } from '../domain/auth.ts';
import { json } from '../domain/http.ts';
import { createUploadToken, parseUploadRequest } from '../domain/uploads.ts';
import type { Route } from '../index.ts';

export function uploadRoutes(deps: { verifier: TokenVerifier; db: () => SupabaseClient }): Route[] {
  return [{
    method: 'POST',
    path: '/uploads',
    handler: async (req) => {
      const user = await requireUser(req, deps.verifier);
      const db = deps.db();
      await requireProfile(user.userId, db);
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        body = null;
      }
      return json(await createUploadToken(user.userId, parseUploadRequest(body), db), 201);
    },
  }];
}
