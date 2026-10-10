-- T21 — Anonymous reports with rate limit (data-model DB-10, plan D3, SPEC-community).
-- Called only by the Edge Function with service_role, after Turnstile was verified server-side.
--
-- Rate limit (D3): fixed window date_trunc('hour', now()); 5 reports per hour per key and 3 per
-- hour per (key, contribution). The key is a SHA-256 hash computed by the API (IP + server salt);
-- the IP never reaches the database.
--
-- Counters are incremented before the checks. When a limit is exceeded the function raises
-- RATE_LIMITED, which rolls the transaction back, so that rejected attempt's increment is lost.
-- That is acceptable: the counter already sits at the limit and keeps rejecting until the window
-- ends. An attempt on a missing or not visible contribution returns false (the API still answers
-- 202 so the endpoint is no existence oracle) but it DOES consume rate limit.
--
-- Errors: raise exception using errcode = 'P0001', message = '<CODE>', detail = ''.
-- Codes: INVALID_REQUEST, RATE_LIMITED.
--
-- Sources:
--   INSERT ... ON CONFLICT DO UPDATE ... RETURNING: https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT
--   date_trunc: https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-TRUNC

create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (bucket, window_start)
);

-- Default deny: RLS on, no policies; PostgREST roles get nothing.
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

-- Pending since T01.b: lookups of reports per contribution.
create index reports_contribution_id_idx on public.reports (contribution_id);

create function public.submit_report(
  p_key_hash text,
  p_contribution uuid,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_key_hits integer;
  v_pair_hits integer;
  v_reason text;
begin
  v_reason := btrim(coalesce(p_reason, ''));
  if p_key_hash is null or btrim(p_key_hash) = ''
     or p_contribution is null
     or length(v_reason) < 1 or length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST', detail = '';
  end if;

  -- Opportunistic cleanup of old windows.
  delete from public.rate_limits r where r.window_start < now() - interval '1 day';

  insert into public.rate_limits as r (bucket, window_start, hits)
  values ('report:' || p_key_hash, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_key_hits;

  insert into public.rate_limits as r (bucket, window_start, hits)
  values ('report:' || p_key_hash || ':' || p_contribution::text, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_pair_hits;

  if v_key_hits > 5 or v_pair_hits > 3 then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED', detail = '';
  end if;

  -- Not visible (missing, not APPROVED or hidden): nothing is inserted.
  if not exists (
    select 1 from public.contributions c
     where c.id = p_contribution and c.status = 'APPROVED' and c.hidden_at is null
  ) then
    return false;
  end if;

  insert into public.reports (contribution_id, reason) values (p_contribution, v_reason);
  return true;
end;
$$;

-- service_role only
revoke execute on function public.submit_report(text, uuid, text) from public, anon, authenticated;
grant execute on function public.submit_report(text, uuid, text) to service_role;
