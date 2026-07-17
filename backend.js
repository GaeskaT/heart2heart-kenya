/* ============================================================
   Heart2Heart Kenya — Backend abstraction (Supabase, Phase 0)
   ------------------------------------------------------------
   Progressive enhancement: if supabase-config.js has a url +
   anonKey, this connects to Supabase Auth + the Phase 0 tables.
   If not, `Backend.enabled` is false and app.js keeps using
   localStorage exactly as before.

   Only Phase 0 surfaces are wired here: auth, profiles, invite
   redemption, readiness assessment, and consent. Later phases
   (matching, messaging, etc.) remain local for now.
   ============================================================ */
"use strict";

const Backend = (() => {
  const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const cfg = (window.SUPABASE_CONFIG || {});
  const configured = !!(cfg.url && cfg.anonKey && !/YOUR_/.test(cfg.url + cfg.anonKey));

  let client = null;
  let ready = false;

  function loadScript(src){
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = () => resolve(window.supabase);
      s.onerror = () => reject(new Error("Failed to load Supabase client"));
      document.head.appendChild(s);
    });
  }

  async function init(){
    if (!configured) return false;
    try {
      const lib = await loadScript(CDN);
      client = lib.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      ready = true;
      return true;
    } catch (e) {
      console.warn("[Backend] Supabase failed to initialise — staying in local mode.", e);
      ready = false;
      return false;
    }
  }

  const enabled = () => configured && ready;

  /* ---- Auth ---- */
  async function signUp(email, password){
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }
  async function signIn(email, password){
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }
  async function signOut(){ if (client) await client.auth.signOut(); }
  async function getUser(){
    if (!enabled()) return null;
    const { data } = await client.auth.getUser();
    return data ? data.user : null;
  }

  /* ---- Invites ---- */
  async function redeemInvite(code){
    const { data, error } = await client.rpc("redeem_invite", { invite_code: code });
    if (error) throw error;
    return data === true; // true if redeemed, false if invalid/expired
  }

  /* ---- Profiles ---- */
  // Map the app's user object <-> the profiles table columns.
  function toRow(u){
    return {
      full_name: u.name || null,
      age: u.age || null,
      gender: u.gender || null,
      county: u.county || null,
      faith: u.faith || null,
      education: u.education || null,
      career: u.career || null,
      intention: u.intention || null,
      family_goal: u.familyGoal || null,
      values: u.values || [],
      age_min: u.ageMin || 18,
      age_max: u.ageMax || 99,
      bio: u.bio || null,
      avatar_color: u.color || null,
    };
  }
  function fromRow(r){
    if (!r) return null;
    return {
      name: r.full_name || "", age: r.age || null, gender: r.gender || "",
      county: r.county || "", faith: r.faith || "", education: r.education || "",
      career: r.career || "", intention: r.intention || "", familyGoal: r.family_goal || "",
      values: r.values || [], ageMin: r.age_min || 18, ageMax: r.age_max || 99,
      bio: r.bio || "", color: r.avatar_color || "#0f6f6a",
      initials: (r.full_name || "?").trim().split(/\s+/).map(w => w[0]).slice(0,2).join("").toUpperCase(),
    };
  }

  async function saveProfile(u, extra){
    const user = await getUser();
    if (!user) throw new Error("Not signed in");
    const row = Object.assign({ id: user.id }, toRow(u), extra || {});
    const { error } = await client.from("profiles").upsert(row, { onConflict: "id" });
    if (error) throw error;
  }
  async function setOnboarded(v){
    const user = await getUser();
    if (!user) return;
    await client.from("profiles").update({ onboarded: v }).eq("id", user.id);
  }
  async function getProfile(){
    const user = await getUser();
    if (!user) return null;
    const { data, error } = await client.from("profiles").select("*").eq("id", user.id).single();
    if (error && error.code !== "PGRST116") throw error; // ignore "no rows"
    return data || null;
  }

  /* ---- Readiness ---- */
  async function saveReadiness(answers, dimensionScores, overall){
    const user = await getUser();
    if (!user) throw new Error("Not signed in");
    const { error } = await client.from("readiness_assessments").insert({
      user_id: user.id, answers, dimension_scores: dimensionScores, overall,
    });
    if (error) throw error;
  }

  /* ---- Consent ---- */
  async function saveConsent(policyVersion, codeOfConduct, dataProcessing){
    const user = await getUser();
    if (!user) throw new Error("Not signed in");
    const { error } = await client.from("consents").insert({
      user_id: user.id, policy_version: policyVersion,
      code_of_conduct: codeOfConduct, data_processing: dataProcessing,
    });
    if (error) throw error;
  }

  /* ---- Phase 1: matching, consent & messaging ---- */
  async function getMatches(limit = 10){
    const { data, error } = await client.rpc("get_matches", { match_limit: limit });
    if (error) throw error;
    return data || [];
  }
  async function memberCard(id){
    const { data, error } = await client.rpc("member_card", { target: id });
    if (error) throw error;
    return (data && data[0]) || null;
  }
  async function expressInterest(id){
    const { data, error } = await client.rpc("express_interest", { target: id });
    if (error) throw error;
    return data; // 'sent' | 'connected' | 'blocked' | 'invalid'
  }
  async function respondInterest(interestId, accept){
    const { data, error } = await client.rpc("respond_to_interest", { interest_id: interestId, accept });
    if (error) throw error;
    return data; // 'connected' | 'declined' | 'not_found'
  }
  async function blockUser(id){ const { error } = await client.rpc("block_user",   { target: id }); if (error) throw error; }
  async function unblockUser(id){ const { error } = await client.rpc("unblock_user", { target: id }); if (error) throw error; }
  async function reportUser(id, reason, context){
    const { error } = await client.rpc("report_user", { target: id, reason, context: context || {} });
    if (error) throw error;
  }
  async function inboundInterests(){
    const user = await getUser(); if (!user) return [];
    const { data, error } = await client.from("interests")
      .select("id, from_user, created_at").eq("to_user", user.id).eq("status", "pending");
    if (error) throw error;
    return data || [];
  }
  /* Everything the matches/chat UI needs to know about who you're linked to.
     RLS already scopes each table to the current user. */
  async function relationships(){
    const user = await getUser();
    if (!user) return { me: null, interests: [], connections: [], conversations: [], blocks: [] };
    const [i, c, v, b] = await Promise.all([
      client.from("interests").select("id, from_user, to_user, status"),
      client.from("connections").select("user_a, user_b, status"),
      client.from("conversations").select("id, user_a, user_b"),
      client.from("blocks").select("blocked"),
    ]);
    if (i.error) throw i.error;
    if (c.error) throw c.error;
    if (v.error) throw v.error;
    if (b.error) throw b.error;
    return {
      me: user.id,
      interests: i.data || [],
      connections: c.data || [],
      conversations: v.data || [],
      blocks: (b.data || []).map(x => x.blocked),
    };
  }
  async function listConversations(){
    const { data, error } = await client.from("conversations").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  async function listMessages(conversationId){
    const { data, error } = await client.from("messages")
      .select("id, sender, body, moderation_status, created_at")
      .eq("conversation_id", conversationId).order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  async function sendMessage(conversationId, body){
    const { data, error } = await client.rpc("send_message", { conversation_id: conversationId, body });
    if (error) throw error;
    return data || null; // jsonb: { id, moderation_status: 'approved' | 'flagged' }
  }
  // Subscribe to new messages in a conversation. Returns an unsubscribe fn.
  function subscribeMessages(conversationId, onInsert){
    const ch = client.channel("messages:" + conversationId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "conversation_id=eq." + conversationId },
        (payload) => onInsert(payload.new))
      .subscribe();
    return () => client.removeChannel(ch);
  }

  /* ---- Phase 2: counselling ---- */
  // Uses the counsellor_directory() RPC: names/avatars live on `profiles`, which
  // members can't read, so a definer RPC returns just the safe display fields.
  async function listCounsellors(){
    const { data, error } = await client.rpc("counsellor_directory");
    if (error) throw error;
    return data || [];
  }
  async function openSlots(counsellorId){
    const { data, error } = await client.rpc("open_slots", { counsellor: counsellorId });
    if (error) throw error;
    return data || [];
  }
  async function bookSession(slotId, sessionType, format){
    const { data, error } = await client.rpc("book_session", { slot: slotId, s_type: sessionType, fmt: format });
    if (error) throw error;   // 'slot_unavailable' if someone just took it
    return data;              // booking id
  }
  async function cancelBooking(bookingId){
    const { error } = await client.rpc("cancel_booking", { booking_id: bookingId });
    if (error) throw error;
  }
  async function listBookings(){
    const { data, error } = await client.from("bookings")
      .select("id, counsellor_id, session_type, format, scheduled_at, duration_mins, status, video_room")
      .neq("status", "cancelled").order("scheduled_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  async function askQuestion(body){
    const { data, error } = await client.rpc("ask_question", { body });
    if (error) throw error;
    return data;              // question id
  }
  async function listQuestions(){
    const { data, error } = await client.from("questions")
      .select("id, body, status, created_at, question_replies(id, body, created_at)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  async function listNotifications(){
    const { data, error } = await client.from("notifications")
      .select("*").order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data || [];
  }
  async function markNotificationRead(id){
    const { error } = await client.rpc("mark_notification_read", { n: id });
    if (error) throw error;
  }
  /* counsellor dashboard */
  async function counsellorClients(){
    const { data, error } = await client.rpc("counsellor_clients");
    if (error) throw error;
    return data || [];
  }
  async function answerQuestion(questionId, body){
    const { error } = await client.rpc("answer_question", { question_id: questionId, body });
    if (error) throw error;
  }

  /* ---- Phase 3: subscriptions, community & events ---- */

  // Billing. NOTE: the client never handles payment credentials. It only asks
  // for an intent; an Edge Function drives M-Pesa STK push / hosted checkout,
  // and entitlement is granted server-side from a verified provider webhook.
  async function listPlans(){
    const { data, error } = await client.from("plans").select("*").eq("active", true).order("sort");
    if (error) throw error;
    return data || [];
  }
  async function mySubscription(){
    const { data, error } = await client.rpc("my_subscription");
    if (error) throw error;
    return (data && data[0]) || null;
  }
  async function hasPremium(){
    const { data, error } = await client.rpc("has_premium", {});
    if (error) throw error;
    return data === true;
  }
  async function createPaymentIntent(planId, provider){
    const { data, error } = await client.rpc("create_payment_intent", { plan: planId, prov: provider });
    if (error) throw error;
    return data;   // payment id — hand to the Edge Function that calls the provider
  }
  async function cancelSubscription(){
    const { error } = await client.rpc("cancel_subscription");
    if (error) throw error;
  }
  async function listPayments(){
    const { data, error } = await client.from("payments")
      .select("id, amount_kes, currency, provider, status, purpose, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /* Webinars */
  async function listWebinars(){
    const { data, error } = await client.from("webinars")
      .select("id, title, blurb, starts_at, duration_mins, premium_only, capacity")
      .eq("active", true).order("starts_at");
    if (error) throw error;
    return data || [];
  }
  async function registerWebinar(id){
    const { data, error } = await client.rpc("register_webinar", { w: id });
    if (error) throw error;
    return data;   // 'registered' | 'premium_required' | 'full'
  }
  async function cancelWebinar(id){
    const { error } = await client.rpc("cancel_webinar", { w: id });
    if (error) throw error;
  }
  async function myWebinars(){
    const { data, error } = await client.from("webinar_registrations").select("webinar_id");
    if (error) throw error;
    return (data || []).map(r => r.webinar_id);
  }

  /* Community */
  async function listGroups(){
    const { data, error } = await client.from("community_groups")
      .select("id, slug, name, description, icon").eq("active", true);
    if (error) throw error;
    return data || [];
  }
  async function myGroups(){
    const { data, error } = await client.from("community_memberships").select("group_id");
    if (error) throw error;
    return (data || []).map(r => r.group_id);
  }
  async function joinGroup(id){ const { error } = await client.rpc("join_group",  { g: id }); if (error) throw error; }
  async function leaveGroup(id){ const { error } = await client.rpc("leave_group", { g: id }); if (error) throw error; }
  async function listPosts(groupId){
    const { data, error } = await client.from("community_posts")
      .select("id, author, body, moderation_status, created_at")
      .eq("group_id", groupId).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  async function postToGroup(groupId, body){
    const { data, error } = await client.rpc("post_to_group", { g: groupId, body });
    if (error) throw error;
    return (data && data[0]) || null;   // { id, moderation_status }
  }
  async function reportPost(postId, reason){
    const { error } = await client.rpc("report_post", { post: postId, reason });
    if (error) throw error;
  }

  /* Events */
  async function listEvents(){
    const { data, error } = await client.from("events")
      .select("id, title, kind, blurb, icon, starts_at, location, price_kes, capacity")
      .eq("active", true).order("starts_at");
    if (error) throw error;
    return data || [];
  }
  async function rsvpEvent(id){
    const { data, error } = await client.rpc("rsvp_event", { e: id });
    if (error) throw error;
    return data;   // 'going' | 'waitlist'
  }
  async function cancelRsvp(id){ const { error } = await client.rpc("cancel_rsvp", { e: id }); if (error) throw error; }
  async function myRsvps(){
    const { data, error } = await client.from("event_rsvps").select("event_id, status");
    if (error) throw error;
    return data || [];
  }

  return {
    init, enabled, configured,
    signUp, signIn, signOut, getUser,
    redeemInvite, saveProfile, setOnboarded, getProfile, fromRow,
    saveReadiness, saveConsent,
    // Phase 1
    getMatches, memberCard, expressInterest, respondInterest,
    blockUser, unblockUser, reportUser, inboundInterests, relationships,
    listConversations, listMessages, sendMessage, subscribeMessages,
    // Phase 2
    listCounsellors, openSlots, bookSession, cancelBooking, listBookings,
    askQuestion, listQuestions, listNotifications, markNotificationRead,
    counsellorClients, answerQuestion,
    // Phase 3
    listPlans, mySubscription, hasPremium, createPaymentIntent, cancelSubscription, listPayments,
    listWebinars, registerWebinar, cancelWebinar, myWebinars,
    listGroups, myGroups, joinGroup, leaveGroup, listPosts, postToGroup, reportPost,
    listEvents, rsvpEvent, cancelRsvp, myRsvps,
  };
})();
