-- ============================================================================
-- Fix: the admin/counsellor bootstrap silently did nothing.
--
-- protect_profile_columns() clamped role/verified whenever is_admin() was
-- false. Triggers fire for superusers too, and in the Supabase SQL editor
-- auth.uid() is NULL — so is_admin() was false and the documented bootstrap
--
--     update public.profiles set role = 'admin' where id = ...;
--
-- reported success while silently reverting the change. The result: no admin
-- and no counsellor could ever be created, on any project.
--
-- Now we only clamp for real end-user requests (a JWT is present) that aren't
-- admin. A session with no JWT is the service_role / SQL editor, which RLS
-- already gates. Members are still fully blocked from self-promotion — proven
-- by supabase/tests ("member CANNOT escalate own role").
--
-- Safe to re-run. Included in 0001 for fresh installs; this migration exists
-- so already-deployed projects pick up the fix.
-- ============================================================================

create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role     := old.role;
    new.verified := old.verified;
  end if;
  return new;
end $$;
