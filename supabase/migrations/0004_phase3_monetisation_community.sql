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
