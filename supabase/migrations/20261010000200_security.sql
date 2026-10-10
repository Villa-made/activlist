-- T01.c — Default-deny grants, own-profile read policy and private buckets
-- (docs/design/data-model.md, ADR-003; Supabase "Securing your API" and "Database Functions" guides).
-- Writes never go through PostgREST as anon/authenticated: the Edge Function API uses service_role.

-- ---------------------------------------------------------------------------
-- Table grants: anon and authenticated lose everything; service_role is untouched.
-- ---------------------------------------------------------------------------
revoke all on table
  public.profiles,
  public.municipalities,
  public.contributions,
  public.likes,
  public.reports
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The only readable data for a signed-in user: their own profile (read only).
-- ---------------------------------------------------------------------------
grant select on table public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- rls_auto_enable(): event-trigger function created by Supabase's "automatic RLS"
-- option (event trigger ensure_rls). It is SECURITY DEFINER and was callable through
-- /rest/v1/rpc/. Only EXECUTE is revoked; neither the function nor the trigger is dropped.
-- ---------------------------------------------------------------------------
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Future functions created by postgres in public (T10.a onwards) are not executable
-- by public/anon/authenticated unless a migration grants it explicitly.
-- Source: https://supabase.com/docs/guides/database/functions (security of functions).
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private buckets. No policy is created on storage.objects: with RLS enabled and
-- no policies, anon and authenticated can neither read nor write objects directly.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidence-private', 'evidence-private', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('published-private', 'published-private', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
