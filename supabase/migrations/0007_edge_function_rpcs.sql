-- ============================================================================
-- Phase: Edge Functions — the privileged RPCs they call.
--
-- The Edge Functions verify the caller's JWT themselves, then act via the
-- service role. So these RPCs take an explicit p_sender/p_user rather than
-- reading auth.uid() (which is NULL for the service role), and are granted to
-- service_role ONLY. A member calling them directly gets permission denied.
--
-- Requires 0001-0006. Postgres 15 / Supabase.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Messaging with a real moderation verdict
--
-- send_message() (0002) runs the in-DB keyword screen. This variant accepts a
-- verdict computed by the moderate-message Edge Function using a real model,
-- while STILL enforcing participation and blocking server-side — the Edge
-- Function is trusted for the verdict, never for who the sender is.
-- ---------------------------------------------------------------------------
create or replace function public.send_message_moderated(
  p_conversation uuid,
  p_sender       uuid,
  p_body         text,
  p_status       public.moderation_status,
  p_categories   jsonb default '{}',
  p_model        text default 'openai',
  p_crisis       text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_conv  public.conversations%rowtype;
  v_other uuid;
  v_id    uuid;
begin
  select c.* into v_conv from public.conversations c where c.id = p_conversation;
  if not found then raise exception 'conversation_not_found'; end if;

  -- the sender must genuinely be a participant, whatever the caller claims
  if v_conv.user_a <> p_sender and v_conv.user_b <> p_sender then
    raise exception 'not a participant';
  end if;

  v_other := case when v_conv.user_a = p_sender then v_conv.user_b else v_conv.user_a end;
  if public.is_blocked(p_sender, v_other) then raise exception 'blocked'; end if;

  v_id := gen_random_uuid();

  insert into public.messages (id, conversation_id, sender, body, moderation_status)
    values (v_id, p_conversation, p_sender, p_body, p_status);

  insert into public.moderation_events (message_id, model, action, categories)
    values (v_id, p_model, p_status::text, p_categories);

  -- Distress is not misconduct: the message still lands, but the counselling
  -- team is alerted.
  if p_crisis is not null then
    insert into public.safety_flags (user_id, source, source_id, signal)
      values (p_sender, 'message', v_id::text, p_crisis);
  end if;

  return jsonb_build_object('id', v_id, 'moderation_status', p_status, 'crisis', p_crisis);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Payments: look up an intent for the STK-push function
-- ---------------------------------------------------------------------------
create or replace function public.payment_intent_for(p_payment uuid, p_user uuid)
returns table (id uuid, amount_kes int, plan_id text, status public.payment_status)
language sql stable security definer set search_path = public as $$
  select p.id, p.amount_kes, p.plan_id, p.status
  from public.payments p
  where p.id = p_payment and p.user_id = p_user;
$$;

/* Record the provider reference once the STK prompt has been sent. */
create or replace function public.attach_payment_ref(p_payment uuid, p_ref text)
returns void language sql security definer set search_path = public as $$
  update public.payments set provider_ref = p_ref where id = p_payment;
$$;

/* Mark a payment failed (callback ResultCode <> 0, or a push that errored). */
create or replace function public.fail_payment(p_payment uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.payments set status = 'failed', settled_at = now() where id = p_payment;
  insert into public.audit_log(actor, action, entity, entity_id, meta)
    values (null, 'payment.failed', 'payments', p_payment::text, jsonb_build_object('reason', p_reason));
end $$;

/* Find the payment a Daraja callback belongs to. */
create or replace function public.payment_by_ref(p_ref text)
returns table (id uuid, user_id uuid, status public.payment_status)
language sql stable security definer set search_path = public as $$
  select p.id, p.user_id, p.status from public.payments p where p.provider_ref = p_ref;
$$;

/*
  Idempotent webhook recording. Returns TRUE if this is the first time we've
  seen this key — providers retry callbacks, and a double-activation would
  hand out a free extra month.
*/
create or replace function public.record_payment_event(
  p_provider public.payment_provider, p_key text, p_payload jsonb
)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into public.payment_events (provider, idempotency_key, payload, processed_at)
    values (p_provider, p_key, p_payload, now());
  return true;
exception when unique_violation then
  return false;   -- already processed
end $$;

-- ---------------------------------------------------------------------------
-- 3. Video: confirm the caller owns the booking before minting a token
-- ---------------------------------------------------------------------------
create or replace function public.booking_for_video(p_booking uuid, p_user uuid)
returns table (id uuid, video_room text, scheduled_at timestamptz, duration_mins int, status public.booking_status)
language sql stable security definer set search_path = public as $$
  select b.id, b.video_room, b.scheduled_at, b.duration_mins, b.status
  from public.bookings b
  where b.id = p_booking
    and b.format = 'video'
    and (b.member_id = p_user or b.counsellor_id = p_user);
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants — service_role ONLY. Members must not reach these.
-- ---------------------------------------------------------------------------
revoke all on function public.send_message_moderated(uuid, uuid, text, public.moderation_status, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.payment_intent_for(uuid, uuid)              from public, anon, authenticated;
revoke all on function public.attach_payment_ref(uuid, text)              from public, anon, authenticated;
revoke all on function public.fail_payment(uuid, text)                    from public, anon, authenticated;
revoke all on function public.payment_by_ref(text)                        from public, anon, authenticated;
revoke all on function public.record_payment_event(public.payment_provider, text, jsonb) from public, anon, authenticated;
revoke all on function public.booking_for_video(uuid, uuid)               from public, anon, authenticated;

grant execute on function public.send_message_moderated(uuid, uuid, text, public.moderation_status, jsonb, text, text) to service_role;
grant execute on function public.payment_intent_for(uuid, uuid)           to service_role;
grant execute on function public.attach_payment_ref(uuid, text)           to service_role;
grant execute on function public.fail_payment(uuid, text)                 to service_role;
grant execute on function public.payment_by_ref(text)                     to service_role;
grant execute on function public.record_payment_event(public.payment_provider, text, jsonb) to service_role;
grant execute on function public.booking_for_video(uuid, uuid)            to service_role;

-- ============================================================================
-- Hardening, once moderate-message is deployed and the client points at it:
--
--   revoke execute on function public.send_message(uuid, text) from authenticated;
--
-- Until then send_message() stays callable so the app keeps working with the
-- in-DB keyword screen. Leaving it granted means a crafted client could bypass
-- the real model and fall back to the weaker screen — so run that line as soon
-- as the Edge Function is live. It is NOT run automatically here, because doing
-- so would break any project that hasn't deployed the functions yet.
-- ============================================================================
