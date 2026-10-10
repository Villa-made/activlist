-- T16.a — Derived public-read queries (data-model §4, ADR-003, COM-01..COM-05).
-- Functions, not views: public views would be exposed to anon by Supabase defaults and
-- execute as their owner, bypassing RLS.

create index likes_contribution_id_idx on public.likes (contribution_id);

create function public.get_leaderboard(p_limit integer, p_offset integer)
returns table (rank bigint, user_id uuid, alias text, points bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 or p_offset is null or p_offset < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST', detail = '';
  end if;

  return query
  with user_points as (
    select c.author_id, sum(c.points_snapshot)::bigint as points
      from public.contributions c
     where c.status = 'APPROVED'
       and c.hidden_at is null
       and c.public_photo_path is not null
     group by c.author_id
    having sum(c.points_snapshot) > 0
  ), ranked as (
    select rank() over (order by up.points desc)::bigint as rank,
           up.author_id as user_id,
           p.alias,
           up.points
      from user_points up
      join public.profiles p on p.user_id = up.author_id
  )
  select r.rank, r.user_id, r.alias, r.points
    from ranked r
   order by r.points desc, lower(r.alias), r.user_id
   limit p_limit offset p_offset;
end;
$$;

create function public.get_feed(p_limit integer, p_offset integer, p_viewer uuid default null)
returns table (
  id uuid,
  author_alias text,
  action_type text,
  description text,
  municipality_code text,
  municipality_name text,
  published_at timestamptz,
  like_count bigint,
  liked_by_me boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 or p_offset is null or p_offset < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST', detail = '';
  end if;

  return query
  select c.id,
         p.alias as author_alias,
         c.action_type,
         c.description,
         c.municipality_code,
         m.name as municipality_name,
         c.approved_at as published_at,
         count(l.user_id)::bigint as like_count,
         exists (
           select 1
             from public.likes viewer_like
            where viewer_like.contribution_id = c.id
              and viewer_like.user_id = p_viewer
         ) as liked_by_me
    from public.contributions c
    join public.profiles p on p.user_id = c.author_id
    join public.municipalities m on m.code = c.municipality_code
    left join public.likes l on l.contribution_id = c.id
   where c.status = 'APPROVED'
     and c.hidden_at is null
     and c.public_photo_path is not null
     and c.approved_at >= now() - interval '30 days'
   group by c.id, p.alias, m.name
   order by count(l.user_id) desc, c.approved_at desc, c.id desc
   limit p_limit offset p_offset;
end;
$$;

revoke execute on function public.get_leaderboard(integer, integer) from public, anon, authenticated;
revoke execute on function public.get_feed(integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.get_leaderboard(integer, integer) to service_role;
grant execute on function public.get_feed(integer, integer, uuid) to service_role;
