-- T20 — Idempotent likes (data-model DB-08, SPEC-community, SPEC-scoring: likes give no points).
-- Called only by the Edge Function with service_role, after it authenticated the user and checked
-- the profile (likes.user_id references profiles).
--
-- Visible = status 'APPROVED' and hidden_at is null (no 30-day window: that one is feed-only).
-- A missing or not visible contribution is NOT_FOUND (indistinguishable). Own publication:
-- CANNOT_LIKE_OWN (the "not your own" rule cannot be a table check, it needs the join).
-- The final state is returned, so PUT and DELETE are idempotent by construction.
--
-- Errors: raise exception using errcode = 'P0001', message = '<CODE>', detail = ''.
-- Codes: NOT_FOUND, CANNOT_LIKE_OWN.
--
-- Sources:
--   SELECT ... FOR SHARE: https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE
--   INSERT ... ON CONFLICT DO NOTHING: https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT

create function public.set_like(
  p_user uuid,
  p_id uuid,
  p_liked boolean
)
returns table (liked boolean, like_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_author uuid;
begin
  if p_user is null or p_id is null or p_liked is null then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST', detail = '';
  end if;

  -- FOR SHARE keeps the row from being hidden or cancelled while the like is written.
  select c.author_id into v_author
    from public.contributions c
   where c.id = p_id
     and c.status = 'APPROVED'
     and c.hidden_at is null
     for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND', detail = '';
  end if;
  if v_author = p_user then
    raise exception using errcode = 'P0001', message = 'CANNOT_LIKE_OWN', detail = '';
  end if;

  if p_liked then
    insert into public.likes (user_id, contribution_id)
    values (p_user, p_id)
    on conflict do nothing;
  else
    delete from public.likes l
     where l.user_id = p_user and l.contribution_id = p_id;
  end if;

  return query
  select exists (
           select 1 from public.likes l
            where l.user_id = p_user and l.contribution_id = p_id
         ),
         (select count(*)::integer from public.likes l where l.contribution_id = p_id);
end;
$$;

-- service_role only
revoke execute on function public.set_like(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_like(uuid, uuid, boolean) to service_role;
