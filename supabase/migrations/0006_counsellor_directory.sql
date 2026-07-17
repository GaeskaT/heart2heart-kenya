-- ============================================================================
-- Fix: members could not see counsellors' names.
--
-- `counsellors` holds title/specialties/bio, but the display name and avatar
-- live on `profiles` — which members cannot read (profiles_select is: own row,
-- admin, moderator, or a counsellor's own client). member_card() doesn't help
-- either: it requires an existing interest/connection, which you don't have
-- with a counsellor you're only browsing.
--
-- Result: the booking screen showed "Counsellor" instead of "Dr. Njeri Kamau".
--
-- Fix with the same pattern as get_matches(): a SECURITY DEFINER RPC that
-- returns ONLY the fields that are safe to show, and only for ACTIVE
-- counsellors. Members still get no blanket read on profiles.
-- ============================================================================

create or replace function public.counsellor_directory()
returns table (
  id uuid, full_name text, avatar_color text,
  title text, specialties text[], bio text, accepting_new boolean
)
language sql stable security definer set search_path = public as $$
  select c.id,
         coalesce(p.full_name, 'Counsellor') as full_name,
         p.avatar_color,
         c.title, c.specialties, c.bio, c.accepting_new
  from public.counsellors c
  join public.profiles p on p.id = c.id
  where c.active
  order by p.full_name;
$$;

revoke all on function public.counsellor_directory() from public, anon;
grant execute on function public.counsellor_directory() to authenticated;
