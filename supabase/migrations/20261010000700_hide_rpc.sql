-- T19 — Hide an own APPROVED contribution (data-model §2/§3 DB-07, SPEC-contributions CON-11,
-- SPEC-scoring SCO-05, ADR-003). Called only by the Edge Function with service_role, after it
-- authenticated the user.
--
-- Hiding sets hidden_at only. status, submitted_at and points_snapshot are untouched, so the
-- 60-minute cooldown (computed from submitted_at of the last APPROVED) keeps counting hidden ones.
-- Visibility and points are derived: get_feed / get_leaderboard (T16.a) already filter hidden_at.
-- The published copy is not deleted; the hidden_at filter blocks its exposure.
--
-- Errors: raise exception using errcode = 'P0001', message = '<CODE>', detail = ''.
-- Codes: NOT_FOUND (missing or other author's row), INVALID_STATE (not APPROVED).
--
-- Sources:
--   SELECT ... FOR UPDATE: https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE
--   RAISE ... USING: https://www.postgresql.org/docs/current/plpgsql-errors-and-messages.html

create function public.hide_contribution(
  p_id uuid,
  p_author uuid
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.contributions;
  v_hidden timestamptz;
begin
  select c.* into v_row from public.contributions c
   where c.id = p_id and c.author_id = p_author for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND', detail = '';
  end if;

  if v_row.status <> 'APPROVED' then
    raise exception using errcode = 'P0001', message = 'INVALID_STATE', detail = '';
  end if;

  -- Idempotent: already hidden keeps its original timestamp and changes nothing.
  if v_row.hidden_at is not null then
    return v_row.hidden_at;
  end if;

  v_hidden := now();
  update public.contributions c
     set hidden_at = v_hidden
   where c.id = p_id;
  return v_hidden;
end;
$$;

-- service_role only
revoke execute on function public.hide_contribution(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hide_contribution(uuid, uuid) to service_role;
