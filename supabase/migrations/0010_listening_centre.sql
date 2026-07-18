-- ============================================================================
-- Listening Centre.
--
-- A listening ear — NOT counselling. Members request a callback and a trained
-- listener simply listens: no advice, no counselling, no judgement. Kept
-- deliberately separate from bookings/questions so the distinction is clear in
-- the data as well as the UI.
--
-- Requires 0001-0009. Postgres 15 / Supabase.
-- ============================================================================

do $$ begin
  create type public.listening_status as enum ('open','in_progress','completed','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.listening_requests (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.profiles(id) on delete cascade,
  phone          text,                 -- callback number (the member's own)
  note           text,                 -- optional: anything they'd like the listener to know
  preferred_time text,                 -- free text, e.g. "weekday evenings"
  status         public.listening_status not null default 'open',
  listener_id    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists listening_member_idx on public.listening_requests(member_id, created_at desc);
create index if not exists listening_open_idx on public.listening_requests(status) where status = 'open';

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Request a listening call. Runs the same crisis-safety screen as messaging:
-- someone reaching out to be heard may be in distress, and that should reach
-- the team fast — WITHOUT turning the request into "counselling".
create or replace function public.request_listening(
  p_phone text, p_note text default null, p_time text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; signal text;
begin
  insert into public.listening_requests (member_id, phone, note, preferred_time)
    values (auth.uid(), p_phone, p_note, p_time)
    returning id into rid;

  signal := public.crisis_signal(coalesce(p_note, ''));
  if signal is not null then
    insert into public.safety_flags (user_id, source, source_id, signal)
      values (auth.uid(), 'listening', rid::text, signal);
  end if;

  insert into public.audit_log(actor, action, entity, entity_id)
    values (auth.uid(), 'listening.requested', 'listening_requests', rid::text);
  return rid;
end $$;

create or replace function public.cancel_listening(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.listening_requests set status = 'cancelled'
   where id = p_id and member_id = auth.uid() and status in ('open','in_progress');
end $$;

-- ---------------------------------------------------------------------------
-- RLS — your own requests; staff (incl. listeners) see the queue.
-- ---------------------------------------------------------------------------
alter table public.listening_requests enable row level security;

drop policy if exists listening_select on public.listening_requests;
create policy listening_select on public.listening_requests
  for select using (member_id = auth.uid() or public.is_staff());
-- inserts/updates go through the RPCs only

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.listening_requests to authenticated;

revoke all on function public.request_listening(text, text, text) from public, anon;
grant execute on function public.request_listening(text, text, text) to authenticated;
revoke all on function public.cancel_listening(uuid) from public, anon;
grant execute on function public.cancel_listening(uuid) to authenticated;
