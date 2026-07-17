-- ============================================================================
-- Supabase environment shim (for local testing only — NOT part of the app)
--
-- The migrations target Supabase, which provides an `auth` schema, an
-- `auth.uid()` helper, the anon/authenticated/service_role roles and the
-- `supabase_realtime` publication. Plain Postgres has none of these, so this
-- shim recreates just enough of them to run and test the real migrations
-- unmodified against an embedded Postgres (PGlite).
--
-- auth.uid() mirrors Supabase's implementation: it reads the `sub` claim out of
-- the `request.jwt.claims` setting, which is how tests impersonate a user.
-- ============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text unique
);

-- Supabase's auth.uid(): the 'sub' claim of the current request's JWT.
-- NULL-safe: unset/empty claims (an anonymous request) must yield NULL, not error.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(
           nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
         '')::uuid;
$$;

-- PostgREST roles
do $$ begin create role anon           nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated  nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role   nologin bypassrls; exception when duplicate_object then null; end $$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- Supabase grants service_role full access to everything in `public` via default
-- privileges, which is why it can read/write any table. BYPASSRLS alone only
-- skips POLICIES, not table GRANTs — without this the shim would wrongly deny
-- service_role and mask what really happens in production.
-- Set before the migrations run, so it applies to the objects they create.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on functions to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- Realtime publication that Supabase ships with
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
