-- T01.b — Schema and invariants (docs/design/data-model.md §1–§3, ADR-003).
-- Row level security is enabled on every table with NO policies (default deny).
-- Revokes, policies and storage buckets belong to T01.c; municipalities data to T01.d.

-- ---------------------------------------------------------------------------
-- profiles (DB-01)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  alias text not null,
  adult_declared_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index profiles_alias_lower_key on public.profiles (lower(alias));

-- ---------------------------------------------------------------------------
-- municipalities (official INE codes: CPRO(2) + CMUN(3), loaded in T01.d)
-- ---------------------------------------------------------------------------
create table public.municipalities (
  code text primary key check (code ~ '^[0-9]{5}$'),
  name text not null,
  province_name text not null
);

-- ---------------------------------------------------------------------------
-- contributions (DB-02, DB-03, DB-05, D2, D4)
-- ---------------------------------------------------------------------------
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (user_id),
  action_type text not null
    check (action_type in ('RECYCLING', 'LITTER_COLLECTION')),
  description text not null
    check (length(btrim(description)) between 1 and 500),
  municipality_code text not null references public.municipalities (code),
  evidence_path text not null,
  public_photo_path text,
  capture_origin text not null
    check (capture_origin in ('GALLERY', 'CAMERA_FLOW')),
  capture_exif_at timestamptz,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'NEEDS_EVIDENCE', 'TECHNICAL_ERROR', 'APPROVED', 'REJECTED', 'CANCELLED')),
  points_snapshot integer not null,
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  hidden_at timestamptz,
  ai_reason text,
  validation_version integer not null default 0,
  processing_lease_until timestamptz,
  idempotency_key uuid not null,
  idempotency_fingerprint text not null,

  -- DB-02: points fixed by action type (RECYCLING = 10, LITTER_COLLECTION = 20)
  constraint contributions_points_match_action check (
    (action_type = 'RECYCLING' and points_snapshot = 10)
    or (action_type = 'LITTER_COLLECTION' and points_snapshot = 20)
  ),
  -- DB-06: an approved contribution always has its approval time and sanitized copy
  constraint contributions_approved_has_publication check (
    status <> 'APPROVED' or (approved_at is not null and public_photo_path is not null)
  ),
  -- DB-07: only approved contributions can be hidden
  constraint contributions_hidden_requires_approved check (
    hidden_at is null or status = 'APPROVED'
  ),
  -- D4: one evidence file per contribution
  constraint contributions_evidence_path_key unique (evidence_path),
  -- DB-05: idempotent submission per author
  constraint contributions_author_idempotency_key unique (author_id, idempotency_key)
);

-- DB-03: at most one open contribution per (author, action type)
create unique index contributions_open_per_author_action_key
  on public.contributions (author_id, action_type)
  where status in ('PENDING', 'NEEDS_EVIDENCE', 'TECHNICAL_ERROR');

-- Cooldown lookup (last approved of the pair, hidden ones included)
create index contributions_cooldown_idx
  on public.contributions (author_id, action_type, submitted_at desc)
  where status = 'APPROVED';

-- Public feed lookup
create index contributions_feed_idx
  on public.contributions (approved_at desc)
  where status = 'APPROVED' and hidden_at is null;

-- DB-09 (defence in depth): fields fixed at insert time can never change.
create function public.contributions_prevent_immutable_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.author_id is distinct from old.author_id then
    raise exception 'contributions.author_id is immutable';
  end if;
  if new.action_type is distinct from old.action_type then
    raise exception 'contributions.action_type is immutable';
  end if;
  if new.submitted_at is distinct from old.submitted_at then
    raise exception 'contributions.submitted_at is immutable';
  end if;
  if new.points_snapshot is distinct from old.points_snapshot then
    raise exception 'contributions.points_snapshot is immutable';
  end if;
  if new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'contributions.idempotency_key is immutable';
  end if;
  return new;
end;
$$;

create trigger contributions_immutable_fields
  before update on public.contributions
  for each row execute function public.contributions_prevent_immutable_update();

-- ---------------------------------------------------------------------------
-- likes (DB-08: the "not your own publication" rule lives in the T20 RPC)
-- ---------------------------------------------------------------------------
create table public.likes (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  contribution_id uuid not null references public.contributions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contribution_id)
);

-- ---------------------------------------------------------------------------
-- reports (DB-10: inserted only through a function in T21)
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contributions (id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolution text
);

-- ---------------------------------------------------------------------------
-- Default deny: RLS on, no policies (T01.c adds revokes and the only read policy)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.municipalities enable row level security;
alter table public.contributions enable row level security;
alter table public.likes enable row level security;
alter table public.reports enable row level security;
