import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { requireUser, type TokenVerifier } from '../domain/auth.ts';
import { json } from '../domain/http.ts';
import { createProfile, getOwnProfile, parseCreateProfile } from '../domain/profile.ts';
import type { Route } from '../index.ts';

export function profileRoutes(deps: { verifier: TokenVerifier; db: () => SupabaseClient }): Route[] {
  return [
    {
      method: 'POST',
      path: '/profiles',
      handler: async (req) => {
        const user = await requireUser(req, deps.verifier);
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          body = null;
        }
        const input = parseCreateProfile(body);
        return json(await createProfile(user.userId, input, deps.db()), 201);
      },
    },
    {
      method: 'GET',
      path: '/profiles/me',
      handler: async (req) => {
        const user = await requireUser(req, deps.verifier);
        return json(await getOwnProfile(user.userId, deps.db()));
      },
    },
  ];
}
