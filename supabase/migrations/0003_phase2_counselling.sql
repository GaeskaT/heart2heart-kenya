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
