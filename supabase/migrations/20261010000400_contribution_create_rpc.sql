-- T10.a — Transactional create_contribution RPC (SPEC-contributions CON-03, CON-08, CON-09;
-- data-model DB-02..DB-05, D2; ADR-003). Called only by the Edge Function with service_role
-- AFTER it authenticated the user and validated the payload.
--
-- Errors: raise exception using errcode = 'P0001', message = '<CODE>', detail = '<json or empty>'.
-- Codes: IDEMPOTENCY_CONFLICT, INVALID_REQUEST, INVALID_MUNICIPALITY,
--        PENDING_CONTRIBUTION_EXISTS, COOLDOWN_ACTIVE (detail: {"retryAt": ISO UTC}).
--
-- Sources:
--   advisory locks: https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS
--   RAISE ... USING DETAIL: https://www.postgresql.org/docs/current/plpgsql-errors-and-messages.html

create function public.create_contribution(
  p_author_id uuid,
  p_action_type text,
  p_description text,
  p_municipality_code text,
  p_evidence_path text,
  p_capture_origin text,
  p_capture_exif_at timestamptz,
  p_idempotency_key uuid,
  p_idempotency_fingerprint text,
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  status text,
  submitted_at timestamptz,
  points_snapshot integer,
  validation_version integer,
  created boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_existing public.contributions;
  v_last_approved timestamptz;
  v_points integer;
  v_row public.contributions;
begin
  if p_action_type is null or p_action_type not in ('RECYCLING', 'LITTER_COLLECTION') then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST', detail = '';
  end if;

  -- (a) serialise the (author, action type) pair for the rest of the transaction
  perform pg_advisory_xact_lock(hashtextextended(p_author_id::text || ':' || p_action_type, 0));

  -- (b) idempotency: same key + same fingerprint replays, same key + other payload conflicts
  select c.* into v_existing
    from public.contributions c
   where c.author_id = p_author_id and c.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.idempotency_fingerprint = p_idempotency_fingerprint then
      return query select v_existing.id, v_existing.status, v_existing.submitted_at,
                          v_existing.points_snapshot, v_existing.validation_version, false;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT', detail = '';
  end if;

  -- (c) municipality must exist in the catalogue
  if not exists (select 1 from public.municipalities m where m.code = p_municipality_code) then
    raise exception using errcode = 'P0001', message = 'INVALID_MUNICIPALITY', detail = '';
  end if;

  -- (d) CON-09: one open contribution per (author, action type)
  if exists (
    select 1 from public.contributions c
     where c.author_id = p_author_id
       and c.action_type = p_action_type
       and c.status in ('PENDING', 'NEEDS_EVIDENCE', 'TECHNICAL_ERROR')
  ) then
    raise exception using errcode = 'P0001', message = 'PENDING_CONTRIBUTION_EXISTS', detail = '';
  end if;

  -- (e) CON-08: 60 min cooldown from the last APPROVED of the pair (hidden ones count)
  select max(c.submitted_at) into v_last_approved
    from public.contributions c
   where c.author_id = p_author_id
     and c.action_type = p_action_type
     and c.status = 'APPROVED'
     and c.submitted_at > now() - interval '60 minutes';
  if v_last_approved is not null then
    raise exception using
      errcode = 'P0001',
      message = 'COOLDOWN_ACTIVE',
      detail = jsonb_build_object(
        'retryAt',
        to_char((v_last_approved + interval '60 minutes') at time zone 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      )::text;
  end if;

  -- (f) CON-03: points fixed here by action type, never received from the caller
  v_points := case p_action_type when 'RECYCLING' then 10 else 20 end;

  begin
    insert into public.contributions (
      author_id, action_type, description, municipality_code, evidence_path,
      capture_origin, capture_exif_at, status, points_snapshot, submitted_at,
      validation_version, processing_lease_until, idempotency_key, idempotency_fingerprint
    ) values (
      p_author_id, p_action_type, p_description, p_municipality_code, p_evidence_path,
      p_capture_origin, p_capture_exif_at, 'PENDING', v_points, now(),
      1, now() + make_interval(secs => p_lease_seconds), p_idempotency_key, p_idempotency_fingerprint
    )
    returning * into v_row;
  exception when unique_violation then
    -- Same key racing under a different action type (other advisory lock): resolve as replay/conflict.
    select c.* into v_existing
      from public.contributions c
     where c.author_id = p_author_id and c.idempotency_key = p_idempotency_key;
    if not found then
      raise;
    end if;
    if v_existing.idempotency_fingerprint = p_idempotency_fingerprint then
      return query select v_existing.id, v_existing.status, v_existing.submitted_at,
                          v_existing.points_snapshot, v_existing.validation_version, false;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT', detail = '';
  end;

  -- (g)
  return query select v_row.id, v_row.status, v_row.submitted_at,
                      v_row.points_snapshot, v_row.validation_version, true;
end;
$$;

revoke execute on function public.create_contribution(
  uuid, text, text, text, text, text, timestamptz, uuid, text, integer
) from public, anon, authenticated;
grant execute on function public.create_contribution(
  uuid, text, text, text, text, text, timestamptz, uuid, text, integer
) to service_role;
