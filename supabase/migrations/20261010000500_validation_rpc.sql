-- T13.a — Validation state transitions with version and lease (data-model §2/§3 DB-06, DB-07,
-- DB-09; architecture §3; ADR-003). Called only by the Edge Function with service_role, after it
-- authenticated the user. No function here calls the AI or touches Storage (that is T13.b).
--
-- Guard of the worker transitions: status = 'PENDING' AND validation_version = p_version AND
-- processing_lease_until > now(). A stale worker gets `false` and nothing changes, so a late
-- result can never overwrite a cancellation, a retry or a newer evidence.
--
-- Errors: raise exception using errcode = 'P0001', message = '<CODE>', detail = ''.
-- Codes: INVALID_REQUEST, NOT_FOUND (missing or other author's row), INVALID_STATE.
--
-- Sources:
--   SELECT ... FOR UPDATE: https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE
--   RAISE ... USING: https://www.postgresql.org/docs/current/plpgsql-errors-and-messages.html

-- (a) complete_validation: PENDING -> APPROVED | NEEDS_EVIDENCE | REJECTED
create function public.complete_validation(
  p_id uuid,
  p_version integer,
  p_decision text,
  p_reason text,
  p_public_photo_path text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.contributions;
begin
  if p_decision is null or p_decision not in ('APPROVED', 'NEEDS_EVIDENCE', 'REJECTED') then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST', detail = '';
  end if;
  if p_decision = 'APPROVED' and (p_public_photo_path is null or btrim(p_public_photo_path) = '') then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST', detail = '';
  end if;

  select c.* into v_row from public.contributions c where c.id = p_id for update;
  if not found
     or v_row.status <> 'PENDING'
     or v_row.validation_version <> p_version
     or v_row.processing_lease_until is null
     or v_row.processing_lease_until <= now() then
    return false;
  end if;

  if p_decision = 'APPROVED' then
    update public.contributions c
       set status = 'APPROVED',
           approved_at = now(),
           public_photo_path = p_public_photo_path,
           ai_reason = p_reason,
           processing_lease_until = null
     where c.id = p_id;
  else
    update public.contributions c
       set status = p_decision,
           ai_reason = p_reason,
           processing_lease_until = null
     where c.id = p_id;
  end if;
  return true;
end;
$$;

-- (b) mark_technical_error: PENDING -> TECHNICAL_ERROR (same guard)
create function public.mark_technical_error(
  p_id uuid,
  p_version integer,
  p_reason text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.contributions;
begin
  select c.* into v_row from public.contributions c where c.id = p_id for update;
  if not found
     or v_row.status <> 'PENDING'
     or v_row.validation_version <> p_version
     or v_row.processing_lease_until is null
     or v_row.processing_lease_until <= now() then
    return false;
  end if;

  update public.contributions c
     set status = 'TECHNICAL_ERROR',
         ai_reason = p_reason,
         processing_lease_until = null
   where c.id = p_id;
  return true;
end;
$$;

-- (c) cancel_contribution: PENDING | NEEDS_EVIDENCE | TECHNICAL_ERROR -> CANCELLED (idempotent)
create function public.cancel_contribution(
  p_id uuid,
  p_author uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.contributions;
begin
  select c.* into v_row from public.contributions c
   where c.id = p_id and c.author_id = p_author for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND', detail = '';
  end if;

  if v_row.status = 'CANCELLED' then
    return 'CANCELLED';
  end if;
  if v_row.status not in ('PENDING', 'NEEDS_EVIDENCE', 'TECHNICAL_ERROR') then
    raise exception using errcode = 'P0001', message = 'INVALID_STATE', detail = '';
  end if;

  update public.contributions c
     set status = 'CANCELLED',
         processing_lease_until = null
   where c.id = p_id;
  return 'CANCELLED';
end;
$$;

-- (d) retry_validation: TECHNICAL_ERROR (or PENDING without a live lease) -> PENDING, new version
create function public.retry_validation(
  p_id uuid,
  p_author uuid,
  p_lease_seconds integer default 120
)
returns table (validation_version integer, processing_lease_until timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row public.contributions;
  v_next integer;
  v_lease timestamptz;
begin
  select c.* into v_row from public.contributions c
   where c.id = p_id and c.author_id = p_author for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND', detail = '';
  end if;

  if not (
    v_row.status = 'TECHNICAL_ERROR'
    or (v_row.status = 'PENDING'
        and (v_row.processing_lease_until is null or v_row.processing_lease_until <= now()))
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_STATE', detail = '';
  end if;

  v_next := v_row.validation_version + 1;
  v_lease := now() + make_interval(secs => p_lease_seconds);
  update public.contributions c
     set status = 'PENDING',
         validation_version = v_next,
         processing_lease_until = v_lease
   where c.id = p_id;

  return query select v_next, v_lease;
end;
$$;

-- (e) submit_evidence: NEEDS_EVIDENCE -> PENDING with new evidence, new version and new lease.
-- submitted_at and points_snapshot are untouched (DB-09).
create function public.submit_evidence(
  p_id uuid,
  p_author uuid,
  p_evidence_path text,
  p_capture_origin text,
  p_capture_exif_at timestamptz,
  p_lease_seconds integer default 120
)
returns table (validation_version integer, processing_lease_until timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row public.contributions;
  v_next integer;
  v_lease timestamptz;
begin
  select c.* into v_row from public.contributions c
   where c.id = p_id and c.author_id = p_author for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND', detail = '';
  end if;

  if v_row.status <> 'NEEDS_EVIDENCE' then
    raise exception using errcode = 'P0001', message = 'INVALID_STATE', detail = '';
  end if;

  v_next := v_row.validation_version + 1;
  v_lease := now() + make_interval(secs => p_lease_seconds);
  update public.contributions c
     set status = 'PENDING',
         evidence_path = p_evidence_path,
         capture_origin = p_capture_origin,
         capture_exif_at = p_capture_exif_at,
         ai_reason = null,
         validation_version = v_next,
         processing_lease_until = v_lease
   where c.id = p_id;

  return query select v_next, v_lease;
end;
$$;

-- service_role only
revoke execute on function public.complete_validation(uuid, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_validation(uuid, integer, text, text, text) to service_role;

revoke execute on function public.mark_technical_error(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.mark_technical_error(uuid, integer, text) to service_role;

revoke execute on function public.cancel_contribution(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_contribution(uuid, uuid) to service_role;

revoke execute on function public.retry_validation(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.retry_validation(uuid, uuid, integer) to service_role;

revoke execute on function public.submit_evidence(uuid, uuid, text, text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.submit_evidence(uuid, uuid, text, text, timestamptz, integer) to service_role;
