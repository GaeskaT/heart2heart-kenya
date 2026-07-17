-- ============================================================================
-- Counsellor qualifications / registration.
--
-- Adds a `credentials` list to counsellors (KIPC graduate, Board registration)
-- and exposes it through counsellor_directory() so members see who they're
-- trusting. Backfills every existing counsellor.
--
-- Requires 0001-0007. Postgres 15 / Supabase.
-- ============================================================================

alter table public.counsellors
  add column if not exists credentials text[] not null default '{}';

-- Backfill all current counsellors with the standard Kenyan credentials.
update public.counsellors
set credentials = array[
  'Graduate, Kenya Institute of Professional Counselling (KIPC)',
  'Registered — Counsellors & Psychologists Board'
]
where credentials is null or cardinality(credentials) = 0;

-- The directory RPC must return the new column. Changing a function's return
-- type requires dropping it first, which also drops its grants — so re-grant.
drop function if exists public.counsellor_directory();
create or replace function public.counsellor_directory()
returns table (
  id uuid, full_name text, avatar_color text,
  title text, specialties text[], bio text, accepting_new boolean, credentials text[]
)
language sql stable security definer set search_path = public as $$
  select c.id,
         coalesce(p.full_name, 'Counsellor') as full_name,
         p.avatar_color,
         c.title, c.specialties, c.bio, c.accepting_new, c.credentials
  from public.counsellors c
  join public.profiles p on p.id = c.id
  where c.active
  order by p.full_name;
$$;
revoke all on function public.counsellor_directory() from public, anon;
grant execute on function public.counsellor_directory() to authenticated;
