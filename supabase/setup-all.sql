-- ============================================================================
-- Heart2Heart Kenya — FULL SETUP (phases 0-3)
-- GENERATED FILE — do not edit. Source of truth: supabase/migrations/*.sql
-- Regenerate: bash supabase/build-setup.sh
--
-- Paste this whole file into the Supabase SQL editor and Run. Idempotent-ish:
-- safe to re-run on a fresh project.
-- ============================================================================


-- ############################################################################
-- ## 0001_phase0_foundations.sql
-- ############################################################################

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

-- ############################################################################
-- ## 0002_phase1_core_loop.sql
-- ############################################################################

-- ============================================================================
-- Heart2Heart Kenya — Phase 1: Core loop
-- Server-side matching, interest + mutual consent, conversations & messaging,
-- a moderation pipeline, reporting / blocking, and crisis-safety hooks.
--
-- Requires 0001_phase0_foundations.sql. Apply with `supabase db push`.
-- Postgres 15 / Supabase. Not yet executed against a live project.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
do $$ begin create type public.interest_status   as enum ('pending','accepted','declined'); exception when duplicate_object then null; end $$;
do $$ begin create type public.connection_status as enum ('connected','ended');            exception when duplicate_object then null; end $$;
do $$ begin create type public.report_status     as enum ('open','reviewing','resolved','dismissed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.moderation_status as enum ('approved','flagged','blocked');  exception when duplicate_object then null; end $$;
do $$ begin create type public.safety_status     as enum ('open','actioned','closed');       exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- 2.1 interests — one side expressing interest in another
create table if not exists public.interests (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references public.profiles(id) on delete cascade,
  to_user      uuid not null references public.profiles(id) on delete cascade,
  status       public.interest_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (from_user, to_user),
  check (from_user <> to_user)
);
create index if not exists interests_to_idx   on public.interests(to_user);
create index if not exists interests_from_idx on public.interests(from_user);

-- 2.2 connections — a mutually-consented pair (user_a < user_b, ordered)
create table if not exists public.connections (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.profiles(id) on delete cascade,
  user_b     uuid not null references public.profiles(id) on delete cascade,
  status     public.connection_status not null default 'connected',
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

-- 2.3 conversations — one per connected pair; unlocked only on mutual consent
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.profiles(id) on delete cascade,
  user_b     uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

-- 2.4 messages — moderated before delivery
create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  sender            uuid not null references public.profiles(id) on delete cascade,
  body              text not null,
  moderation_status public.moderation_status not null default 'approved',
  created_at        timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages(conversation_id, created_at);

-- 2.5 moderation_events — audit of automated / human moderation decisions
create table if not exists public.moderation_events (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  model      text,
  score      numeric,
  categories jsonb,
  action     text,
  reviewer   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 2.6 blocks
create table if not exists public.blocks (
  id         uuid primary key default gen_random_uuid(),
  blocker    uuid not null references public.profiles(id) on delete cascade,
  blocked    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker, blocked),
  check (blocker <> blocked)
);

-- 2.7 reports
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null references public.profiles(id) on delete cascade,
  reported    uuid not null references public.profiles(id) on delete cascade,
  reason      text not null,
  context     jsonb,
  status      public.report_status not null default 'open',
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports(status);

-- 2.8 safety_flags — crisis-safety pipeline (self-harm / abuse signals)
create table if not exists public.safety_flags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,   -- subject
  source     text,           -- 'message' | 'question' | 'checkin'
  source_id  text,
  signal     text,           -- 'self_harm' | 'abuse' | ...
  status     public.safety_status not null default 'open',
  created_at timestamptz not null default now()
);
create index if not exists safety_open_idx on public.safety_flags(status);

-- ---------------------------------------------------------------------------
-- 3. Helper functions (SECURITY DEFINER → bypass RLS, avoid recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;

create or replace function public.is_conv_participant(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv and (c.user_a = auth.uid() or c.user_b = auth.uid())
  );
$$;

-- family-goal alignment (mirrors the client matcher)
create or replace function public.family_align(a text, b text)
returns int language plpgsql immutable as $$
begin
  if a = b then return 15; end if;
  if a = 'Prefer no children' and b = 'Prefer no children' then return 15; end if;
  if (a = 'Prefer no children') <> (b = 'Prefer no children') then return 2; end if;
  if a in ('Want children','Open to children','Have children already')
     and b in ('Want children','Open to children','Have children already') then return 11; end if;
  return 7;
end $$;

-- compatibility score 0..100 (mirrors the front-end scoreMatch)
create or replace function public.match_score(me public.profiles, cand public.profiles)
returns int language plpgsql immutable as $$
declare pts int := 0; mx int := 0; shared int; ri int; rj int; gap int;
begin
  -- shared values (max 30)
  mx := mx + 30;
  shared := cardinality(array(
    select unnest(coalesce(me."values",  '{}'::text[]))
    intersect
    select unnest(coalesce(cand."values",'{}'::text[]))));
  pts := pts + least(30, shared * 10);

  -- intention proximity (max 20)
  mx := mx + 20;
  ri := case me.intention   when 'exploring' then 0 when 'committed' then 1 when 'marriage' then 2 else 1 end;
  rj := case cand.intention when 'exploring' then 0 when 'committed' then 1 when 'marriage' then 2 else 1 end;
  gap := abs(ri - rj);
  if gap = 0 then pts := pts + 20; elsif gap = 1 then pts := pts + 11; end if;

  -- faith (max 15)
  mx := mx + 15;
  if me.faith is not null and me.faith = cand.faith and me.faith <> 'Prefer not to say' then
    pts := pts + 15;
  elsif me.faith = 'Prefer not to say' or cand.faith = 'Prefer not to say' then
    pts := pts + 8;
  end if;

  -- family goals (max 15)
  mx := mx + 15;
  pts := pts + public.family_align(me.family_goal, cand.family_goal);

  -- mutual age fit (max 10)
  mx := mx + 10;
  if (cand.age between me.age_min and me.age_max) and (me.age between cand.age_min and cand.age_max) then
    pts := pts + 10;
  elsif (cand.age between me.age_min and me.age_max) or (me.age between cand.age_min and cand.age_max) then
    pts := pts + 5;
  end if;

  -- location (max 10)
  mx := mx + 10;
  if me.county is not null and me.county = cand.county then pts := pts + 10; end if;

  return round(pts::numeric / greatest(mx, 1) * 100);
end $$;

-- normalise a pair to (lo, hi) so connections/conversations are unique
create or replace function public.pair_lo(a uuid, b uuid) returns uuid
language sql immutable as $$ select case when a < b then a else b end $$;
create or replace function public.pair_hi(a uuid, b uuid) returns uuid
language sql immutable as $$ select case when a < b then b else a end $$;

-- create the connection + conversation for a pair (idempotent)
create or replace function public.create_connection(a uuid, b uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare lo uuid := public.pair_lo(a,b); hi uuid := public.pair_hi(a,b); conv uuid;
begin
  insert into public.connections (user_a, user_b)
    values (lo, hi)
    on conflict (user_a, user_b) do update set status = 'connected';
  insert into public.conversations (user_a, user_b)
    values (lo, hi)
    on conflict (user_a, user_b) do nothing;
  select id into conv from public.conversations where user_a = lo and user_b = hi;
  return conv;
end $$;

-- ---------------------------------------------------------------------------
-- 4. RPCs (the write API; all SECURITY DEFINER with explicit checks)
-- ---------------------------------------------------------------------------

-- 4.1 curated, server-scored matches (returns only fields safe to display)
create or replace function public.get_matches(match_limit int default 10)
returns table (
  id uuid, full_name text, age int, county text, faith text, education text,
  career text, intention text, family_goal text, "values" text[], bio text,
  avatar_color text, verified boolean, score int
)
language plpgsql stable security definer set search_path = public as $$
declare me public.profiles;
begin
  select * into me from public.profiles where public.profiles.id = auth.uid();
  if not found then return; end if;

  return query
    select p.id, p.full_name, p.age, p.county, p.faith, p.education, p.career,
           p.intention, p.family_goal, p."values", p.bio, p.avatar_color, p.verified,
           public.match_score(me, p) as score
    from public.profiles p
    where p.id <> me.id
      and p.onboarded = true
      and p.role = 'member'        -- staff accounts must never enter the dating pool
      and not public.is_blocked(me.id, p.id)
      and not exists (
        select 1 from public.connections c
        where c.status = 'connected'
          and c.user_a = public.pair_lo(me.id, p.id)
          and c.user_b = public.pair_hi(me.id, p.id))
    order by score desc, p.created_at asc
    limit greatest(1, least(match_limit, 50));
end $$;

-- 4.2 a single member's display card (only if you have a relationship with them)
create or replace function public.member_card(target uuid)
returns table (
  id uuid, full_name text, age int, county text, faith text, education text,
  career text, intention text, family_goal text, "values" text[], bio text,
  avatar_color text, verified boolean
)
language plpgsql stable security definer set search_path = public as $$
declare allowed boolean;
begin
  allowed :=
    exists (select 1 from public.interests i
            where (i.from_user = auth.uid() and i.to_user = target)
               or (i.from_user = target and i.to_user = auth.uid()))
    or exists (select 1 from public.connections c
            where c.user_a = public.pair_lo(auth.uid(), target)
              and c.user_b = public.pair_hi(auth.uid(), target));
  if not allowed then return; end if;

  return query
    select p.id, p.full_name, p.age, p.county, p.faith, p.education, p.career,
           p.intention, p.family_goal, p."values", p.bio, p.avatar_color, p.verified
    from public.profiles p where p.id = target;
end $$;

-- 4.3 express interest — auto-connects if the other side already did
create or replace function public.express_interest(target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare existing public.interests;
begin
  if target = auth.uid() then return 'invalid'; end if;
  if public.is_blocked(auth.uid(), target) then return 'blocked'; end if;

  -- already connected?
  if exists (select 1 from public.connections c
             where c.user_a = public.pair_lo(auth.uid(), target)
               and c.user_b = public.pair_hi(auth.uid(), target)
               and c.status = 'connected') then
    return 'connected';
  end if;

  -- did the other side already express interest? -> mutual, connect now
  select * into existing from public.interests
    where from_user = target and to_user = auth.uid() and status = 'pending';
  if found then
    update public.interests set status = 'accepted', responded_at = now() where id = existing.id;
    perform public.create_connection(auth.uid(), target);
    return 'connected';
  end if;

  -- otherwise record my interest (idempotent)
  insert into public.interests (from_user, to_user)
    values (auth.uid(), target)
    on conflict (from_user, to_user) do nothing;
  return 'sent';
end $$;

-- 4.4 respond to an incoming interest
create or replace function public.respond_to_interest(interest_id uuid, accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare row public.interests;
begin
  select * into row from public.interests where id = interest_id and to_user = auth.uid() for update;
  if not found then return 'not_found'; end if;

  if accept then
    update public.interests set status = 'accepted', responded_at = now() where id = row.id;
    perform public.create_connection(row.from_user, row.to_user);
    return 'connected';
  else
    update public.interests set status = 'declined', responded_at = now() where id = row.id;
    return 'declined';
  end if;
end $$;

-- 4.5 block / unblock (ends any connection)
create or replace function public.block_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.blocks (blocker, blocked) values (auth.uid(), target)
    on conflict (blocker, blocked) do nothing;
  update public.connections set status = 'ended'
    where user_a = public.pair_lo(auth.uid(), target)
      and user_b = public.pair_hi(auth.uid(), target);
  insert into public.audit_log(actor, action, entity, entity_id)
    values (auth.uid(), 'user.blocked', 'profiles', target::text);
end $$;

create or replace function public.unblock_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.blocks where blocker = auth.uid() and blocked = target;
end $$;

-- 4.6 report a member (queued for counsellor / moderator review)
create or replace function public.report_user(target uuid, reason text, context jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.reports (reporter, reported, reason, context)
    values (auth.uid(), target, reason, context);
  insert into public.audit_log(actor, action, entity, entity_id, meta)
    values (auth.uid(), 'user.reported', 'profiles', target::text, jsonb_build_object('reason', reason));
end $$;

-- ---------------------------------------------------------------------------
-- 5. Moderation pipeline
--    First-pass, in-DB keyword screen mirroring the client demo. In production
--    replace/augment with an Edge Function that calls an external model
--    (OpenAI Moderation / Google Perspective) before insert. Keep the same
--    contract: return a moderation_status and raise crisis signals.
-- ---------------------------------------------------------------------------
create or replace function public.moderate_text(body text)
returns public.moderation_status language plpgsql immutable as $$
begin
  if body ~* '\y(stupid|idiot|hate you|shut up)\y' then return 'flagged'; end if;
  return 'approved';
end $$;

create or replace function public.crisis_signal(body text)
returns text language plpgsql immutable as $$
begin
  if body ~* '\y(kill myself|end it all|suicide|want to die|self.?harm)\y' then return 'self_harm'; end if;
  return null;
end $$;

-- 4.7 send a message (runs moderation; unlocked only for participants)
--
-- NOTE: returns jsonb rather than `returns table (id, moderation_status)`.
-- Those OUT names would become PL/pgSQL variables that collide with the
-- identically-named columns on `conversations`/`messages`, making every column
-- reference ambiguous at runtime. Parameters are qualified as
-- `send_message.<param>` for the same reason. Verified by supabase/tests.
create or replace function public.send_message(conversation_id uuid, body text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_conv   public.conversations%rowtype;
  v_other  uuid;
  v_status public.moderation_status;
  v_signal text;
  v_id     uuid;
begin
  select c.* into v_conv
    from public.conversations c
   where c.id = send_message.conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;

  if v_conv.user_a <> auth.uid() and v_conv.user_b <> auth.uid() then
    raise exception 'not a participant';
  end if;

  v_other := case when v_conv.user_a = auth.uid() then v_conv.user_b else v_conv.user_a end;
  if public.is_blocked(auth.uid(), v_other) then raise exception 'blocked'; end if;

  v_status := public.moderate_text(send_message.body);
  v_id     := gen_random_uuid();

  insert into public.messages (id, conversation_id, sender, body, moderation_status)
    values (v_id, send_message.conversation_id, auth.uid(), send_message.body, v_status);

  insert into public.moderation_events (message_id, model, action)
    values (v_id, 'keyword-v1', v_status::text);

  v_signal := public.crisis_signal(send_message.body);
  if v_signal is not null then
    insert into public.safety_flags (user_id, source, source_id, signal)
      values (auth.uid(), 'message', v_id::text, v_signal);
  end if;

  return jsonb_build_object('id', v_id, 'moderation_status', v_status);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.interests         enable row level security;
alter table public.connections       enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;
alter table public.moderation_events enable row level security;
alter table public.blocks            enable row level security;
alter table public.reports           enable row level security;
alter table public.safety_flags      enable row level security;

-- interests: see ones you sent or received (writes go through RPCs)
drop policy if exists interests_select on public.interests;
create policy interests_select on public.interests
  for select using (from_user = auth.uid() or to_user = auth.uid() or public.is_staff());

-- connections: participants + staff
drop policy if exists connections_select on public.connections;
create policy connections_select on public.connections
  for select using (user_a = auth.uid() or user_b = auth.uid() or public.is_staff());

-- conversations: participants + staff
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (user_a = auth.uid() or user_b = auth.uid() or public.is_staff());

-- messages: participants only; blocked messages hidden from the other party
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    public.is_conv_participant(conversation_id)
    and (moderation_status <> 'blocked' or sender = auth.uid() or public.is_staff())
  );
-- (inserts happen only via send_message())

-- moderation_events & safety_flags: staff only
drop policy if exists moderation_select on public.moderation_events;
create policy moderation_select on public.moderation_events
  for select using (public.is_staff());

drop policy if exists safety_select on public.safety_flags;
create policy safety_select on public.safety_flags
  for select using (public.is_staff());

-- blocks: you can see your own (writes via RPC)
drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks
  for select using (blocker = auth.uid() or public.is_admin());

-- reports: reporter sees own; staff see all (writes via RPC)
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select using (reporter = auth.uid() or public.is_staff());

drop policy if exists reports_staff_update on public.reports;
create policy reports_staff_update on public.reports
  for update using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 7. Grants (RLS still gates every row)
-- ---------------------------------------------------------------------------
grant select on public.interests, public.connections, public.conversations,
                 public.messages, public.blocks, public.reports,
                 public.moderation_events, public.safety_flags to authenticated;

grant execute on function public.get_matches(int)                     to authenticated;
grant execute on function public.member_card(uuid)                    to authenticated;
grant execute on function public.express_interest(uuid)               to authenticated;
grant execute on function public.respond_to_interest(uuid, boolean)   to authenticated;
grant execute on function public.block_user(uuid)                     to authenticated;
grant execute on function public.unblock_user(uuid)                   to authenticated;
grant execute on function public.report_user(uuid, text, jsonb)       to authenticated;
grant execute on function public.send_message(uuid, text)             to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Realtime — let clients subscribe to new messages / interests / connections
-- ---------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table public.messages;    exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.interests;   exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.connections; exception when duplicate_object then null; end $$;

-- ============================================================================
-- Notes
--  • All writes go through SECURITY DEFINER RPCs so consent, blocking and
--    moderation are enforced server-side, not trusted from the client.
--  • moderate_text()/crisis_signal() are a first pass — wire an Edge Function
--    to a real moderation model and (for crisis signals) notify the on-call
--    counsellor. Define the crisis protocol with a licensed clinician.
--  • Matching is server-authoritative: members never get blanket read access
--    to the profile table — get_matches() returns only curated, safe fields.
-- ============================================================================

-- ############################################################################
-- ## 0003_phase2_counselling.sql
-- ############################################################################

-- ============================================================================
-- Heart2Heart Kenya — Phase 2: Counselling
-- Counsellor accounts & dashboard, availability + bookings, video sessions,
-- confidential Q&A, clinical notes, and notifications.
--
-- Requires 0001_phase0_foundations.sql and 0002_phase1_core_loop.sql.
-- Postgres 15 / Supabase. Not yet executed against a live project.
--
-- Also TIGHTENS Phase 0: counsellors previously inherited read access to every
-- profile via is_staff(). Section 7 narrows that to their own clients, which is
-- what the backend scope actually calls for.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
do $$ begin create type public.session_type     as enum ('refresher','individual','couples','quick'); exception when duplicate_object then null; end $$;
do $$ begin create type public.booking_format   as enum ('video','phone','inperson');                 exception when duplicate_object then null; end $$;
do $$ begin create type public.booking_status   as enum ('scheduled','completed','cancelled','no_show'); exception when duplicate_object then null; end $$;
do $$ begin create type public.question_status  as enum ('open','answered','closed');                  exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- 2.1 counsellors — directory info (safe for members to browse)
create table if not exists public.counsellors (
  id             uuid primary key references public.profiles(id) on delete cascade,
  title          text,                  -- e.g. 'Clinical Psychologist'
  specialties    text[] not null default '{}',
  bio            text,
  active         boolean not null default true,
  accepting_new  boolean not null default true,
  created_at     timestamptz not null default now()
);

-- 2.2 availability_slots — bookable windows published by a counsellor
create table if not exists public.availability_slots (
  id            uuid primary key default gen_random_uuid(),
  counsellor_id uuid not null references public.counsellors(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  booked        boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (counsellor_id, starts_at),
  check (ends_at > starts_at)
);
create index if not exists slots_open_idx on public.availability_slots(counsellor_id, starts_at) where booked = false;

-- 2.3 bookings
create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.profiles(id) on delete cascade,
  counsellor_id uuid not null references public.counsellors(id) on delete cascade,
  slot_id       uuid references public.availability_slots(id) on delete set null,
  session_type  public.session_type not null,
  format        public.booking_format not null,
  scheduled_at  timestamptz not null,
  duration_mins int not null default 50,
  status        public.booking_status not null default 'scheduled',
  video_room    text,                  -- room id; provider tokens minted by an Edge Function
  created_at    timestamptz not null default now()
);
create index if not exists bookings_member_idx     on public.bookings(member_id, scheduled_at);
create index if not exists bookings_counsellor_idx on public.bookings(counsellor_id, scheduled_at);

-- 2.4 confidential Q&A
create table if not exists public.questions (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid not null references public.profiles(id) on delete cascade,
  body                text not null,
  status              public.question_status not null default 'open',
  assigned_counsellor uuid references public.counsellors(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists questions_status_idx on public.questions(status);
create index if not exists questions_member_idx on public.questions(member_id);

create table if not exists public.question_replies (
  id            uuid primary key default gen_random_uuid(),
  question_id   uuid not null references public.questions(id) on delete cascade,
  counsellor_id uuid not null references public.counsellors(id) on delete cascade,
  body          text not null,
  created_at    timestamptz not null default now()
);

-- 2.5 session_notes — clinical notes. Authored by a counsellor, NEVER readable
--     by the member. Most restricted table in the schema.
create table if not exists public.session_notes (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  counsellor_id uuid not null references public.counsellors(id) on delete cascade,
  body          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2.6 notifications & push tokens
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

create table if not exists public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  token      text not null unique,
  platform   text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------

-- Is `member` a client of the calling counsellor? (a booking or an assigned question)
create or replace function public.is_my_client(member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings b
                  where b.member_id = member and b.counsellor_id = auth.uid())
      or exists (select 1 from public.questions q
                  where q.member_id = member and q.assigned_counsellor = auth.uid());
$$;

create or replace function public.is_counsellor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.counsellors c where c.id = auth.uid() and c.active);
$$;

-- internal: queue a notification (delivery fan-out to FCM/SMS/email is an Edge Function)
create or replace function public.notify(target uuid, kind text, title text, body text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body) values (target, kind, title, body);
$$;

create or replace function public.set_updated_at_notes()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists session_notes_updated on public.session_notes;
create trigger session_notes_updated before update on public.session_notes
  for each row execute function public.set_updated_at_notes();

-- ---------------------------------------------------------------------------
-- 4. RPCs — bookings
-- ---------------------------------------------------------------------------

-- 4.1 book a published slot (atomically claims it)
create or replace function public.book_session(
  slot uuid, s_type public.session_type, fmt public.booking_format
) returns uuid
language plpgsql security definer set search_path = public as $$
declare sl public.availability_slots; b uuid; mins int;
begin
  update public.availability_slots set booked = true
    where id = slot and booked = false
    returning * into sl;
  if not found then raise exception 'slot_unavailable'; end if;

  mins := case s_type when 'quick' then 15 when 'refresher' then 30 else 50 end;

  insert into public.bookings (member_id, counsellor_id, slot_id, session_type, format, scheduled_at, duration_mins, video_room)
  values (auth.uid(), sl.counsellor_id, sl.id, s_type, fmt, sl.starts_at, mins,
          case when fmt = 'video' then 'h2h-' || replace(gen_random_uuid()::text,'-','') else null end)
  returning id into b;

  perform public.notify(sl.counsellor_id, 'booking.new', 'New session booked',
                        'A member booked a ' || s_type::text || ' session.');
  perform public.notify(auth.uid(), 'booking.confirmed', 'Session confirmed',
                        'Your session is booked. We''ll remind you beforehand.');
  insert into public.audit_log(actor, action, entity, entity_id)
    values (auth.uid(), 'booking.created', 'bookings', b::text);
  return b;
end $$;

-- 4.2 cancel (member or the counsellor); frees the slot
create or replace function public.cancel_booking(booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare bk public.bookings;
begin
  select * into bk from public.bookings where id = booking_id;
  if not found then raise exception 'not_found'; end if;
  if bk.member_id <> auth.uid() and bk.counsellor_id <> auth.uid() and not public.is_admin() then
    raise exception 'not_allowed';
  end if;

  update public.bookings set status = 'cancelled' where id = booking_id;
  if bk.slot_id is not null then
    update public.availability_slots set booked = false where id = bk.slot_id;
  end if;

  perform public.notify(
    case when auth.uid() = bk.member_id then bk.counsellor_id else bk.member_id end,
    'booking.cancelled', 'Session cancelled', 'A booked session was cancelled.');
end $$;

-- 4.3 open slots for a counsellor (next 30 days)
create or replace function public.open_slots(counsellor uuid)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.starts_at, s.ends_at
  from public.availability_slots s
  where s.counsellor_id = counsellor
    and s.booked = false
    and s.starts_at > now()
    and s.starts_at < now() + interval '30 days'
  order by s.starts_at;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPCs — confidential Q&A
-- ---------------------------------------------------------------------------
create or replace function public.ask_question(body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare q uuid; signal text;
begin
  insert into public.questions (member_id, body) values (auth.uid(), body) returning id into q;

  -- crisis-safety hook (shares the Phase 1 detector)
  signal := public.crisis_signal(body);
  if signal is not null then
    insert into public.safety_flags (user_id, source, source_id, signal)
      values (auth.uid(), 'question', q::text, signal);
  end if;

  return q;
end $$;

create or replace function public.answer_question(question_id uuid, body text)
returns void language plpgsql security definer set search_path = public as $$
declare q public.questions;
begin
  if not (public.is_counsellor() or public.is_admin()) then raise exception 'not_allowed'; end if;
  select * into q from public.questions where id = question_id;
  if not found then raise exception 'not_found'; end if;

  insert into public.question_replies (question_id, counsellor_id, body)
    values (question_id, auth.uid(), body);
  update public.questions
     set status = 'answered',
         assigned_counsellor = coalesce(assigned_counsellor, auth.uid())
   where id = question_id;

  perform public.notify(q.member_id, 'question.answered', 'A counsellor replied',
                        'Your confidential question has a reply.');
end $$;

-- ---------------------------------------------------------------------------
-- 6. RPCs — counsellor dashboard
-- ---------------------------------------------------------------------------
create or replace function public.counsellor_clients()
returns table (id uuid, full_name text, county text, verified boolean,
               last_session timestamptz, open_questions bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_counsellor() or public.is_admin()) then return; end if;
  return query
    select p.id, p.full_name, p.county, p.verified,
           (select max(b.scheduled_at) from public.bookings b
             where b.member_id = p.id and b.counsellor_id = auth.uid()),
           (select count(*) from public.questions q
             where q.member_id = p.id and q.assigned_counsellor = auth.uid() and q.status = 'open')
    from public.profiles p
    where public.is_my_client(p.id);
end $$;

create or replace function public.mark_notification_read(n uuid)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where id = n and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 7. TIGHTEN Phase 0: counsellors should see clients, not everyone
--    (moderators/admins keep the broader access they need for safety review)
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or public.is_admin()
    or public.auth_role() = 'moderator'
    or (public.auth_role() = 'counsellor' and public.is_my_client(id))
  );

-- a member's own counsellor may see their readiness (clinically useful);
-- everyone else still cannot.
drop policy if exists readiness_select on public.readiness_assessments;
create policy readiness_select on public.readiness_assessments
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or (public.auth_role() = 'counsellor' and public.is_my_client(user_id))
  );

-- ---------------------------------------------------------------------------
-- 8. Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.counsellors        enable row level security;
alter table public.availability_slots enable row level security;
alter table public.bookings           enable row level security;
alter table public.questions          enable row level security;
alter table public.question_replies   enable row level security;
alter table public.session_notes      enable row level security;
alter table public.notifications      enable row level security;
alter table public.push_tokens        enable row level security;

-- counsellors: directory — any signed-in member may browse active counsellors
drop policy if exists counsellors_select on public.counsellors;
create policy counsellors_select on public.counsellors
  for select using (active or id = auth.uid() or public.is_admin());

drop policy if exists counsellors_self_update on public.counsellors;
create policy counsellors_self_update on public.counsellors
  for update using (id = auth.uid() or public.is_admin())
             with check (id = auth.uid() or public.is_admin());

-- availability: readable by all (to book); managed by the owning counsellor
drop policy if exists slots_select on public.availability_slots;
create policy slots_select on public.availability_slots for select using (true);

drop policy if exists slots_manage on public.availability_slots;
create policy slots_manage on public.availability_slots
  for all using (counsellor_id = auth.uid() or public.is_admin())
          with check (counsellor_id = auth.uid() or public.is_admin());

-- bookings: the member and their counsellor (writes go through RPCs)
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select using (member_id = auth.uid() or counsellor_id = auth.uid() or public.is_admin());

drop policy if exists bookings_counsellor_update on public.bookings;
create policy bookings_counsellor_update on public.bookings
  for update using (counsellor_id = auth.uid() or public.is_admin())
             with check (counsellor_id = auth.uid() or public.is_admin());

-- questions: the member who asked, the assigned counsellor, unassigned ones to
-- any active counsellor (so the team can triage), plus admins
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select using (
    member_id = auth.uid()
    or assigned_counsellor = auth.uid()
    or (assigned_counsellor is null and public.is_counsellor())
    or public.is_admin()
  );

drop policy if exists replies_select on public.question_replies;
create policy replies_select on public.question_replies
  for select using (
    exists (select 1 from public.questions q
            where q.id = question_id
              and (q.member_id = auth.uid() or q.assigned_counsellor = auth.uid()))
    or public.is_admin()
  );

-- session notes: authoring counsellor + admin ONLY. Never the member.
drop policy if exists notes_select on public.session_notes;
create policy notes_select on public.session_notes
  for select using (counsellor_id = auth.uid() or public.is_admin());

drop policy if exists notes_manage on public.session_notes;
create policy notes_manage on public.session_notes
  for all using (counsellor_id = auth.uid() or public.is_admin())
          with check (counsellor_id = auth.uid() or public.is_admin());

-- notifications & push tokens: strictly your own
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists push_manage on public.push_tokens;
create policy push_manage on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 9. Grants (RLS gates every row)
-- ---------------------------------------------------------------------------
grant select on public.counsellors, public.availability_slots, public.bookings,
                 public.questions, public.question_replies, public.session_notes,
                 public.notifications to authenticated;
grant update on public.counsellors, public.bookings to authenticated;
grant insert, update, delete on public.availability_slots to authenticated;
grant insert, update, delete on public.session_notes to authenticated;
grant insert, delete on public.push_tokens to authenticated;

grant execute on function public.book_session(uuid, public.session_type, public.booking_format) to authenticated;
grant execute on function public.cancel_booking(uuid)          to authenticated;
grant execute on function public.open_slots(uuid)              to authenticated;
grant execute on function public.ask_question(text)            to authenticated;
grant execute on function public.answer_question(uuid, text)   to authenticated;
grant execute on function public.counsellor_clients()          to authenticated;
grant execute on function public.mark_notification_read(uuid)  to authenticated;
grant execute on function public.is_my_client(uuid)            to authenticated;
grant execute on function public.is_counsellor()               to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Realtime
-- ---------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table public.notifications;    exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.question_replies; exception when duplicate_object then null; end $$;

-- ============================================================================
-- Notes
--  • Video: bookings.video_room holds a room id. Short-lived provider tokens
--    (Daily.co / Twilio) must be minted server-side by an Edge Function that
--    verifies the caller is the booking's member or counsellor — never in SQL,
--    and never with the API secret shipped to the client.
--  • Notifications are queued here; an Edge Function fans out to FCM (push),
--    Africa's Talking (SMS) and email.
--  • Clinical notes are deliberately invisible to members. Confirm retention
--    and disclosure rules with a licensed clinician and the Kenya DPA before
--    going live.
-- ============================================================================

-- ############################################################################
-- ## 0004_phase3_monetisation_community.sql
-- ############################################################################

-- ============================================================================
-- Heart2Heart Kenya — Phase 3: Monetisation & community
-- Subscription plans, M-Pesa / card payments (reconciled by webhook), premium
-- entitlements, webinars, moderated community groups, and events + RSVP.
--
-- Requires 0001–0003. Postgres 15 / Supabase.
-- Not yet executed against a live project.
--
-- PAYMENTS SAFETY (read before touching this file)
--   • No card numbers, CVVs, PINs or M-Pesa credentials are EVER stored here or
--     handled by the client. This schema records payment *intents* and provider
--     *references* only.
--   • M-Pesa: an Edge Function calls Daraja STK-push server-side; the member
--     approves on their own handset. Card: a provider-hosted checkout page.
--   • Money only moves state via verified provider webhooks processed by an
--     Edge Function using the service_role key. `activate_subscription()` is
--     deliberately NOT callable by members (see grants in section 8).
--
-- Also HARDENS phases 0–2: Postgres grants EXECUTE on new functions to PUBLIC
-- by default, which means `anon` could call our RPCs. Section 9 revokes that.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
do $$ begin create type public.subscription_status as enum ('trialing','active','past_due','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_provider    as enum ('mpesa','card');                              exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_status      as enum ('pending','succeeded','failed','refunded');   exception when duplicate_object then null; end $$;
do $$ begin create type public.rsvp_status         as enum ('going','cancelled','waitlist');              exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Plans, subscriptions & payments
-- ---------------------------------------------------------------------------

-- 2.1 plans — editable by admins, readable by everyone
create table if not exists public.plans (
  id         text primary key,                    -- 'free' | 'premium' | 'premiumplus'
  name       text not null,
  price_kes  int  not null default 0,
  period     text not null default 'month',
  tagline    text,
  features   text[] not null default '{}',
  sort       int  not null default 0,
  active     boolean not null default true
);

insert into public.plans (id, name, price_kes, period, tagline, features, sort) values
  ('free','Free',0,'', 'The core journey',
    array['Relationship Readiness & Wellness Score','A few curated matches','Mutual-consent messaging','Learning Academy','Wellness Tools'], 0),
  ('premium','Premium',1500,'month','Go deeper',
    array['Everything in Free','Unlimited counsellor messaging','Monthly video counselling','Compatibility insights','Exclusive webinars'], 1),
  ('premiumplus','Premium+',3500,'month','Fully supported',
    array['Everything in Premium','Weekly video counselling','Dedicated couples coaching','Advanced relationship courses','Priority event access'], 2)
on conflict (id) do nothing;

-- 2.2 subscriptions — one active row per member
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  plan_id              text not null references public.plans(id),
  status               public.subscription_status not null default 'active',
  provider             public.payment_provider,
  provider_ref         text,
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists subscriptions_one_active
  on public.subscriptions(user_id) where status in ('active','trialing','past_due');

-- 2.3 payments — intents + outcomes. No credentials, ever.
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id         text references public.plans(id),
  amount_kes      int not null check (amount_kes >= 0),
  currency        text not null default 'KES',
  provider        public.payment_provider not null,
  provider_ref    text,                  -- e.g. M-Pesa CheckoutRequestID / receipt
  status          public.payment_status not null default 'pending',
  purpose         text,                  -- 'subscription' | 'event' | ...
  created_at      timestamptz not null default now(),
  settled_at      timestamptz
);
create index if not exists payments_user_idx on public.payments(user_id, created_at desc);
create index if not exists payments_ref_idx  on public.payments(provider_ref);

-- 2.4 payment_events — raw verified webhook payloads (service_role only).
--     Idempotency: a provider may retry the same callback many times.
create table if not exists public.payment_events (
  id             uuid primary key default gen_random_uuid(),
  provider       public.payment_provider not null,
  idempotency_key text not null unique,
  payload        jsonb not null,
  processed_at   timestamptz,
  created_at     timestamptz not null default now()
);

drop trigger if exists subscriptions_updated on public.subscriptions;
create trigger subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Entitlements
-- ---------------------------------------------------------------------------
create or replace function public.has_premium(who uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = who
      and s.status in ('active','trialing')
      and s.plan_id <> 'free'
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

create or replace function public.my_subscription()
returns table (plan_id text, status public.subscription_status, current_period_end timestamptz, cancel_at_period_end boolean)
language sql stable security definer set search_path = public as $$
  select s.plan_id, s.status, s.current_period_end, s.cancel_at_period_end
  from public.subscriptions s
  where s.user_id = auth.uid() and s.status in ('active','trialing','past_due')
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. Payment RPCs
--    The member-callable surface is intentionally tiny: create an intent, or
--    cancel at period end. Everything that grants entitlement is service-role.
-- ---------------------------------------------------------------------------

-- 4.1 create a pending payment intent; the Edge Function picks this up, calls
--     the provider (M-Pesa STK push / hosted card checkout) and stores the ref.
create or replace function public.create_payment_intent(plan text, prov public.payment_provider)
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.plans; pid uuid;
begin
  select * into p from public.plans where id = plan and active;
  if not found then raise exception 'unknown_plan'; end if;
  if p.price_kes = 0 then raise exception 'free_plan_needs_no_payment'; end if;

  insert into public.payments (user_id, plan_id, amount_kes, provider, purpose)
    values (auth.uid(), p.id, p.price_kes, prov, 'subscription')
    returning id into pid;

  insert into public.audit_log(actor, action, entity, entity_id, meta)
    values (auth.uid(), 'payment.intent', 'payments', pid::text,
            jsonb_build_object('plan', p.id, 'amount_kes', p.price_kes, 'provider', prov));
  return pid;
end $$;

-- 4.2 SERVICE-ROLE ONLY: settle a payment and grant entitlement.
--     Called by the webhook Edge Function after verifying the provider callback.
create or replace function public.activate_subscription(payment_id uuid, ref text)
returns void language plpgsql security definer set search_path = public as $$
declare pay public.payments; sub uuid;
begin
  select * into pay from public.payments where id = payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if pay.status = 'succeeded' then return; end if;   -- idempotent

  update public.payments
     set status = 'succeeded', provider_ref = coalesce(ref, provider_ref), settled_at = now()
   where id = payment_id;

  -- close any existing active subscription, then open the new period
  update public.subscriptions set status = 'cancelled'
    where user_id = pay.user_id and status in ('active','trialing','past_due');

  insert into public.subscriptions (user_id, plan_id, status, provider, provider_ref,
                                    current_period_start, current_period_end)
    values (pay.user_id, pay.plan_id, 'active', pay.provider, ref, now(), now() + interval '1 month')
    returning id into sub;

  update public.payments set subscription_id = sub where id = payment_id;

  perform public.notify(pay.user_id, 'subscription.active', 'Subscription active',
                        'Thank you — your plan is now active.');
  insert into public.audit_log(actor, action, entity, entity_id)
    values (pay.user_id, 'subscription.activated', 'subscriptions', sub::text);
end $$;

-- 4.3 member: stop renewal (keeps access until period end)
create or replace function public.cancel_subscription()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.subscriptions set cancel_at_period_end = true
   where user_id = auth.uid() and status in ('active','trialing');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Webinars
-- ---------------------------------------------------------------------------
create table if not exists public.webinars (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  blurb         text,
  presenter_id  uuid references public.counsellors(id) on delete set null,
  starts_at     timestamptz not null,
  duration_mins int not null default 60,
  premium_only  boolean not null default false,
  capacity      int,
  room          text,
  active        boolean not null default true
);
create index if not exists webinars_when_idx on public.webinars(starts_at);

create table if not exists public.webinar_registrations (
  id         uuid primary key default gen_random_uuid(),
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (webinar_id, user_id)
);

create or replace function public.register_webinar(w uuid)
returns text language plpgsql security definer set search_path = public as $$
declare wb public.webinars; taken int;
begin
  select * into wb from public.webinars where id = w and active;
  if not found then raise exception 'not_found'; end if;
  if wb.premium_only and not public.has_premium() then return 'premium_required'; end if;

  if wb.capacity is not null then
    select count(*) into taken from public.webinar_registrations where webinar_id = w;
    if taken >= wb.capacity then return 'full'; end if;
  end if;

  insert into public.webinar_registrations (webinar_id, user_id)
    values (w, auth.uid()) on conflict do nothing;
  return 'registered';
end $$;

create or replace function public.cancel_webinar(w uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.webinar_registrations where webinar_id = w and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 6. Community groups (moderated)
-- ---------------------------------------------------------------------------
create table if not exists public.community_groups (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  icon        text,
  active      boolean not null default true
);

create table if not exists public.community_memberships (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.community_groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.community_posts (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.community_groups(id) on delete cascade,
  author            uuid not null references public.profiles(id) on delete cascade,
  body              text not null,
  moderation_status public.moderation_status not null default 'approved',
  created_at        timestamptz not null default now()
);
create index if not exists posts_group_idx on public.community_posts(group_id, created_at desc);

create or replace function public.is_group_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.community_memberships m
                 where m.group_id = g and m.user_id = auth.uid());
$$;

create or replace function public.join_group(g uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.community_memberships (group_id, user_id)
  values (g, auth.uid()) on conflict do nothing;
$$;

create or replace function public.leave_group(g uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.community_memberships where group_id = g and user_id = auth.uid();
$$;

-- posting runs the same moderation + crisis screen as private messaging
create or replace function public.post_to_group(g uuid, body text)
returns table (id uuid, moderation_status public.moderation_status)
language plpgsql security definer set search_path = public as $$
declare mstatus public.moderation_status; signal text; new_id uuid;
begin
  if not public.is_group_member(g) then raise exception 'join_the_group_first'; end if;

  mstatus := public.moderate_text(body);
  new_id  := gen_random_uuid();

  insert into public.community_posts (id, group_id, author, body, moderation_status)
    values (new_id, g, auth.uid(), body, mstatus);

  signal := public.crisis_signal(body);
  if signal is not null then
    insert into public.safety_flags (user_id, source, source_id, signal)
      values (auth.uid(), 'community_post', new_id::text, signal);
  end if;

  return query select new_id, mstatus;
end $$;

-- report a post (reuses the Phase 1 reports queue; author is the reported user)
create or replace function public.report_post(post uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.community_posts;
begin
  select * into p from public.community_posts where id = post;
  if not found then raise exception 'not_found'; end if;
  insert into public.reports (reporter, reported, reason, context)
    values (auth.uid(), p.author, reason, jsonb_build_object('post_id', post, 'group_id', p.group_id));
end $$;

-- moderators hide a post
create or replace function public.moderate_post(post uuid, new_status public.moderation_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not_allowed'; end if;
  update public.community_posts set moderation_status = new_status where id = post;
  insert into public.moderation_events (model, action, reviewer, categories)
    values ('human', new_status::text, auth.uid(), jsonb_build_object('post_id', post));
end $$;

-- ---------------------------------------------------------------------------
-- 7. Events + RSVP
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  kind       text,                 -- 'Singles mixer' | 'Seminar' | ...
  blurb      text,
  icon       text,
  starts_at  timestamptz not null,
  location   text,
  price_kes  int not null default 0,
  capacity   int,
  active     boolean not null default true
);
create index if not exists events_when_idx on public.events(starts_at);

create table if not exists public.event_rsvps (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  status     public.rsvp_status not null default 'going',
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create or replace function public.rsvp_event(e uuid)
returns text language plpgsql security definer set search_path = public as $$
declare ev public.events; taken int;
begin
  select * into ev from public.events where id = e and active;
  if not found then raise exception 'not_found'; end if;

  if ev.capacity is not null then
    select count(*) into taken from public.event_rsvps where event_id = e and status = 'going';
    if taken >= ev.capacity then
      insert into public.event_rsvps (event_id, user_id, status) values (e, auth.uid(), 'waitlist')
        on conflict (event_id, user_id) do update set status = 'waitlist';
      return 'waitlist';
    end if;
  end if;

  insert into public.event_rsvps (event_id, user_id, status) values (e, auth.uid(), 'going')
    on conflict (event_id, user_id) do update set status = 'going';
  return 'going';
end $$;

create or replace function public.cancel_rsvp(e uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.event_rsvps where event_id = e and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 8. Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.plans                 enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.payments              enable row level security;
alter table public.payment_events        enable row level security;   -- no policies: service_role only
alter table public.webinars              enable row level security;
alter table public.webinar_registrations enable row level security;
alter table public.community_groups      enable row level security;
alter table public.community_memberships enable row level security;
alter table public.community_posts       enable row level security;
alter table public.events                enable row level security;
alter table public.event_rsvps           enable row level security;

drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select using (active or public.is_admin());

-- money is read-only to the member; only service_role/RPCs write it
drop policy if exists subs_select on public.subscriptions;
create policy subs_select on public.subscriptions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists webinars_select on public.webinars;
create policy webinars_select on public.webinars for select using (active or public.is_staff());

drop policy if exists webreg_select on public.webinar_registrations;
create policy webreg_select on public.webinar_registrations
  for select using (user_id = auth.uid() or public.is_staff());

drop policy if exists groups_select on public.community_groups;
create policy groups_select on public.community_groups for select using (active or public.is_staff());

drop policy if exists memberships_select on public.community_memberships;
create policy memberships_select on public.community_memberships
  for select using (user_id = auth.uid() or public.is_staff());

-- posts: members of the group only; hidden posts invisible except to author/staff
drop policy if exists posts_select on public.community_posts;
create policy posts_select on public.community_posts
  for select using (
    (public.is_group_member(group_id) or public.is_staff())
    and (moderation_status <> 'blocked' or author = auth.uid() or public.is_staff())
  );

drop policy if exists events_select on public.events;
create policy events_select on public.events for select using (active or public.is_staff());

drop policy if exists rsvps_select on public.event_rsvps;
create policy rsvps_select on public.event_rsvps
  for select using (user_id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------------------
-- 9. Grants + hardening
--    Postgres grants EXECUTE on functions to PUBLIC by default — meaning the
--    `anon` role could call our RPCs. Revoke that across phases 0–3 and grant
--    explicitly to `authenticated` only.
-- ---------------------------------------------------------------------------
grant select on public.plans, public.subscriptions, public.payments,
                 public.webinars, public.webinar_registrations,
                 public.community_groups, public.community_memberships,
                 public.community_posts, public.events, public.event_rsvps
      to authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
  end loop;
end $$;

-- Re-grant the member-callable surface (phases 0–3).
--
-- IMPORTANT: this list must include every helper a POLICY calls, not just the
-- RPCs the client calls directly. Policies are evaluated as the querying user,
-- so a missing grant here fails the whole query with "permission denied for
-- function …" rather than simply filtering rows. (Helpers invoked *inside* a
-- SECURITY DEFINER function run as the owner and don't need a grant.)
-- Policy-called helpers: auth_role, is_admin, is_staff, is_my_client,
-- is_counsellor, is_conv_participant, is_group_member.
grant execute on function public.redeem_invite(text)                                   to authenticated;
grant execute on function public.auth_role()                                           to authenticated;
grant execute on function public.is_admin()                                            to authenticated;
grant execute on function public.is_staff()                                            to authenticated;
grant execute on function public.is_conv_participant(uuid)                             to authenticated;
grant execute on function public.get_matches(int)                                      to authenticated;
grant execute on function public.member_card(uuid)                                     to authenticated;
grant execute on function public.express_interest(uuid)                                to authenticated;
grant execute on function public.respond_to_interest(uuid, boolean)                    to authenticated;
grant execute on function public.block_user(uuid)                                      to authenticated;
grant execute on function public.unblock_user(uuid)                                    to authenticated;
grant execute on function public.report_user(uuid, text, jsonb)                        to authenticated;
grant execute on function public.send_message(uuid, text)                              to authenticated;
grant execute on function public.book_session(uuid, public.session_type, public.booking_format) to authenticated;
grant execute on function public.cancel_booking(uuid)                                  to authenticated;
grant execute on function public.open_slots(uuid)                                      to authenticated;
grant execute on function public.ask_question(text)                                    to authenticated;
grant execute on function public.answer_question(uuid, text)                           to authenticated;
grant execute on function public.counsellor_clients()                                  to authenticated;
grant execute on function public.mark_notification_read(uuid)                          to authenticated;
grant execute on function public.is_my_client(uuid)                                    to authenticated;
grant execute on function public.is_counsellor()                                       to authenticated;
grant execute on function public.has_premium(uuid)                                     to authenticated;
grant execute on function public.my_subscription()                                     to authenticated;
grant execute on function public.create_payment_intent(text, public.payment_provider)  to authenticated;
grant execute on function public.cancel_subscription()                                 to authenticated;
grant execute on function public.register_webinar(uuid)                                to authenticated;
grant execute on function public.cancel_webinar(uuid)                                  to authenticated;
grant execute on function public.is_group_member(uuid)                                 to authenticated;
grant execute on function public.join_group(uuid)                                      to authenticated;
grant execute on function public.leave_group(uuid)                                     to authenticated;
grant execute on function public.post_to_group(uuid, text)                             to authenticated;
grant execute on function public.report_post(uuid, text)                               to authenticated;
grant execute on function public.moderate_post(uuid, public.moderation_status)         to authenticated; -- gated by is_staff() inside
grant execute on function public.rsvp_event(uuid)                                      to authenticated;
grant execute on function public.cancel_rsvp(uuid)                                     to authenticated;

-- entitlement-granting stays server-side only
grant execute on function public.activate_subscription(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Realtime
-- ---------------------------------------------------------------------------
do $$ begin alter publication supabase_realtime add table public.community_posts; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.subscriptions;   exception when duplicate_object then null; end $$;

-- ============================================================================
-- Notes
--  • M-Pesa flow: client -> create_payment_intent() -> Edge Function calls
--    Daraja STK push with that payment id as AccountReference -> member approves
--    on their handset -> Daraja callback -> Edge Function verifies, records a
--    payment_events row (idempotency_key = CheckoutRequestID), then calls
--    activate_subscription(). Never trust a client-reported "payment success".
--  • Card: use a provider-hosted checkout (Flutterwave / Paystack / Stripe).
--    No PAN/CVV ever reaches this app.
--  • Refunds/chargebacks: add a payment_events-driven path that sets
--    payments.status='refunded' and subscriptions.status='cancelled'.
-- ============================================================================
