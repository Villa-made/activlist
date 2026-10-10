import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

let serviceClient: SupabaseClient | undefined;

function requiredEnvironment(name: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error('Supabase server configuration is unavailable');
  return value;
}

/**
 * Lazy singleton for privileged server operations after request authorization.
 * Supabase injects SUPABASE_URL and the legacy SUPABASE_SERVICE_ROLE_KEY in deployed functions.
 * Source: https://supabase.com/docs/guides/functions/secrets
 */
export function createServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  serviceClient = createClient(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
  );
  return serviceClient;
}
