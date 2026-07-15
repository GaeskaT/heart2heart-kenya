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
create or replace function public.send_message(conversation_id uuid, body text)
returns table (id uuid, moderation_status public.moderation_status)
language plpgsql security definer set search_path = public as $$
declare conv public.conversations; other uuid; mstatus public.moderation_status; signal text; new_id uuid;
begin
  select * into conv from public.conversations where id = conversation_id;
  if not found then raise exception 'conversation not found'; end if;
  if conv.user_a <> auth.uid() and conv.user_b <> auth.uid() then
    raise exception 'not a participant';
  end if;
  other := case when conv.user_a = auth.uid() then conv.user_b else conv.user_a end;
  if public.is_blocked(auth.uid(), other) then raise exception 'blocked'; end if;

  mstatus := public.moderate_text(body);
  new_id := gen_random_uuid();

  insert into public.messages (id, conversation_id, sender, body, moderation_status)
    values (new_id, conversation_id, auth.uid(), body, mstatus);

  insert into public.moderation_events (message_id, model, action)
    values (new_id, 'keyword-v1', mstatus::text);

  signal := public.crisis_signal(body);
  if signal is not null then
    insert into public.safety_flags (user_id, source, source_id, signal)
      values (auth.uid(), 'message', new_id::text, signal);
  end if;

  return query select new_id, mstatus;
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
