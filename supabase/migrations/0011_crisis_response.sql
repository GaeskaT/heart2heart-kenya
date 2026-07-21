-- ============================================================================
-- Crisis response infrastructure.
--
-- Until now, a crisis signal raised a safety_flag that nobody acted on. This
-- adds the machinery a real, clinician-designed protocol runs ON: severity,
-- assignment, acknowledgement/action/resolution timestamps, outcome + notes,
-- an escalation flag, a staff triage queue, and realtime alerting.
--
-- ⚠️  IMPORTANT — CLINICAL BOUNDARY
-- The SEVERITY MAPPING below and every timeline/action are PLACEHOLDERS. A
-- licensed clinician must define which signals are critical, who responds, how
-- fast, and what they do — see docs/crisis-safety-protocol.md. This migration
-- builds the plumbing; it does NOT constitute a clinical protocol.
--
-- Requires 0001-0010. Postgres 15 / Supabase.
-- ============================================================================

do $$ begin
  create type public.safety_severity as enum ('critical','high','moderate');
exception when duplicate_object then null; end $$;

alter table public.safety_flags
  add column if not exists severity        public.safety_severity not null default 'high',
  add column if not exists assigned_to     uuid references public.profiles(id) on delete set null,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists actioned_at     timestamptz,
  add column if not exists resolved_at     timestamptz,
  add column if not exists outcome         text,
  add column if not exists notes           text,
  add column if not exists escalated       boolean not null default false;

create index if not exists safety_queue_idx on public.safety_flags(status, severity, created_at)
  where status <> 'closed';

-- ---------------------------------------------------------------------------
-- Severity mapping — PLACEHOLDER. The clinician owns this. Change here (or move
-- into a config table) once the protocol defines the tiers.
-- ---------------------------------------------------------------------------
create or replace function public.crisis_severity(p_signal text)
returns public.safety_severity language sql immutable as $$
  select case p_signal
    when 'self_harm' then 'critical'::public.safety_severity
    else 'high'::public.safety_severity
  end;
$$;

-- Stamp severity from the signal on every new flag, wherever it's raised
-- (messaging, questions, listening, community). Keeps the raising RPCs untouched.
create or replace function public.set_flag_severity()
returns trigger language plpgsql as $$
begin
  new.severity := public.crisis_severity(new.signal);
  return new;
end $$;

drop trigger if exists safety_flag_severity on public.safety_flags;
create trigger safety_flag_severity
  before insert on public.safety_flags
  for each row execute function public.set_flag_severity();

-- ---------------------------------------------------------------------------
-- Staff triage RPCs (all guarded by is_staff(); members cannot reach them)
-- ---------------------------------------------------------------------------

-- The queue a responder works from. Joins the member's name; also surfaces a
-- listening callback number when the flag came from a listening request.
create or replace function public.safety_queue(include_closed boolean default false)
returns table (
  id uuid, severity public.safety_severity, signal text, source text,
  status public.safety_status, escalated boolean,
  member_id uuid, member_name text, member_phone text,
  assigned_to uuid, assigned_name text,
  created_at timestamptz, acknowledged_at timestamptz, resolved_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then return; end if;
  return query
    select f.id, f.severity, f.signal, f.source, f.status, f.escalated,
           f.user_id, mp.full_name,
           (select lr.phone from public.listening_requests lr
             where f.source = 'listening' and lr.id::text = f.source_id),
           f.assigned_to, ap.full_name,
           f.created_at, f.acknowledged_at, f.resolved_at
    from public.safety_flags f
    left join public.profiles mp on mp.id = f.user_id
    left join public.profiles ap on ap.id = f.assigned_to
    where include_closed or f.status <> 'closed'
    order by (f.severity = 'critical') desc, f.created_at asc;
end $$;

-- Claim a flag: acknowledge it and take ownership.
create or replace function public.claim_safety_flag(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not_allowed'; end if;
  update public.safety_flags
     set assigned_to = auth.uid(),
         acknowledged_at = coalesce(acknowledged_at, now())
   where id = p_id;
  insert into public.audit_log(actor, action, entity, entity_id)
    values (auth.uid(), 'safety.claimed', 'safety_flags', p_id::text);
end $$;

-- Record what was done. Resolving closes it; otherwise it stays actioned/open.
create or replace function public.record_safety_action(
  p_id uuid, p_outcome text, p_notes text default null,
  p_resolved boolean default false, p_escalated boolean default false
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not_allowed'; end if;
  update public.safety_flags
     set outcome     = p_outcome,
         notes       = coalesce(p_notes, notes),
         escalated   = escalated or p_escalated,
         actioned_at = coalesce(actioned_at, now()),
         status      = case when p_resolved then 'closed'::public.safety_status
                            else 'actioned'::public.safety_status end,
         resolved_at = case when p_resolved then now() else resolved_at end,
         assigned_to = coalesce(assigned_to, auth.uid())
   where id = p_id;
  insert into public.audit_log(actor, action, entity, entity_id, meta)
    values (auth.uid(),
            case when p_resolved then 'safety.resolved' else 'safety.actioned' end,
            'safety_flags', p_id::text,
            jsonb_build_object('escalated', p_escalated, 'outcome', p_outcome));
end $$;

-- ---------------------------------------------------------------------------
-- Grants — staff-callable surface; the guard is inside each function.
-- ---------------------------------------------------------------------------
revoke all on function public.safety_queue(boolean)                    from public, anon;
revoke all on function public.claim_safety_flag(uuid)                  from public, anon;
revoke all on function public.record_safety_action(uuid, text, text, boolean, boolean) from public, anon;
grant execute on function public.safety_queue(boolean)                 to authenticated;
grant execute on function public.claim_safety_flag(uuid)               to authenticated;
grant execute on function public.record_safety_action(uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.crisis_severity(text)                 to authenticated;

-- Realtime: a staff dashboard subscribes to get critical flags the instant they
-- land. RLS already restricts safety_flags SELECT to staff, so members never
-- receive these events.
do $$ begin alter publication supabase_realtime add table public.safety_flags; exception when duplicate_object then null; end $$;
