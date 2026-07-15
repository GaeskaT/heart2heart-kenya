-- ============================================================================
-- Heart2Heart Kenya — Phase 0: Foundations
-- Auth-linked profiles, counsellor invites, readiness + wellness score,
-- consent capture, member verification, and an audit log — all under RLS.
--
-- Apply with:  supabase db push   (or paste into the Supabase SQL editor)
-- Postgres 15 / Supabase. Idempotent-ish: uses IF NOT EXISTS where practical.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;      -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('member','counsellor','moderator','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invite_status as enum ('active','redeemed','revoked','expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- 2.1 profiles — one row per auth user (created automatically on sign-up)
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         public.user_role not null default 'member',
  full_name    text,
  age          int  check (age is null or (age >= 18 and age <= 120)),
  gender       text,
  county       text,
  faith        text,
  education    text,
  career       text,
  intention    text,
  family_goal  text,
  "values"     text[] not null default '{}',
  age_min      int not null default 18 check (age_min >= 18),
  age_max      int not null default 99,
  bio          text,
  avatar_color text,
  verified     boolean not null default false,   -- set only by verification flow / admin
  onboarded    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists profiles_role_idx on public.profiles(role);

-- 2.2 counsellor_invites — membership is by counsellor approval
create table if not exists public.counsellor_invites (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  issued_by   uuid references public.profiles(id) on delete set null,
  used_by     uuid references public.profiles(id) on delete set null,
  status      public.invite_status not null default 'active',
  expires_at  timestamptz,
  redeemed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists invites_issued_by_idx on public.counsellor_invites(issued_by);

-- 2.3 verifications — makes "Verified member" real. Document refs are sensitive.
create table if not exists public.verifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  provider     text,                 -- e.g. 'smile_identity'
  provider_ref text,                 -- external reference (sensitive)
  document_ref text,                 -- encrypted storage path (sensitive)
  status       public.verification_status not null default 'pending',
  reviewed_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists verifications_user_idx on public.verifications(user_id);

-- 2.4 readiness_assessments — Stage 1; overall = private Wellness Score
create table if not exists public.readiness_assessments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  answers          jsonb not null default '{}',
  dimension_scores jsonb not null default '{}',
  overall          int check (overall is null or (overall between 0 and 100)),
  completed_at     timestamptz not null default now()
);
create index if not exists readiness_user_idx on public.readiness_assessments(user_id);

-- 2.5 consents — immutable record of code-of-conduct + data-processing consent
create table if not exists public.consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  policy_version  text not null,
  code_of_conduct boolean not null default false,
  data_processing boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists consents_user_idx on public.consents(user_id);

-- 2.6 audit_log — written only by SECURITY DEFINER functions / service role
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid,
  action     text not null,
  entity     text,
  entity_id  text,
  meta       jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Helper functions
--    SECURITY DEFINER + owned by the migration role (postgres), which is the
--    table owner and therefore BYPASSES RLS on profiles. This is what prevents
--    the classic "policy on profiles that reads profiles" infinite recursion.
-- ---------------------------------------------------------------------------
create or replace function public.auth_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false);
$$;

create or replace function public.is_staff()   -- counsellor / moderator / admin
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid())
      in ('counsellor','moderator','admin'), false);
$$;

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- auto-create a minimal profile when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

-- prevent members from escalating their own role or self-verifying
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role     := old.role;
    new.verified := old.verified;
  end if;
  return new;
end $$;

-- redeem a counsellor invite atomically (called by the onboarding client)
create or replace function public.redeem_invite(invite_code text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare inv public.counsellor_invites;
begin
  select * into inv from public.counsellor_invites
   where code = invite_code
     and status = 'active'
     and (expires_at is null or expires_at > now())
   for update;

  if not found then
    return false;
  end if;

  update public.counsellor_invites
     set status = 'redeemed', used_by = auth.uid(), redeemed_at = now()
   where id = inv.id;

  insert into public.audit_log(actor, action, entity, entity_id)
  values (auth.uid(), 'invite.redeemed', 'counsellor_invites', inv.id::text);

  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_protect_cols on public.profiles;
create trigger profiles_protect_cols
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

drop trigger if exists verifications_set_updated_at on public.verifications;
create trigger verifications_set_updated_at
  before update on public.verifications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.counsellor_invites    enable row level security;
alter table public.verifications         enable row level security;
alter table public.readiness_assessments enable row level security;
alter table public.consents              enable row level security;
alter table public.audit_log             enable row level security;

-- 5.1 profiles ---------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_staff());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_admin())
             with check (id = auth.uid() or public.is_admin());
-- (role/verified changes by non-admins are neutralised by the BEFORE UPDATE trigger)

-- 5.2 counsellor_invites -----------------------------------------------------
drop policy if exists invites_select on public.counsellor_invites;
create policy invites_select on public.counsellor_invites
  for select using (issued_by = auth.uid() or public.is_staff());

drop policy if exists invites_insert on public.counsellor_invites;
create policy invites_insert on public.counsellor_invites
  for insert with check (public.is_staff() and issued_by = auth.uid());

drop policy if exists invites_update on public.counsellor_invites;
create policy invites_update on public.counsellor_invites
  for update using (public.is_admin()) with check (public.is_admin());
-- (members redeem via the redeem_invite() function, not direct writes)

-- 5.3 verifications ----------------------------------------------------------
drop policy if exists verifications_select on public.verifications;
create policy verifications_select on public.verifications
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists verifications_insert on public.verifications;
create policy verifications_insert on public.verifications
  for insert with check (user_id = auth.uid());

drop policy if exists verifications_update on public.verifications;
create policy verifications_update on public.verifications
  for update using (public.is_admin()) with check (public.is_admin());

-- 5.4 readiness_assessments --------------------------------------------------
drop policy if exists readiness_select on public.readiness_assessments;
create policy readiness_select on public.readiness_assessments
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists readiness_insert on public.readiness_assessments;
create policy readiness_insert on public.readiness_assessments
  for insert with check (user_id = auth.uid());
-- no update/delete: assessments are an append-only history

-- 5.5 consents (append-only) -------------------------------------------------
drop policy if exists consents_select on public.consents;
create policy consents_select on public.consents
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists consents_insert on public.consents;
create policy consents_insert on public.consents
  for insert with check (user_id = auth.uid());
-- no update/delete: consent records are immutable

-- 5.6 audit_log (admin-readable; writes only via definer funcs/service role) --
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using (public.is_admin());
-- deliberately no insert/update/delete policy for authenticated

-- ---------------------------------------------------------------------------
-- 6. Grants (PostgREST roles). RLS still gates every row.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update on public.profiles              to authenticated;
grant select, insert         on public.counsellor_invites    to authenticated;
grant select, insert         on public.verifications         to authenticated;
grant select, insert         on public.readiness_assessments to authenticated;
grant select, insert         on public.consents              to authenticated;
grant select                 on public.audit_log             to authenticated;

grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.auth_role()         to authenticated;
grant execute on function public.is_admin()          to authenticated;
grant execute on function public.is_staff()          to authenticated;

-- Column-level hardening: never expose verification documents to clients.
revoke select (document_ref, provider_ref) on public.verifications from authenticated;

-- ---------------------------------------------------------------------------
-- 7. Bootstrapping notes (run manually as service_role / SQL editor)
-- ---------------------------------------------------------------------------
-- Enable Email (and/or phone OTP) auth in the Supabase dashboard first.
--
-- Promote your first counsellor / admin AFTER they have signed up once:
--   update public.profiles set role = 'admin'
--     where id = (select id from auth.users where email = 'you@example.com');
--
-- Seed a few invite codes (as a counsellor/admin):
--   insert into public.counsellor_invites (code, issued_by)
--   values ('H2H-KE-2026', auth.uid());
-- ============================================================================
