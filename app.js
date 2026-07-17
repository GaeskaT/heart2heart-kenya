/* ============================================================
   Heart2Heart Kenya — app engine (vanilla SPA)
   Hash router · localStorage state · compatibility matcher
   ============================================================ */
"use strict";

/* ---------------- State ---------------- */
const KEY = "h2h.kenya.v1";
const DEFAULT_STATE = {
  onboarded:false,
  conductAgreed:false,
  user:null,
  readiness:{ answers:{}, scores:{}, overall:0, done:false },
  connections:{},   // candidateId -> {status, messages:[], unread}
  goals:[],
  learning:{ completed:{} },  // lessonId -> true
  wellness:{ moods:[], gratitude:[], checkins:[], affFav:[] },
  counselling:{ bookings:[], questions:[], webinars:[], groups:[] },
  couple:{ active:false, partnerId:null, since:null, journal:[], goals:[], dates:[], budget:[], checkins:[] },
  marriage:{ done:{} },
  community:{ joined:[], posts:{} },
  events:{ rsvp:[] },
  premium:{ plan:"free" },
  seededInbound:false,
};

let S = load();
let pendingInvite = null;   // invite code entered on the invite screen (Supabase mode)

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(raw) return Object.assign({}, structuredClone(DEFAULT_STATE), JSON.parse(raw));
  }catch(e){ /* ignore */ }
  return structuredClone(DEFAULT_STATE);
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
function reset(){ S = structuredClone(DEFAULT_STATE); save(); resetRemote(); go("welcome"); }

/* ---------------- Small utils ---------------- */
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = (s="")=>String(s).replace(/[&<>"']/g, m=>(
  {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const initials = n => (n||"?").trim().split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();

function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove("show"), 2400);
}

function sheet(html){
  const back = document.createElement("div");
  back.className = "sheet-back";
  back.innerHTML = `<div class="sheet"><div class="grab"></div>${html}</div>`;
  document.body.appendChild(back);
  requestAnimationFrame(()=>back.classList.add("show"));
  const close = ()=>{ back.classList.remove("show"); setTimeout(()=>back.remove(),250); };
  back.addEventListener("click", e=>{ if(e.target===back) close(); });
  return { el:back, close };
}

const avatar = (name,color,cls="") =>
  `<div class="avatar ${cls}" style="background:${color||'#0f6f6a'}">${esc(initials(name))}</div>`;

const candidate = id => CANDIDATES.find(c=>c.id===id);
function conn(id){
  if(!S.connections[id]) S.connections[id] = { status:"none", messages:[], unread:0 };
  return S.connections[id];
}

/* ---- Learning progress ---- */
function completedMap(){
  if(!S.learning) S.learning = { completed:{} };
  if(!S.learning.completed) S.learning.completed = {};
  return S.learning.completed;
}
const lessonDone = id => !!completedMap()[id];
function markLesson(id){ completedMap()[id] = true; save(); }
function courseProgress(course){
  const done = course.lessons.filter(l => lessonDone(l.id)).length;
  const total = course.lessons.length;
  return { done, total, pct: total ? Math.round(done/total*100) : 0 };
}
function academyTotals(){
  let done = 0, total = 0;
  COURSES.forEach(c=>{ total += c.lessons.length; done += c.lessons.filter(l=>lessonDone(l.id)).length; });
  return { done, total, pct: total ? Math.round(done/total*100) : 0 };
}
/* First not-yet-done lesson across a course, else first lesson */
function nextLessonOf(course){
  return course.lessons.find(l => !lessonDone(l.id)) || course.lessons[0];
}

/* ---- Wellness ---- */
function well(){
  if(!S.wellness) S.wellness = {};
  const w = S.wellness;
  w.moods ||= []; w.gratitude ||= []; w.checkins ||= []; w.affFav ||= [];
  return w;
}
function dateKey(d){ // local YYYY-MM-DD
  const p = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
const todayKey = () => dateKey(new Date());
const moodToday = () => well().moods.find(m => m.d === todayKey());
function logMood(score, note){
  const w = well(); const k = todayKey();
  let m = w.moods.find(x => x.d === k);
  if(m){ m.score = score; if(note!=null) m.note = note; m.ts = Date.now(); }
  else { m = { d:k, score, note:note||"", ts:Date.now() }; w.moods.push(m); }
  save(); return m;
}
/* last N days as {key, dayLabel, mood|null}, oldest -> newest */
function moodTrend(n=7){
  const w = well(); const out = [];
  const names = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  for(let i=n-1; i>=0; i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const k = dateKey(d);
    out.push({ key:k, day:names[d.getDay()], mood:w.moods.find(m=>m.d===k)||null });
  }
  return out;
}
function moodStreak(){
  const w = well(); let streak = 0;
  for(let i=0;;i++){
    const d = new Date(); d.setDate(d.getDate()-i);
    if(w.moods.some(m=>m.d===dateKey(d))) streak++;
    else break;
  }
  return streak;
}
function addGratitude(text){ well().gratitude.unshift({ ts:Date.now(), text }); save(); }
function addCheckin(answers, note){ well().checkins.unshift({ ts:Date.now(), answers, note:note||"" }); save(); }
/* Daily index into an array, stable per calendar day */
function dailyIndex(len){
  const d = new Date();
  const doy = Math.floor((d - new Date(d.getFullYear(),0,0)) / 86400000);
  return doy % len;
}

/* ---- Counsellor Support ---- */
function couns(){
  if(!S.counselling) S.counselling = {};
  const c = S.counselling;
  c.bookings ||= []; c.questions ||= []; c.webinars ||= []; c.groups ||= [];
  return c;
}
const counsellorById = id => COUNSELLORS.find(c=>c.id===id);
function addBooking(b){ couns().bookings.push({ id:"b"+Date.now(), ...b, ts:Date.now() }); save(); }
function cancelBooking(id){ const c = couns(); c.bookings = c.bookings.filter(b=>b.id!==id); save(); }
/* upcoming bookings sorted by date+time */
function upcomingBookings(){
  return couns().bookings.slice().sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
}
function toggleWebinar(id){ const w = couns().webinars; const i = w.indexOf(id); if(i>=0) w.splice(i,1); else w.push(id); save(); return i<0; }
function toggleGroup(id){ const g = couns().groups; const i = g.indexOf(id); if(i>=0) g.splice(i,1); else g.push(id); save(); return i<0; }
function addQuestion(text){
  const q = { id:"q"+Date.now(), text, ts:Date.now(), reply:null };
  couns().questions.unshift(q); save(); return q;
}
/* Human date for an offset (days from today) or an ISO yyyy-mm-dd */
function fmtDate(d){
  return d.toLocaleDateString([], { weekday:"short", day:"numeric", month:"short" });
}
function dateFromOffset(days){ const d = new Date(); d.setDate(d.getDate()+days); return d; }
function next7Days(){
  const out = [];
  for(let i=1;i<=7;i++){ const d = dateFromOffset(i); out.push({ key:dateKey(d), label:d.toLocaleDateString([], {weekday:"short"}), day:d.getDate(), date:d }); }
  return out;
}

/* ---- Couple Space ---- */
function cpl(){
  if(!S.couple) S.couple = {};
  const c = S.couple;
  c.journal ||= []; c.goals ||= []; c.dates ||= []; c.budget ||= []; c.checkins ||= [];
  return c;
}
const connectedPartners = () => CANDIDATES.filter(c => conn(c.id).status === "connected");
function commitCouple(partnerId){
  const c = cpl();
  c.active = true; c.partnerId = partnerId; c.since = todayKey();
  save();
}
function endCouple(){ S.couple = { active:false, partnerId:null, since:null, journal:[], goals:[], dates:[], budget:[], checkins:[] }; save(); }
function daysTogether(){
  const c = cpl(); if(!c.since) return 0;
  return Math.max(0, Math.round((new Date(todayKey()) - new Date(c.since)) / 86400000));
}
function budgetTotals(){
  const c = cpl();
  let income = 0, expense = 0;
  c.budget.forEach(b => b.type==="income" ? income += b.amount : expense += b.amount);
  return { income, expense, balance: income - expense };
}

/* ---- Marriage prep ---- */
function marriageDone(){ if(!S.marriage) S.marriage = {done:{}}; if(!S.marriage.done) S.marriage.done={}; return S.marriage.done; }
function marriageProgress(){
  const d = marriageDone(); const done = MARRIAGE_TOPICS.filter(t=>d[t.id]).length;
  return { done, total:MARRIAGE_TOPICS.length, pct: Math.round(done/MARRIAGE_TOPICS.length*100) };
}

/* ---- Community ---- */
function community(){
  if(!S.community) S.community = {};
  S.community.joined ||= []; S.community.posts ||= {};
  return S.community;
}
function communityPosts(groupId){
  const g = COMMUNITY_GROUPS.find(x=>x.id===groupId);
  const seeded = (g?.seed || []).map((s,i)=>({ id:"seed"+groupId+i, a:s.a, t:s.t, ts:Date.now()-s.d*86400000, seeded:true }));
  const mine = (community().posts[groupId] || []);
  return [...mine, ...seeded].sort((a,b)=> b.ts - a.ts);
}
function addCommunityPost(groupId, text){
  const c = community();
  (c.posts[groupId] ||= []).push({ id:"p"+Date.now(), a:(S.user?.name||"You"), t:text, ts:Date.now(), mine:true });
  save();
}
function toggleCommunity(id){ const j = community().joined; const i = j.indexOf(id); if(i>=0) j.splice(i,1); else j.push(id); save(); return i<0; }

/* ---- Events ---- */
function eventsState(){ if(!S.events) S.events = {rsvp:[]}; S.events.rsvp ||= []; return S.events; }
function toggleRSVP(id){ const r = eventsState().rsvp; const i = r.indexOf(id); if(i>=0) r.splice(i,1); else r.push(id); save(); return i<0; }

/* ---- Premium ---- */
function currentPlan(){ if(!S.premium) S.premium = {plan:"free"}; return S.premium.plan || "free"; }
function setPlan(id){ if(!S.premium) S.premium = {}; S.premium.plan = id; save(); }

/* ---------------- Compatibility matcher ---------------- */
const INTENTION_RANK = { exploring:0, committed:1, marriage:2 };

/* The "why you match" lines. Shared by both modes: locally we pair them with a
   locally-computed score, in Supabase mode with the server's authoritative one
   (public.match_score). Deliberately needs no age prefs, which get_matches()
   doesn't expose. */
function matchReasons(u, c){
  const reasons = [];
  const shared = (u.values||[]).filter(v => (c.values||[]).includes(v));
  if(shared.length) reasons.push({k:"Shared values", v: shared.slice(0,3).join(", ")});

  const gap = Math.abs((INTENTION_RANK[u.intention]??1) - (INTENTION_RANK[c.intention]??1));
  if(gap === 0) reasons.push({k:"Same intention", v: intentionLabel(c.intention)});

  const shy = v => v === "Prefer not to say";
  if(u.faith === c.faith && !shy(u.faith) && u.faith) reasons.push({k:"Shared faith", v:c.faith});

  if(familyAlign(u.familyGoal, c.familyGoal).pts >= 12) reasons.push({k:"Family goals align", v:c.familyGoal});
  if(u.county && u.county === c.county) reasons.push({k:"Near you", v:c.county});
  return reasons;
}

function scoreMatch(u, c){
  let pts = 0, max = 0;

  // Shared values — up to 30
  max += 30;
  const shared = (u.values||[]).filter(v => c.values.includes(v));
  pts += Math.min(30, shared.length * 10);

  // Relationship intention — up to 20
  max += 20;
  const gap = Math.abs((INTENTION_RANK[u.intention]??1) - (INTENTION_RANK[c.intention]??1));
  if(gap === 0){ pts += 20; }
  else if(gap === 1){ pts += 11; }

  // Faith — up to 15
  max += 15;
  const shy = v => v === "Prefer not to say";
  if(u.faith === c.faith && !shy(u.faith)){ pts += 15; }
  else if(shy(u.faith) || shy(c.faith)){ pts += 8; }

  // Family goals — up to 15
  max += 15;
  pts += familyAlign(u.familyGoal, c.familyGoal).pts;

  // Mutual age fit — up to 10
  max += 10;
  const uWants = c.age >= (u.ageMin||18) && c.age <= (u.ageMax||99);
  const cWants = u.age >= c.prefs.ageMin && u.age <= c.prefs.ageMax;
  if(uWants && cWants){ pts += 10; }
  else if(uWants || cWants){ pts += 5; }

  // Location — up to 10
  max += 10;
  if(u.county === c.county){ pts += 10; }

  return { pct: Math.round((pts/max)*100), reasons: matchReasons(u, c) };
}

function familyAlign(a, b){
  if(a === b) return { pts:15 };
  const wants = new Set(["Want children","Open to children","Have children already"]);
  const no    = "Prefer no children";
  if(a === no && b === no) return { pts:15 };
  if((a === no) !== (b === no)) return { pts:2 };      // one wants, one doesn't
  if(wants.has(a) && wants.has(b)) return { pts:11 };  // both broadly open
  return { pts:7 };
}
const intentionLabel = id => (INTENTIONS.find(i=>i.id===id)||{}).label || id;

function rankedMatches(){
  if(!S.user) return [];
  return CANDIDATES
    .map(c => ({ c, ...scoreMatch(S.user, c) }))
    .sort((a,b)=> b.pct - a.pct);
}

/* Seed a couple of inbound interests so the consent flow has life. */
function seedInbound(){
  if(Backend.enabled()) return;      // real interests come from the server
  if(S.seededInbound) return;
  const top = rankedMatches().slice(0,5).map(m=>m.c.id);
  ["c1","c6"].forEach(id=>{ if(top.includes(id)) conn(id).status = "they_sent"; });
  // fallback: if neither in top, use the two best
  if(!top.includes("c1") && !top.includes("c6")){
    top.slice(0,2).forEach(id=> conn(id).status = "they_sent");
  }
  S.seededInbound = true; save();
}

/* ============================================================
   Remote (Supabase) data layer for matches & chat.
   Routes stay synchronous: they call ensureX(), which either
   returns true (cache warm) or kicks off a fetch and re-renders
   when it lands. Local mode never touches any of this.
   ============================================================ */
const remote = { matches:null, rel:null, cards:{}, msgs:{}, loading:false, err:null,
                 counsellors:null, bookings:null, questions:null, slots:{}, cLoading:false, cErr:null };
function resetRemote(){
  remote.matches=null; remote.rel=null; remote.cards={}; remote.msgs={}; remote.err=null;
  resetCounsellingCache();
}
function resetCounsellingCache(){
  remote.counsellors=null; remote.bookings=null; remote.questions=null; remote.slots={}; remote.cErr=null;
}

/* server profile row -> the shape the existing UI already renders */
function cardFromRow(r){
  return {
    id:r.id, name:r.full_name || "Member", age:r.age, county:r.county,
    color:r.avatar_color || "#0f6f6a", career:r.career, verified:!!r.verified,
    values:r.values || [], intention:r.intention, bio:r.bio, faith:r.faith,
    education:r.education, familyGoal:r.family_goal,
  };
}

async function loadRemote(){
  const [rows, rel] = await Promise.all([Backend.getMatches(12), Backend.relationships()]);
  remote.matches = rows.map(r => {
    const c = cardFromRow(r);
    return { c, pct: r.score, reasons: matchReasons(S.user, c) };   // server score, client reasons
  });
  remote.rel = rel;

  // People we're linked to but who aren't in the match list (get_matches excludes
  // anyone already connected) still need a name/avatar — fetch their cards.
  const others = new Set();
  rel.conversations.forEach(c => others.add(c.user_a === rel.me ? c.user_b : c.user_a));
  rel.interests.forEach(i => others.add(i.from_user === rel.me ? i.to_user : i.from_user));
  others.delete(rel.me);
  const need = [...others].filter(id => !remote.matches.some(m => m.c.id === id) && !remote.cards[id]);
  const cards = await Promise.all(need.map(id => Backend.memberCard(id).catch(() => null)));
  need.forEach((id, i) => { if(cards[i]) remote.cards[id] = cardFromRow(cards[i]); });
}

/* returns true when data is ready to render */
function ensureRemote(){
  if(!Backend.enabled()) return true;
  if(remote.matches && remote.rel) return true;
  if(remote.loading) return false;
  remote.loading = true; remote.err = null;
  loadRemote()
    .catch(e => { remote.err = e.message || String(e); console.warn("[remote]", e); })
    .finally(() => { remote.loading = false; render(); });
  return false;
}

/* ---- Phase 2: counselling (counsellors, bookings, confidential Q&A) ---- */
async function loadCounselling(){
  const [counsellors, bookings, questions] = await Promise.all([
    Backend.listCounsellors(),     // counsellor_directory(): name + avatar included
    Backend.listBookings(),
    Backend.listQuestions(),
  ]);
  remote.counsellors = counsellors.map(c => ({
    ...c, name: c.full_name || "Counsellor", color: c.avatar_color || "#0f6f6a",
  }));
  remote.bookings = bookings;
  remote.questions = questions;
}
function ensureCounselling(){
  if(!Backend.enabled()) return true;
  if(remote.counsellors && remote.bookings && remote.questions) return true;
  if(remote.cLoading) return false;
  remote.cLoading = true; remote.cErr = null;
  loadCounselling()
    .catch(e => { remote.cErr = e.message || String(e); console.warn("[counselling]", e); })
    .finally(() => { remote.cLoading = false; render(); });
  return false;
}
/* open slots for one counsellor, loaded on demand */
function ensureSlots(counsellorId){
  if(!Backend.enabled() || !counsellorId) return true;
  if(remote.slots[counsellorId]) return true;
  if(remote.slots["_l_" + counsellorId]) return false;
  remote.slots["_l_" + counsellorId] = true;
  Backend.openSlots(counsellorId)
    .then(rows => { remote.slots[counsellorId] = rows; })
    .catch(e => { remote.slots[counsellorId] = []; console.warn("[slots]", e); })
    .finally(() => { delete remote.slots["_l_" + counsellorId]; render(); });
  return false;
}

/* mode-agnostic counselling accessors */
function counsellorsList(){
  if(!Backend.enabled()) return COUNSELLORS;
  return (remote.counsellors || []).map(c => ({
    id:c.id, name:c.name, color:c.color, title:c.title || "Counsellor",
    focus:c.specialties || [], bio:c.bio || "", credentials:c.credentials || [],
  }));
}
function counsellorNamed(id){ return counsellorsList().find(c => c.id === id) || null; }
/* upcoming bookings, normalised to what the UI already renders */
function bookingsList(){
  if(!Backend.enabled()) return upcomingBookings();
  return (remote.bookings || [])
    .filter(b => b.status === "scheduled")
    .map(b => ({
      id:b.id, counsellor:b.counsellor_id, type:b.session_type, format:b.format,
      date:b.scheduled_at, time:new Date(b.scheduled_at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}),
      video_room:b.video_room, remote:true,
    }))
    .sort((a,b) => new Date(a.date) - new Date(b.date));
}
function questionsList(){
  if(!Backend.enabled()) return couns().questions;
  return (remote.questions || []).map(q => ({
    id:q.id, text:q.body, ts:new Date(q.created_at).getTime(),
    reply:(q.question_replies && q.question_replies[0]) ? q.question_replies[0].body : null,
  }));
}

/* ---- relationship state derived from the server tables ---- */
function relStatus(id){
  const rel = remote.rel; if(!rel) return "none";
  if(rel.blocks.includes(id)) return "blocked";
  if(rel.connections.some(c => (c.user_a === id || c.user_b === id) && c.status === "connected")) return "connected";
  if(rel.interests.some(i => i.from_user === rel.me && i.to_user === id && i.status === "pending")) return "you_sent";
  if(rel.interests.some(i => i.to_user === rel.me && i.from_user === id && i.status === "pending")) return "they_sent";
  return "none";
}
function relInterestId(id){
  const rel = remote.rel; if(!rel) return null;
  return (rel.interests.find(i => i.to_user === rel.me && i.from_user === id && i.status === "pending") || {}).id || null;
}
function relConversation(id){
  const rel = remote.rel; if(!rel) return null;
  return (rel.conversations.find(c => c.user_a === id || c.user_b === id) || {}).id || null;
}

/* ---- mode-agnostic accessors the routes use ---- */
function statusFor(id){ return Backend.enabled() ? relStatus(id) : conn(id).status; }
function cardFor(id){
  if(!Backend.enabled()) return candidate(id);
  const m = (remote.matches || []).find(x => x.c.id === id);
  return m ? m.c : (remote.cards[id] || null);
}
function matchesList(){
  if(!Backend.enabled()) return rankedMatches();
  return remote.matches || [];
}
function inboundList(){
  if(!Backend.enabled()) return rankedMatches().filter(m => conn(m.c.id).status === "they_sent");
  const rel = remote.rel; if(!rel) return [];
  return rel.interests
    .filter(i => i.to_user === rel.me && i.status === "pending")
    .map(i => {
      const c = cardFor(i.from_user);
      if(!c) return null;
      const m = (remote.matches || []).find(x => x.c.id === i.from_user);
      return { c, pct: m ? m.pct : null, reasons: m ? m.reasons : matchReasons(S.user, c) };
    })
    .filter(Boolean);
}
/* connected people, for the Messages list */
function threadList(){
  if(!Backend.enabled()){
    return Object.entries(S.connections)
      .filter(([, c]) => c.status === "connected" || c.status === "they_sent")
      .map(([id, c]) => ({ id, c, cand: candidate(id) }))
      .filter(x => x.cand);
  }
  const rel = remote.rel; if(!rel) return [];
  const out = [];
  rel.conversations.forEach(cv => {
    const other = cv.user_a === rel.me ? cv.user_b : cv.user_a;
    if(relStatus(other) !== "connected") return;
    const cand = cardFor(other);
    if(cand) out.push({ id: other, c: { status:"connected", messages: remote.msgs[other] || [], unread:0 }, cand });
  });
  inboundList().forEach(m => out.push({ id: m.c.id, c: { status:"they_sent", messages:[], unread:0 }, cand: m.c }));
  return out;
}

/* ---- chat messages ---- */
function ensureMessages(userId){
  if(!Backend.enabled()) return true;
  if(remote.msgs[userId]) return true;
  const convId = relConversation(userId);
  if(!convId) return true;                       // nothing to load yet
  if(remote.msgs["_loading_" + userId]) return false;
  remote.msgs["_loading_" + userId] = true;
  Backend.listMessages(convId)
    .then(rows => {
      remote.msgs[userId] = rows.map(r => ({
        from: r.sender === remote.rel.me ? "me" : "them",
        text: r.body, ts: new Date(r.created_at).getTime(), status: r.moderation_status,
      }));
    })
    .catch(e => { remote.msgs[userId] = []; console.warn("[messages]", e); })
    .finally(() => { delete remote.msgs["_loading_" + userId]; render(); });
  return false;
}

const loadingScreen = (title) => ({
  html:`<div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">${title}</h2></div>
        <div class="empty"><div class="ico">💚</div><p>Loading…</p></div>`,
  mount(root){ const b = $("[data-act=back]",root); if(b) b.onclick = ()=> history.length>1 ? history.back() : go("home"); }
});
const errorScreen = (title, msg, retry) => ({
  html:`<div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">${title}</h2></div>
        <div class="pad stack"><div class="callout coral">⚠️ ${esc(msg||"Something went wrong")}</div>
        <button class="btn" id="retry">Try again</button></div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("home");
    $("#retry",root).onclick = ()=>{ resetRemote(); render(); };
  }
});

/* ---------------- Router ---------------- */
const routes = {};
function route(name, fn){ routes[name] = fn; }
function go(name, param){ location.hash = "#/" + name + (param!=null ? "/"+param : ""); }

function parseHash(){
  const raw = location.hash.replace(/^#\/?/, "");
  const [name, param] = raw.split("/");
  return { name: name || "welcome", param };
}

function render(){
  const { name, param } = parseHash();

  // Leaving the chat screen? drop its realtime subscription.
  if(name !== "chat" && chatUnsub){ try{ chatUnsub(); }catch(e){} chatUnsub = null; }

  // Onboarding guard
  const openRoutes = ["welcome","login","invite","signup","readiness","conduct","result"];
  if(!S.onboarded && !openRoutes.includes(name)){ return go("welcome"); }
  if(S.onboarded && ["welcome","invite","signup"].includes(name)){ return go("home"); }

  const fn = routes[name] || routes.home;
  const screen = $("#screen");
  const out = fn(param) || { html:"" };
  screen.scrollTop = 0;
  screen.innerHTML = `<div class="fade-in">${out.html||""}</div>`;

  // Tab bar visibility + active state
  const withNav = ["home","matches","messages","learn","profile"].includes(name);
  const tabbar = $("#tabbar");
  tabbar.hidden = !withNav;
  screen.classList.toggle("has-nav", withNav);
  $$(".tab").forEach(t=> t.classList.toggle("active", t.dataset.nav === name));
  updateBadge();

  if(out.mount) out.mount(screen);
}

window.addEventListener("hashchange", render);

/* Tab bar navigation */
document.addEventListener("click", e=>{
  const tab = e.target.closest("[data-nav]");
  if(tab){ go(tab.dataset.nav); }
});

function updateBadge(){
  const b = $("#msg-badge");
  let count;
  if(Backend.enabled()){
    count = remote.rel ? inboundList().length : 0;   // pending requests awaiting your reply
  } else {
    const total = Object.values(S.connections).reduce((n,c)=> n + (c.unread||0), 0);
    const pend  = Object.values(S.connections).filter(c=>c.status==="they_sent").length;
    count = total + pend;
  }
  if(count>0){ b.hidden=false; b.textContent = count>9?"9+":count; } else b.hidden=true;
}

/* =====================================================================
   SCREENS
   ===================================================================== */

/* ---- Welcome / hero ---- */
route("welcome", ()=>({
  html:`
  <div class="hero">
    <div>
      <div class="brandmark">💚</div>
      <h1>Heart2Heart<br>Kenya</h1>
      <p class="tag">Healing first. Healthy relationships next.</p>
      <div class="valuelist stack">
        ${[
          ["🌱","Counsellor-guided — for people who've done the inner work"],
          ["🛡️","Verified members. No anonymous messaging, ever"],
          ["💞","A few thoughtful matches, not endless swiping"],
          ["💍","A path from healthy dating toward marriage"],
        ].map(([i,t])=>`<div class="row"><span class="vi">${i}</span><span>${t}</span></div>`).join("")}
      </div>
    </div>
    <div class="stack">
      <button class="btn secondary" data-act="begin">I have a counsellor invitation</button>
      <p class="center tiny" style="opacity:.85">Membership is by counsellor approval. Already a member? Continue below.</p>
      <button class="btn" data-act="begin">Get started</button>
      ${Backend.enabled()?`<button class="btn ghost" data-act="login" style="color:#fff">Log in</button>`:""}
    </div>
  </div>`,
  mount(root){
    $$("[data-act=begin]", root).forEach(b=> b.onclick = ()=> go("invite"));
    const li = $("[data-act=login]", root); if(li) li.onclick = ()=> go("login");
  }
}));

/* ---- Log in (Supabase mode only) ---- */
route("login", ()=>({
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2>Welcome back</h2></div>
  <div class="pad stack">
    <p class="muted tiny">Log in to your Heart2Heart account.</p>
    <label class="field"><span>Email</span><input class="input" id="email" type="email" autocomplete="email" placeholder="you@example.com"></label>
    <label class="field"><span>Password</span><input class="input" id="password" type="password" autocomplete="current-password" placeholder="Your password"></label>
    <button class="btn" id="login">Log in</button>
    <p class="center tiny faint">New here? <a href="#/invite">Start with an invitation</a></p>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("welcome");
    $("#login",root).onclick = async ()=>{
      const email = $("#email",root).value.trim(), password = $("#password",root).value;
      if(!email || !password){ toast("Enter your email and password"); return; }
      const btn = $("#login",root); btn.disabled = true; btn.textContent = "Logging in…";
      try{
        await Backend.signIn(email, password);
        resetRemote();                      // never show the previous session's data
        const prof = await Backend.getProfile();
        if(prof){ S.user = Backend.fromRow(prof); S.onboarded = !!prof.onboarded; save(); }
        toast("Welcome back 💚");
        go(S.onboarded ? "home" : "invite");
      }catch(e){
        toast(e.message || "Login failed"); btn.disabled = false; btn.textContent = "Log in";
      }
    };
  }
}));

/* ---- Invite / eligibility ---- */
route("invite", ()=>({
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2>Counsellor invitation</h2></div>
  <div class="pad stack">
    <div class="callout teal">🔒 Heart2Heart is exclusive to adults who have completed individual or relationship counselling and are emotionally ready to connect.</div>
    <label class="field"><span>Invitation code from your counsellor</span>
      <input class="input" id="code" placeholder="e.g. H2H-KE-2026" autocapitalize="characters"></label>
    <div class="card flat stack">
      <p class="tiny muted">Please confirm the following to continue:</p>
      ${[
        "I am 18 years or older.",
        "I have completed counselling and feel ready.",
        "I'm seeking a healthy, respectful relationship.",
      ].map((t,i)=>`<label class="row" style="align-items:flex-start"><input type="checkbox" class="elig" data-i="${i}" style="margin-top:3px"> <span class="tiny">${t}</span></label>`).join("")}
    </div>
    <button class="btn" id="verify" disabled>Verify & continue</button>
    <p class="center tiny faint">Don't have a code? Ask your counsellor to sponsor you, or book an intake session in-app.</p>
  </div>`,
  mount(root){
    $(".back",root).onclick = ()=> go("welcome");
    const code = $("#code",root), verify = $("#verify",root);
    const boxes = $$(".elig",root);
    const check = ()=>{ verify.disabled = !(code.value.trim().length>=3 && boxes.every(b=>b.checked)); };
    code.oninput = check; boxes.forEach(b=> b.onchange = check);
    verify.onclick = ()=>{ pendingInvite = code.value.trim(); toast("Invitation verified ✓"); go("signup"); };
  }
}));

/* ---- Signup / profile ---- */
route("signup", ()=>{
  const u = S.user || { values:[], color:"#0f6f6a" };
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2>Your profile</h2></div>
  <div class="pad stack" id="signup">
    <p class="muted tiny">This helps us find a few genuinely compatible people. You can edit anything later.</p>

    ${(Backend.enabled() && !S.onboarded)?`
    <div class="card flat stack">
      <p class="tiny faint">Create your account</p>
      <label class="field"><span>Email</span><input class="input" id="email" type="email" autocomplete="email" placeholder="you@example.com"></label>
      <label class="field"><span>Password</span><input class="input" id="password" type="password" autocomplete="new-password" placeholder="At least 6 characters"></label>
    </div>`:""}

    <label class="field"><span>First name</span>
      <input class="input" id="name" value="${esc(u.name||"")}" placeholder="Your name"></label>

    <div class="row">
      <label class="field grow"><span>Age</span>
        <input class="input" id="age" type="number" min="18" max="90" value="${u.age||""}" placeholder="30"></label>
      <label class="field grow"><span>I am</span>
        <select class="input" id="gender">
          ${["Woman","Man","Prefer not to say"].map(g=>`<option ${u.gender===g?"selected":""}>${g}</option>`).join("")}
        </select></label>
    </div>

    <label class="field"><span>County</span>
      <select class="input" id="county">${COUNTIES.map(c=>`<option ${u.county===c?"selected":""}>${c}</option>`).join("")}</select></label>

    <div class="row">
      <label class="field grow"><span>Faith</span>
        <select class="input" id="faith">${FAITHS.map(f=>`<option ${u.faith===f?"selected":""}>${f}</option>`).join("")}</select></label>
      <label class="field grow"><span>Education</span>
        <select class="input" id="education">${EDUCATION.map(f=>`<option ${u.education===f?"selected":""}>${f}</option>`).join("")}</select></label>
    </div>

    <label class="field"><span>Career / what you do</span>
      <input class="input" id="career" value="${esc(u.career||"")}" placeholder="e.g. Nurse, teacher, entrepreneur"></label>

    <label class="field"><span>Relationship intention</span>
      <select class="input" id="intention">${INTENTIONS.map(i=>`<option value="${i.id}" ${u.intention===i.id?"selected":""}>${i.label}</option>`).join("")}</select></label>

    <label class="field"><span>Family goals</span>
      <select class="input" id="familyGoal">${FAMILY_GOALS.map(f=>`<option ${u.familyGoal===f?"selected":""}>${f}</option>`).join("")}</select></label>

    <div>
      <span style="display:block;font-size:13px;font-weight:600;color:var(--ink-soft);margin:0 0 6px 2px">Your core values — pick 3 to 5</span>
      <div class="chips" id="values">
        ${VALUES.map(v=>`<button type="button" class="chip select ${(u.values||[]).includes(v)?"on":""}" data-v="${v}">${v}</button>`).join("")}
      </div>
    </div>

    <div class="row">
      <label class="field grow"><span>Match age from</span>
        <input class="input" id="ageMin" type="number" min="18" max="90" value="${u.ageMin||25}"></label>
      <label class="field grow"><span>to</span>
        <input class="input" id="ageMax" type="number" min="18" max="90" value="${u.ageMax||45}"></label>
    </div>

    <label class="field"><span>A little about you</span>
      <textarea class="input" id="bio" placeholder="What matters to you, and what you're hoping to build.">${esc(u.bio||"")}</textarea></label>

    <button class="btn" id="continue">Continue to Relationship Readiness</button>
  </div>`,
  mount(root){
    $(".back",root).onclick = ()=> go("invite");
    // value chips (limit 5)
    $$("#values .chip",root).forEach(ch=> ch.onclick = ()=>{
      const on = $$("#values .chip.on",root);
      if(!ch.classList.contains("on") && on.length>=5){ toast("Choose up to 5 values"); return; }
      ch.classList.toggle("on");
    });
    $("#continue",root).onclick = async ()=>{
      const g = id => $("#"+id,root);
      const values = $$("#values .chip.on",root).map(c=>c.dataset.v);
      const name = g("name").value.trim();
      const age  = +g("age").value;
      if(name.length<2){ toast("Please add your name"); return; }
      if(!(age>=18)){ toast("Please add a valid age (18+)"); return; }
      if(values.length<3){ toast("Pick at least 3 values"); return; }
      const u = {
        name, age, gender:g("gender").value, county:g("county").value,
        faith:g("faith").value, education:g("education").value, career:g("career").value.trim(),
        intention:g("intention").value, familyGoal:g("familyGoal").value, values,
        ageMin:+g("ageMin").value||18, ageMax:+g("ageMax").value||99,
        bio:g("bio").value.trim(),
        color:"#0f6f6a", initials:initials(name),
      };

      if(Backend.enabled() && S.onboarded){
        // editing an existing profile — just persist the update
        const btn = $("#continue",root); btn.disabled = true; btn.textContent = "Saving…";
        try{ await Backend.saveProfile(u); S.user = u; save(); toast("Profile updated ✓"); go("profile"); }
        catch(e){ toast(e.message || "Could not save"); btn.disabled=false; btn.textContent="Continue to Relationship Readiness"; }
        return;
      }

      if(Backend.enabled()){
        const email = g("email")?.value.trim(), password = g("password")?.value;
        if(!email || !(password||"").length){ toast("Add your email and password"); return; }
        if(password.length<6){ toast("Password must be at least 6 characters"); return; }
        const btn = $("#continue",root); btn.disabled = true; btn.textContent = "Creating account…";
        try{
          await Backend.signUp(email, password);
          if(pendingInvite){
            const ok = await Backend.redeemInvite(pendingInvite);
            if(!ok){ toast("That invitation code isn't valid — check with your counsellor."); btn.disabled=false; btn.textContent="Continue to Relationship Readiness"; return; }
          }
          await Backend.saveProfile(u);
          S.user = u; save();
          go("readiness");
        }catch(e){
          toast(e.message || "Could not create your account");
          btn.disabled = false; btn.textContent = "Continue to Relationship Readiness";
        }
        return;
      }

      S.user = u;
      save();
      go("readiness");
    };
  }};
});

/* ---- Relationship Readiness (multi-step) ---- */
let rdIndex = 0;
route("readiness", ()=>{
  if(!S.user) return go("signup");
  const dim = READINESS[rdIndex];
  const answers = S.readiness.answers[dim.id] || [];
  const total = READINESS.length;
  return {
  html:`
  <div class="topbar">
    <button class="back" data-act="back">←</button>
    <h2>Relationship Readiness</h2>
  </div>
  <div class="pad stack">
    <div class="steps">${READINESS.map((_,i)=>`<i class="${i<=rdIndex?"on":""}"></i>`).join("")}</div>
    <p class="tiny faint">Step ${rdIndex+1} of ${total} · Answer honestly — this is private and only for your growth.</p>

    <div class="card stack">
      <div class="row"><span style="font-size:26px">${dim.icon}</span><h3 class="grow">${dim.label}</h3></div>
      ${dim.questions.map((q,qi)=>`
        <div>
          <p style="font-weight:500">${q}</p>
          <div class="likert" data-q="${qi}">
            ${[1,2,3,4,5].map(n=>`<button data-n="${n}" class="${answers[qi]===n?"on":""}">${n}</button>`).join("")}
          </div>
          <div class="likert-legend"><span>Not yet</span><span>Very true</span></div>
        </div>`).join("")}
    </div>

    <button class="btn" id="next">${rdIndex===total-1 ? "See my Wellness Score" : "Next"}</button>
  </div>`,
  mount(root){
    $(".back",root).onclick = ()=>{
      if(rdIndex===0){ go("signup"); } else { rdIndex--; render(); }
    };
    $$(".likert",root).forEach(row=>{
      row.querySelectorAll("button").forEach(btn=> btn.onclick = ()=>{
        row.querySelectorAll("button").forEach(b=>b.classList.remove("on"));
        btn.classList.add("on");
      });
    });
    $("#next",root).onclick = ()=>{
      const picked = $$(".likert",root).map(row=>{
        const on = row.querySelector("button.on");
        return on ? +on.dataset.n : null;
      });
      if(picked.some(v=>v===null)){ toast("Please answer every statement"); return; }
      S.readiness.answers[dim.id] = picked;
      save();
      if(rdIndex < READINESS.length-1){ rdIndex++; render(); }
      else {
        computeReadiness();
        if(Backend.enabled()){
          Backend.saveReadiness(S.readiness.answers, S.readiness.scores, S.readiness.overall)
            .catch(e=> console.warn("[Backend] saveReadiness failed", e));
        }
        go("conduct");
      }
    };
  }};
});

function computeReadiness(){
  const scores = {};
  let sum = 0, n = 0;
  READINESS.forEach(dim=>{
    const a = S.readiness.answers[dim.id] || [];
    const pct = a.length ? Math.round((a.reduce((x,y)=>x+y,0) / (a.length*5)) * 100) : 0;
    scores[dim.id] = pct; sum += pct; n++;
  });
  S.readiness.scores = scores;
  S.readiness.overall = Math.round(sum / (n||1));
  S.readiness.done = true;
  save();
}

/* ---- Code of conduct ---- */
route("conduct", ()=>({
  html:`
  <div class="topbar"><h2>Community code of conduct</h2></div>
  <div class="pad stack">
    <div class="callout teal">🤝 A safe community depends on each of us. Please read and agree before you meet anyone.</div>
    <div class="card stack">
      ${CODE_OF_CONDUCT.map((c,i)=>`<label class="row" style="align-items:flex-start">
        <input type="checkbox" class="cc" data-i="${i}" style="margin-top:3px">
        <span style="font-size:14px">${c}</span></label>`).join("")}
    </div>
    <button class="btn" id="agree" disabled>I agree — continue</button>
  </div>`,
  mount(root){
    const boxes = $$(".cc",root), btn = $("#agree",root);
    const check = ()=> btn.disabled = !boxes.every(b=>b.checked);
    boxes.forEach(b=> b.onchange = check);
    btn.onclick = ()=>{
      S.conductAgreed = true; save();
      if(Backend.enabled()){
        Backend.saveConsent("v1", true, true).catch(e=> console.warn("[Backend] saveConsent failed", e));
      }
      go("result");
    };
  }
}));

/* ---- Readiness result ---- */
route("result", ()=>{
  if(!S.readiness.done) return go("readiness");
  const o = S.readiness.overall;
  const band = o>=80 ? ["You're in a strong, healthy place 🌟","teal"]
             : o>=60 ? ["A solid, ready foundation 🌱","teal"]
             : o>=40 ? ["Growing — a few areas to nurture 🌤️","gold"]
                     : ["Worth some more inner work first 💛","coral"];
  return {
  html:`
  <div class="pad stack center" style="padding-top:34px">
    <p class="tiny faint">YOUR RELATIONSHIP WELLNESS SCORE</p>
    <div class="ring" style="--p:${o}; margin:6px auto; position:relative">
      <div class="inner"><b>${o}</b></div>
    </div>
    <h2>${band[0]}</h2>
    <p class="muted" style="max-width:32ch;margin:0 auto">This score is private — for your growth, never for ranking. It updates as you learn and connect.</p>

    <div class="card" style="text-align:left;margin-top:8px">
      ${READINESS.map(d=>{
        const v = S.readiness.scores[d.id]||0;
        return `<div class="meter">
          <div class="row between"><span>${d.icon} ${d.label}</span><b class="tiny">${v}%</b></div>
          <div class="bar"><i style="width:${v}%"></i></div></div>`;
      }).join("")}
    </div>
    <div class="callout ${band[1]}" style="text-align:left">💡 Tip: your lowest area is a great place to start in the Learning Academy.</div>
    <button class="btn" id="done">Meet your matches</button>
  </div>`,
  mount(root){
    $("#done",root).onclick = ()=>{
      S.onboarded = true; save();
      if(Backend.enabled()){
        Backend.setOnboarded(true).catch(e=> console.warn("[Backend] setOnboarded failed", e));
      }
      seedInbound();
      go("home");
    };
  }};
});

/* ---- Home dashboard ---- */
route("home", ()=>{
  const u = S.user;
  const week = new Date().getDay();
  const prompt = WEEKLY_PROMPTS[week % WEEKLY_PROMPTS.length];
  // In Supabase mode this kicks off the fetch and re-renders when it lands, so
  // Home paints immediately rather than blocking on the network.
  const warm = ensureRemote();
  const topMatch = warm ? matchesList().filter(m => statusFor(m.c.id) !== "blocked")[0] : null;
  const inbound = warm ? inboundList().length : 0;
  return {
  html:`
  <div class="pad">
    <div class="row between" style="margin-bottom:4px">
      <div>
        <p class="tiny faint">Welcome back</p>
        <h1>${esc(u.name)} 🌿</h1>
      </div>
      ${avatar(u.name,u.color,"lg")}
    </div>

    <div class="callout teal" style="margin-top:8px">
      <span>💚</span><span>Wellness score <b>${S.readiness.overall}</b> · Stage 2 · <a href="#/profile">view growth</a></span>
    </div>

    ${inbound ? `<div class="callout coral" style="margin-top:10px">
      <span>💌</span><span><b>${inbound}</b> ${inbound>1?"people have":"person has"} expressed interest in connecting. <a href="#/matches">See who</a></span></div>`:""}

    <div class="sec-h"><h3>This week's reflection</h3></div>
    <div class="prompt-card">
      <div class="kicker">Weekly prompt</div>
      <div class="q">"${prompt}"</div>
      <button class="btn secondary sm" id="reflect" style="margin-top:14px;background:rgba(255,255,255,.16);color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.4)">Reflect on this →</button>
    </div>

    <div class="sec-h"><h3>Your top match</h3><a href="#/matches">See all</a></div>
    ${topMatch ? matchCardHTML(topMatch)
      : !warm ? `<div class="card center"><p class="tiny faint">Finding your matches…</p></div>`
      : `<div class="card center"><p class="tiny faint">No new matches right now — we release them thoughtfully.</p></div>`}

    <div class="sec-h"><h3>Keep growing</h3></div>
    ${(()=>{ const t=academyTotals(); const sub = t.done>0 ? `${t.done}/${t.total} lessons · ${t.pct}% complete` : "Courses on healthy love & communication"; return featureRow("learn","📚","Learning Academy",sub); })()}
    ${(()=>{ const m=moodToday(); const sub = m ? `Today: ${MOODS.find(x=>x.score===m.score)?.emoji} ${MOODS.find(x=>x.score===m.score)?.label} · tap to check in` : "Mood, gratitude, breathing & reflection"; return featureRow("wellness","🧘","Wellness Tools",sub); })()}
    ${(()=>{
      // don't block Home on the network; show the generic sub until it's warm
      const warmC = Backend.enabled() ? (remote.bookings !== null) : true;
      const up = warmC ? bookingsList()[0] : null;
      const cn = up ? (Backend.enabled() ? counsellorNamed(up.counsellor) : counsellorById(up.counsellor)) : null;
      const sub = up ? `Next: ${(cn&&cn.name?cn.name.split(' ').slice(-1)[0]:"session")} · ${fmtDate(new Date(up.date))}`
                     : "Book a session, ask, or join a group";
      return featureRow("counselling","🧑‍⚕️","Counsellor Support",sub);
    })()}
  </div>`,
  mount(root){
    $("#reflect",root).onclick = ()=> openReflection(WEEKLY_PROMPTS[new Date().getDay()%WEEKLY_PROMPTS.length]);
    wireMatchCards(root);
    wireFeatureRows(root);
  }};
});

function openReflection(prompt){
  const box = sheet(`
    <h3>Weekly reflection</h3>
    <p class="muted tiny" style="margin:6px 0 12px">"${esc(prompt)}"</p>
    <textarea class="input" id="rfx" placeholder="Write freely — just for you." style="min-height:120px"></textarea>
    <button class="btn" id="rsave" style="margin-top:12px">Save reflection</button>`);
  $("#rsave", box.el).onclick = ()=>{ box.close(); toast("Reflection saved to your journal ✓"); };
}

/* ---- Match card + list ---- */
function matchCardHTML(m){
  const c = m.c; const st = statusFor(c.id);
  const cta = st==="connected" ? `<span class="chip">Connected 💬</span>`
            : st==="you_sent"  ? `<span class="chip gold">Interest sent ⏳</span>`
            : st==="they_sent" ? `<span class="chip coral">Interested in you 💌</span>`
            : "";
  return `
  <div class="card match" data-match="${c.id}">
    ${m.pct==null?"":`<div class="score"><span class="n">${m.pct}%</span> match</div>`}
    <div class="top">
      ${avatar(c.name,c.color,"lg")}
      <div class="grow">
        <div class="row" style="gap:7px"><h3>${esc(c.name)}${c.age?`, ${c.age}`:""}</h3> ${c.verified?`<span class="verified">✓ Verified</span>`:""}</div>
        <p class="tiny faint">${esc(c.career||"")}${c.career&&c.county?" · ":""}${esc(c.county||"")}</p>
        <div style="margin-top:6px">${cta}</div>
      </div>
    </div>
    <div class="body">
      <div class="chips">${(c.values||[]).slice(0,3).map(v=>`<span class="chip">${esc(v)}</span>`).join("")}
        <span class="chip gold">${intentionLabel(c.intention)}</span></div>
      <div class="reasons stack" style="margin-top:12px">
        ${m.reasons.slice(0,3).map(r=>`<div class="reason"><span class="k">✓</span><span><b>${r.k}:</b> ${esc(r.v)}</span></div>`).join("")}
      </div>
      <button class="btn secondary sm" style="width:100%;margin-top:14px" data-open="${c.id}">View profile</button>
    </div>
  </div>`;
}
function wireMatchCards(root){
  $$("[data-open]",root).forEach(b=> b.onclick = e=>{ e.stopPropagation(); go("match", b.dataset.open); });
  $$("[data-match]",root).forEach(card=> card.onclick = ()=> go("match", card.dataset.match));
}

route("matches", ()=>{
  if(!ensureRemote()) return loadingScreen("Your matches");
  if(remote.err) return errorScreen("Your matches", remote.err);

  const inbound = inboundList();
  const inboundIds = new Set(inbound.map(m => m.c.id));
  // "a limited number of carefully selected matches" — and don't repeat the
  // people already shown under "Interested in you"
  const list = matchesList().filter(m => !inboundIds.has(m.c.id) && statusFor(m.c.id) !== "blocked").slice(0,4);
  return {
  html:`
  <div class="pad">
    <h1>Your matches</h1>
    <p class="muted tiny" style="margin-top:4px">A few carefully chosen people — not an endless feed. Curated on your values, goals and readiness.</p>

    ${inbound.length ? `<div class="sec-h"><h3>Interested in you</h3></div>
      ${inbound.map(matchCardHTML).join("")}` : ""}

    <div class="sec-h"><h3>Selected for you</h3></div>
    ${list.length ? list.map(matchCardHTML).join("")
      : `<div class="empty"><div class="ico">💞</div><p>No new matches right now.<br>We release them thoughtfully — check back soon.</p></div>`}

    <div class="callout gold" style="margin-top:16px">🔄 New matches are released thoughtfully. Take your time with these first.</div>
  </div>`,
  mount(root){ wireMatchCards(root); }};
});

/* ---- Match detail ---- */
route("match", (id)=>{
  if(!ensureRemote()) return loadingScreen("Profile");
  if(remote.err) return errorScreen("Profile", remote.err);

  const c = cardFor(id);
  if(!c) return Backend.enabled() ? loadingScreen("Profile") : go("matches");

  // score: server's in Supabase mode, computed locally otherwise
  const cached = (remote.matches || []).find(x => x.c.id === id);
  const m = Backend.enabled()
    ? { c, pct: cached ? cached.pct : null, reasons: matchReasons(S.user, c) }
    : { c, ...scoreMatch(S.user, c) };
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Profile</h2>
    <button class="back" data-act="more">⋯</button></div>
  <div class="pad stack center">
    ${avatar(c.name,c.color,"xl")}
    <div>
      <div class="row" style="justify-content:center;gap:8px"><h2>${esc(c.name)}${c.age?`, ${c.age}`:""}</h2>${c.verified?`<span class="verified">✓ Verified</span>`:""}</div>
      <p class="muted tiny">${esc(c.career||"")}${c.career&&c.county?" · ":""}${esc(c.county||"")}</p>
    </div>
    ${m.pct==null?"":`<div class="chip" style="background:var(--teal-700);color:#fff">${m.pct}% compatibility</div>`}

    ${c.bio?`<div class="card" style="text-align:left">
      <p style="font-style:italic">"${esc(c.bio)}"</p>
    </div>`:""}

    <div class="card" style="text-align:left">
      <div class="kv"><span class="k">Intention</span><span>${intentionLabel(c.intention)}</span></div>
      <div class="kv"><span class="k">Faith</span><span>${esc(c.faith||"—")}</span></div>
      <div class="kv"><span class="k">Education</span><span>${esc(c.education||"—")}</span></div>
      <div class="kv"><span class="k">Family goals</span><span>${esc(c.familyGoal||"—")}</span></div>
    </div>

    <div class="card" style="text-align:left">
      <p class="tiny faint" style="margin-bottom:8px">VALUES</p>
      <div class="chips">${(c.values||[]).map(v=>`<span class="chip ${(S.user.values||[]).includes(v)?"":"select"}">${esc(v)}</span>`).join("")}</div>
    </div>

    ${m.reasons.length?`<div class="card" style="text-align:left">
      <p class="tiny faint" style="margin-bottom:8px">WHY YOU MATCH</p>
      <div class="stack">${m.reasons.map(r=>`<div class="reason"><span class="k">✓</span><span><b>${r.k}:</b> ${esc(r.v)}</span></div>`).join("")}</div>
    </div>`:""}

    <div style="width:100%">${connectCTA(id)}</div>
    <p class="tiny faint">Messaging opens only when you both agree to connect.</p>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("matches");
    $("[data-act=more]",root).onclick = ()=> openSafetySheet(id);
    wireConnectCTA(root, id);
  }};
});

function connectCTA(id){
  const st = statusFor(id);
  if(st==="connected") return `<button class="btn" data-cta="chat">💬 Open conversation</button>`;
  if(st==="you_sent")  return `<button class="btn" disabled>Interest sent — awaiting reply ⏳</button>`;
  if(st==="they_sent") return `<button class="btn coral" data-cta="accept">💌 Accept & connect</button>`;
  if(st==="blocked")   return `<button class="btn danger" data-cta="unblock">Unblock</button>`;
  return `<button class="btn" data-cta="express">💚 Express interest</button>`;
}
function wireConnectCTA(root, id){
  const btn = $("[data-cta]",root); if(!btn) return;
  const act = btn.dataset.cta;
  const name = (cardFor(id) || {}).name || "them";

  /* ---- Supabase mode: consent is enforced server-side ---- */
  if(Backend.enabled()){
    btn.onclick = async ()=>{
      if(act==="chat"){ go("chat", id); return; }
      btn.disabled = true;
      try{
        if(act==="express"){
          const r = await Backend.expressInterest(id);
          resetRemote();
          if(r==="connected"){ toast(`You're connected with ${name}!`); go("chat", id); return; }
          if(r==="blocked"){ toast("You can't connect with this person."); }
          else toast(`Interest sent to ${name}`);
          render();
        }
        if(act==="accept"){
          const iid = relInterestId(id);
          if(!iid){ toast("That request is no longer available"); resetRemote(); render(); return; }
          const r = await Backend.respondInterest(iid, true);
          resetRemote();
          if(r==="connected"){ toast(`You're connected with ${name}!`); go("chat", id); }
          else { toast("Couldn't accept — please try again"); render(); }
        }
        if(act==="unblock"){
          await Backend.unblockUser(id); resetRemote(); toast("Unblocked"); render();
        }
      }catch(e){
        toast(e.message || "Something went wrong"); btn.disabled = false;
      }
    };
    return;
  }

  /* ---- Local demo mode: simulate the other side ---- */
  btn.onclick = ()=>{
    const c = conn(id);
    if(act==="chat"){ go("chat", id); return; }
    if(act==="express"){
      c.status = "you_sent"; save(); toast(`Interest sent to ${name}`);
      // simulate mutual consent shortly after
      setTimeout(()=>{
        if(conn(id).status==="you_sent"){
          conn(id).status = "connected";
          conn(id).messages.push({from:"them", text:`Hi ${S.user.name}, thank you for reaching out 😊 I'd love to get to know you.`, ts:Date.now()});
          conn(id).unread = 1; save(); updateBadge();
          toast(`${candidate(id).name} accepted — you're connected!`);
          if(parseHash().param===id) render();
        }
      }, 2600);
      render();
    }
    if(act==="accept"){
      c.status = "connected";
      c.messages.push({from:"them", text:`Hi ${S.user.name}, I'm really glad we connected. How has your week been?`, ts:Date.now()});
      c.unread = 1; save(); updateBadge();
      toast(`You're connected with ${candidate(id).name}!`); go("chat", id);
    }
    if(act==="unblock"){ c.status="none"; save(); render(); toast("Unblocked"); }
  };
}

function openSafetySheet(id){
  const c = cardFor(id) || { name:"this member" };
  const box = sheet(`
    <h3>Safety & privacy</h3>
    <p class="muted tiny" style="margin:6px 0 14px">You're always in control of who you connect with.</p>
    <button class="btn secondary" id="report" style="margin-bottom:10px">🚩 Report ${esc(c.name)}</button>
    <button class="btn danger" id="block">🚫 Block ${esc(c.name)}</button>
    <button class="btn ghost" id="cancel" style="margin-top:6px">Cancel</button>`);
  $("#cancel",box.el).onclick = box.close;
  $("#report",box.el).onclick = ()=>{ box.close(); openReport(id); };
  $("#block",box.el).onclick = async ()=>{
    if(Backend.enabled()){
      try{ await Backend.blockUser(id); resetRemote(); }
      catch(e){ toast(e.message || "Could not block"); return; }
    } else {
      conn(id).status = "blocked"; save();
    }
    box.close();
    toast(`${c.name} blocked`); updateBadge();
    if(parseHash().name==="chat") go("messages"); else render();
  };
}
function openReport(id){
  const c = cardFor(id) || { name:"this member" };
  const reasons = ["Disrespectful or abusive language","Made me feel unsafe","Fake or misleading profile","Pushing for something I didn't consent to","Other concern"];
  const box = sheet(`
    <h3>Report ${esc(c.name)}</h3>
    <p class="muted tiny" style="margin:6px 0 12px">Reports are confidential and reviewed by our counselling team. AI moderation flags abusive language automatically.</p>
    <div class="stack">${reasons.map((r,i)=>`<label class="row"><input type="radio" name="rr" value="${i}"> <span class="tiny">${esc(r)}</span></label>`).join("")}</div>
    <button class="btn coral" id="send" style="margin-top:14px">Submit report</button>`);
  $("#send",box.el).onclick = async ()=>{
    const picked = $('input[name=rr]:checked',box.el);
    if(!picked){ toast("Please choose a reason"); return; }
    const btn = $("#send",box.el); btn.disabled = true;
    if(Backend.enabled()){
      try{
        await Backend.reportUser(id, reasons[+picked.value], { from:"profile" });
      }catch(e){ toast(e.message || "Could not submit report"); btn.disabled = false; return; }
    }
    box.close(); toast("Report submitted — thank you. Our team will review it.");
  };
}

/* ---- Messages list ---- */
route("messages", ()=>{
  if(!ensureRemote()) return loadingScreen("Messages");
  if(remote.err) return errorScreen("Messages", remote.err);
  const items = threadList();
  return {
  html:`
  <div class="pad">
    <h1>Messages</h1>
    <p class="muted tiny" style="margin-top:4px">No anonymous messaging. Conversations open only after mutual consent.</p>
    ${items.length ? `<div style="margin-top:14px">${items.map(x=>{
        const last = x.c.messages[x.c.messages.length-1];
        if(x.c.status==="they_sent"){
          return `<div class="thread-item" data-req="${x.id}">
            ${avatar(x.cand.name,x.cand.color,"sm")}
            <div class="grow"><div class="row between"><b>${esc(x.cand.name)}</b><span class="chip coral tiny">Wants to connect</span></div>
              <div class="last">💌 Expressed interest — tap to respond</div></div></div>`;
        }
        return `<div class="thread-item" data-chat="${x.id}">
          ${avatar(x.cand.name,x.cand.color,"sm")}
          <div class="grow"><div class="row between"><b>${esc(x.cand.name)}</b>${x.c.unread?`<span class="dot-new"></span>`:""}</div>
            <div class="last">${last?esc(last.text):"Say hello 👋"}</div></div></div>`;
      }).join("")}</div>`
    : `<div class="empty"><div class="ico">💬</div><p>No conversations yet.<br>When you and a match both express interest, your chat opens here.</p>
       <button class="btn sm" data-nav="matches" style="margin-top:14px">Browse matches</button></div>`}
  </div>`,
  mount(root){
    $$("[data-chat]",root).forEach(el=> el.onclick = ()=> go("chat", el.dataset.chat));
    $$("[data-req]",root).forEach(el=> el.onclick = ()=> go("match", el.dataset.req));
  }};
});

/* ---- Chat ---- */
const REPLIES = [
  "That really resonates with me. Thank you for sharing it.",
  "I appreciate how thoughtfully you put that. Tell me more?",
  "Ha, I love that. We might get along better than the algorithm guessed 😊",
  "That's something I've been working on too, honestly.",
  "I'd like that. Maybe we could talk about it more over coffee sometime?",
  "You have a calm way of saying things. It's nice.",
];
let chatUnsub = null;   // active realtime subscription, if any
route("chat", (id)=>{
  if(!ensureRemote()) return loadingScreen("Chat");
  if(remote.err) return errorScreen("Chat", remote.err);

  const c = cardFor(id);
  if(!c) return go("messages");
  if(statusFor(id) !== "connected") return go("match", id);
  if(!ensureMessages(id)) return loadingScreen(c.name);

  const msgs = Backend.enabled() ? (remote.msgs[id] || []) : conn(id).messages;
  if(!Backend.enabled()){ conn(id).unread = 0; save(); updateBadge(); }

  return {
  html:`
  <div class="chat" style="height:100%">
    <div class="topbar" style="padding-bottom:12px;border-bottom:1px solid var(--line)">
      <button class="back" data-act="back">←</button>
      ${avatar(c.name,c.color,"sm")}
      <div class="grow"><b>${esc(c.name)}</b><div class="tiny faint">${c.verified?"✓ Verified member":""}</div></div>
      <button class="back" data-act="more">⋯</button>
    </div>
    <div class="chat-scroll" id="scroll">
      <div class="chat-note">🔒 You both agreed to connect. Be kind — messages are moderated for safety.</div>
      ${msgs.map(bubbleHTML).join("")}
    </div>
    <div class="composer">
      <input class="input" id="msg" placeholder="Write a message…" autocomplete="off">
      <button class="send" id="send">➤</button>
    </div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("messages");
    $("[data-act=more]",root).onclick = ()=> openSafetySheet(id);
    const scroll = $("#scroll",root), input = $("#msg",root);
    const toBottom = ()=> scroll.scrollTop = scroll.scrollHeight;
    toBottom();

    /* ---- Supabase mode: real send + realtime delivery ---- */
    if(Backend.enabled()){
      const convId = relConversation(id);

      // tear down any previous subscription, then listen for the other side
      if(chatUnsub){ try{ chatUnsub(); }catch(e){} chatUnsub = null; }
      if(convId){
        chatUnsub = Backend.subscribeMessages(convId, row =>{
          if(row.sender === remote.rel.me) return;              // our own echo
          const list = remote.msgs[id] || (remote.msgs[id] = []);
          if(list.some(m => m.id === row.id)) return;
          const m = { id:row.id, from:"them", text:row.body, ts:new Date(row.created_at).getTime() };
          list.push(m);
          if(parseHash().name === "chat" && parseHash().param === id){
            scroll.insertAdjacentHTML("beforeend", bubbleHTML(m));
            toBottom();
          } else { updateBadge(); }
        });
      }

      const send = async ()=>{
        const text = input.value.trim(); if(!text || !convId) return;
        input.value = "";
        try{
          const res = await Backend.sendMessage(convId, text);
          const m = { id:res && res.id, from:"me", text, ts:Date.now() };
          (remote.msgs[id] || (remote.msgs[id] = [])).push(m);
          scroll.insertAdjacentHTML("beforeend", bubbleHTML(m));
          toBottom();
          // the server moderates — tell the sender when it holds something back
          if(res && res.moderation_status === "flagged"){
            toast("⚠️ That message was flagged by moderation and is under review.");
          }
        }catch(e){
          input.value = text;   // don't lose what they typed
          toast(/blocked/i.test(e.message||"") ? "You can't message this person." : (e.message || "Message not sent"));
        }
      };
      $("#send",root).onclick = send;
      input.addEventListener("keydown", e=>{ if(e.key==="Enter") send(); });
      return;
    }

    /* ---- Local demo mode: simulated replies ---- */
    const cn = conn(id);
    const send = ()=>{
      const text = input.value.trim(); if(!text) return;
      // lightweight AI-moderation demo
      if(/\b(stupid|idiot|hate you|shut up)\b/i.test(text)){
        toast("⚠️ That message may breach our respect policy. Please rephrase.");
        return;
      }
      cn.messages.push({from:"me", text, ts:Date.now()});
      input.value=""; save();
      scroll.insertAdjacentHTML("beforeend", bubbleHTML(cn.messages[cn.messages.length-1]));
      toBottom();
      setTimeout(()=>{
        const reply = REPLIES[cn.messages.length % REPLIES.length];
        cn.messages.push({from:"them", text:reply, ts:Date.now()}); save();
        scroll.insertAdjacentHTML("beforeend", bubbleHTML(cn.messages[cn.messages.length-1]));
        toBottom();
      }, 1100);
    };
    $("#send",root).onclick = send;
    input.addEventListener("keydown", e=>{ if(e.key==="Enter") send(); });
  }};
});
function bubbleHTML(m){
  const t = new Date(m.ts).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  return `<div class="bubble ${m.from==="me"?"me":"them"}">${esc(m.text)}<div class="t">${t}</div></div>`;
}

/* ---- Learn / Academy ---- */
route("learn", ()=>{
  const t = academyTotals();
  // "Continue learning": a course that's started but unfinished, else the Start-here course
  const inProgress = COURSES.find(c=>{ const p=courseProgress(c); return p.done>0 && p.done<p.total; });
  const resume = inProgress || COURSES[0];
  const rp = courseProgress(resume);
  return {
  html:`
  <div class="pad">
    <h1>Learning Academy</h1>
    <p class="muted tiny" style="margin-top:4px">Grow the skills healthy relationships are built on.</p>

    <div class="card" style="margin-top:14px">
      <div class="row between"><b>Your progress</b><span class="chip">${t.done}/${t.total} lessons</span></div>
      <div class="bar" style="margin-top:10px"><i style="width:${t.pct}%"></i></div>
    </div>

    <div class="sec-h"><h3>${rp.done>0 ? "Continue learning" : "Start here"}</h3></div>
    <div class="prompt-card" data-course="${resume.id}" style="cursor:pointer">
      <div class="kicker">${resume.icon} ${rp.done>0 ? `${rp.done}/${rp.total} complete` : (resume.tag||"New course")}</div>
      <div class="q">${esc(nextLessonOf(resume).title)}</div>
      <p class="tiny" style="opacity:.9;margin-top:6px">${esc(resume.title)}</p>
      <button class="btn secondary sm" style="margin-top:14px;background:rgba(255,255,255,.16);color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.4)">${rp.done>0 ? "Resume →" : "Begin →"}</button>
    </div>

    <div class="sec-h"><h3>All courses</h3></div>
    ${COURSES.map(c=>{
      const p = courseProgress(c);
      const badge = p.pct===100 ? `<span class="chip">✓ Done</span>`
                  : p.done>0    ? `<span class="chip gold">${p.done}/${p.total}</span>`
                  : c.tag       ? `<span class="chip coral" style="background:var(--coral-50)">${c.tag}</span>` : "";
      return `
      <div class="list-row" data-course="${c.id}">
        <div class="lico">${c.icon}</div>
        <div class="grow"><div class="row between" style="gap:8px"><b>${esc(c.title)}</b>${badge}</div>
          <div class="sub">${c.lessons.length} lessons · ${p.pct}% complete</div>
          <div class="bar" style="height:5px;margin-top:7px"><i style="width:${p.pct}%"></i></div>
        </div>
      </div>`;
    }).join("")}
  </div>`,
  mount(root){
    $$("[data-course]",root).forEach(el=> el.onclick = ()=> go("course", el.dataset.course));
  }};
});

/* ---- Course detail ---- */
route("course", (id)=>{
  const c = courseById(id); if(!c) return go("learn");
  const p = courseProgress(c);
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Course</h2></div>
  <div class="pad stack">
    <div class="row" style="gap:14px">
      <div class="lico" style="width:58px;height:58px;font-size:30px;border-radius:16px">${c.icon}</div>
      <div class="grow"><h2>${esc(c.title)}</h2>${c.tag?`<span class="chip coral tiny" style="margin-top:4px;display:inline-block">${c.tag}</span>`:""}</div>
    </div>
    <p class="muted">${esc(c.blurb)}</p>
    <div class="card flat">
      <div class="row between"><span class="tiny faint">PROGRESS</span><b class="tiny">${p.done}/${p.total} · ${p.pct}%</b></div>
      <div class="bar" style="margin-top:8px"><i style="width:${p.pct}%"></i></div>
    </div>

    <div class="sec-h" style="margin-top:8px"><h3>Lessons</h3></div>
    ${c.lessons.map((l,i)=>{
      const done = lessonDone(l.id);
      return `<div class="list-row" data-lesson="${l.id}">
        <div class="lico" style="background:${done?'var(--teal-700)':'var(--teal-50)'};color:${done?'#fff':'var(--teal-700)'};font-weight:800">${done?'✓':i+1}</div>
        <div class="grow"><b>${esc(l.title)}</b><div class="sub">${l.minutes} min read${done?' · completed':''}</div></div>
        <div class="chev">›</div>
      </div>`;
    }).join("")}

    <button class="btn" id="startc" style="margin-top:16px">${p.done>0 ? (p.pct===100?"Review from start":"Continue course") : "Start course"}</button>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("learn");
    $$("[data-lesson]",root).forEach(el=> el.onclick = ()=> go("lesson", `${c.id}~${el.dataset.lesson}`));
    $("#startc",root).onclick = ()=>{
      const target = p.pct===100 ? c.lessons[0] : nextLessonOf(c);
      go("lesson", `${c.id}~${target.id}`);
    };
  }};
});

/* ---- Lesson reader ---- */
route("lesson", (param="")=>{
  const [courseId, lessonId] = param.split("~");
  const ref = lessonRef(courseId, lessonId);
  if(!ref) return go("learn");
  const { course, lesson, idx, next } = ref;
  const done = lessonDone(lesson.id);
  return {
  html:`
  <div class="topbar">
    <button class="back" data-act="back">←</button>
    <div class="grow"><div class="tiny faint">${esc(course.title)} · ${idx+1}/${course.lessons.length}</div></div>
  </div>
  <div class="pad stack">
    <div class="steps">${course.lessons.map((_,i)=>`<i class="${i<=idx?'on':''}"></i>`).join("")}</div>
    <h1 style="margin-top:6px">${esc(lesson.title)}</h1>
    <p class="tiny faint">${lesson.minutes} min read</p>
    <p style="font-size:16px;color:var(--ink-soft)">${esc(lesson.intro)}</p>

    ${lesson.sections.map(s=>`
      <div class="card">
        ${s.h?`<h3 style="margin-bottom:8px">${esc(s.h)}</h3>`:""}
        ${(s.p||[]).map(par=>`<p style="margin-bottom:10px">${esc(par)}</p>`).join("")}
        ${s.list?`<ul style="margin:4px 0 0;padding-left:20px">${s.list.map(li=>`<li style="margin-bottom:7px">${esc(li)}</li>`).join("")}</ul>`:""}
      </div>`).join("")}

    <div class="card" style="background:var(--teal-50)">
      <p class="tiny faint" style="margin-bottom:8px;color:var(--teal-900)">KEY TAKEAWAYS</p>
      <div class="stack">${lesson.takeaways.map(t=>`<div class="reason"><span class="k">✓</span><span>${esc(t)}</span></div>`).join("")}</div>
    </div>

    ${lesson.reflect?`<div class="prompt-card">
      <div class="kicker">Reflect</div>
      <div class="q" style="font-size:17px">${esc(lesson.reflect)}</div>
      <textarea class="input" id="rfx" placeholder="Write freely — just for you." style="margin-top:12px;min-height:80px;background:rgba(255,255,255,.92)"></textarea>
    </div>`:""}

    <button class="btn" id="complete">${done ? (next?"Next lesson →":"Back to course") : (next?"Mark complete & continue →":"Mark complete ✓")}</button>
    ${done?`<p class="center tiny faint">✓ You completed this lesson</p>`:""}
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("course", course.id);
    $("#complete",root).onclick = ()=>{
      const wasDone = lessonDone(lesson.id);
      if(!wasDone){ markLesson(lesson.id); updateBadge(); }
      const cp = courseProgress(course);
      if(next){ go("lesson", `${course.id}~${next.id}`); }
      else {
        if(!wasDone && cp.pct===100) toast(`🎉 Course complete: ${course.title}`);
        else if(!wasDone) toast("Lesson completed ✓");
        go("course", course.id);
      }
    };
  }};
});

/* ---- Profile / You ---- */
route("profile", ()=>{
  const u = S.user, r = S.readiness;
  return {
  html:`
  <div class="pad">
    <div class="center stack" style="padding-top:8px">
      ${avatar(u.name,u.color,"xl")}
      <div><div class="row" style="justify-content:center;gap:8px"><h2>${esc(u.name)}, ${u.age}</h2><span class="verified">✓ Verified</span></div>
        <p class="muted tiny">${esc(u.career||"")} · ${esc(u.county)}</p></div>
    </div>

    <div class="sec-h"><h3>Relationship wellness</h3></div>
    <div class="card">
      <div class="ring-wrap">
        <div class="ring" style="--p:${r.overall}; position:relative"><div class="inner"><b>${r.overall}</b></div></div>
        <div class="grow">
          <b>Your growth score</b>
          <p class="tiny muted">Private to you. It reflects your readiness across six areas and grows as you learn.</p>
        </div>
      </div>
      <div class="divider"></div>
      ${READINESS.map(d=>{const v=r.scores[d.id]||0; return `<div class="meter">
        <div class="row between"><span class="tiny">${d.icon} ${d.label}</span><b class="tiny">${v}%</b></div>
        <div class="bar"><i style="width:${v}%"></i></div></div>`;}).join("")}
    </div>

    <div class="sec-h"><h3>Your journey</h3></div>
    ${(()=>{ const c=cpl(); const sub = c.active ? `With ${esc(candidate(c.partnerId)?.name||"partner")} · ${daysTogether()} days` : "Unlocks when you both commit"; return featureRow("couple","💑","Couple Space",sub); })()}
    ${(()=>{ const p=marriageProgress(); const sub = p.done>0 ? `${p.done}/${p.total} conversations · ${p.pct}%` : "Stage 4 pathway"; return featureRow("marriage","💍","Marriage Preparation",sub); })()}
    ${(()=>{ const n=community().joined.length; const sub = n?`${n} group${n>1?"s":""} joined`:"Moderated groups by life stage"; return featureRow("community","🌍","Community Groups",sub); })()}
    ${(()=>{ const n=eventsState().rsvp.length; const sub = n?`${n} event${n>1?"s":""} · you're going`:"Mixers, seminars & retreats"; return featureRow("events","📅","Events",sub); })()}
    ${featureRow("counselling","🧑‍⚕️","Counsellor Support","Sessions, webinars & support groups")}
    ${featureRow("wellness","🧘","Wellness Tools","Mood, gratitude & reflection")}
    ${(()=>{ const pl=PREMIUM_PLANS.find(p=>p.id===currentPlan()); const sub = currentPlan()!=="free"?`${pl.name} plan · active`:"Unlimited counselling & coaching"; return featureRow("premium","⭐","Premium",sub); })()}

    <div class="sec-h"><h3>Account</h3></div>
    <div class="list-row" data-act="edit"><div class="lico">✏️</div><div class="grow"><b>Edit profile & preferences</b></div><div class="chev">›</div></div>
    ${Backend.enabled()?`<div class="list-row" data-act="signout" style="margin-top:10px"><div class="lico">🚪</div><div class="grow"><b>Sign out</b><div class="sub">End your session on this device</div></div><div class="chev">›</div></div>`:""}
    <div class="list-row" data-act="reset" style="margin-top:10px"><div class="lico">🔄</div><div class="grow"><b>Reset demo</b><div class="sub">Clear all data and start over</div></div><div class="chev">›</div></div>
    <p class="center tiny faint" style="margin-top:20px">Heart2Heart Kenya · Healing first. Healthy relationships next.</p>
  </div>`,
  mount(root){
    wireFeatureRows(root);
    $("[data-act=edit]",root).onclick = ()=> go("signup");
    const so = $("[data-act=signout]",root); if(so) so.onclick = async ()=>{
      try{ await Backend.signOut(); }catch(e){}
      rdIndex=0; reset(); toast("Signed out");
    };
    $("[data-act=reset]",root).onclick = ()=>{
      const box = sheet(`<h3>Reset demo?</h3><p class="muted tiny" style="margin:8px 0 14px">This clears your profile, matches and messages on this device.</p>
        <button class="btn danger" id="yes">Yes, reset everything</button><button class="btn ghost" id="no" style="margin-top:6px">Cancel</button>`);
      $("#no",box.el).onclick = box.close;
      $("#yes",box.el).onclick = ()=>{ box.close(); rdIndex=0; reset(); };
    };
  }};
});

/* ---- Feature placeholders ---- */
/* ============================ Wellness Tools ============================ */

/* ---- Wellness hub ---- */
route("wellness", ()=>{
  const m = moodToday();
  const aff = AFFIRMATIONS[dailyIndex(AFFIRMATIONS.length)];
  const prompt = REFLECT_PROMPTS[dailyIndex(REFLECT_PROMPTS.length)];
  const trend = moodTrend(7);
  const streak = moodStreak();
  const grat = well().gratitude;
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Wellness Tools</h2></div>
  <div class="pad">
    <p class="muted tiny">Small daily practices for a steady, healthy heart. Everything here is private to you.</p>

    <div class="card" style="margin-top:14px">
      <div class="row between"><b>How is your heart today?</b>${streak>0?`<span class="chip">🔥 ${streak}-day streak</span>`:""}</div>
      <div class="mood-row" id="moodrow">
        ${MOODS.map(mo=>`<button class="mood-btn ${m&&m.score===mo.score?"on":""}" data-score="${mo.score}">
          <span class="e">${mo.emoji}</span><span class="l">${mo.label}</span></button>`).join("")}
      </div>
      ${m?`<textarea class="input" id="moodnote" placeholder="Add a note about today (optional)" style="margin-top:12px;min-height:56px">${esc(m.note||"")}</textarea>`:""}
    </div>

    <div class="sec-h"><h3>Your week</h3><span class="tiny faint">mood trend</span></div>
    <div class="card">
      <div class="trend">
        ${trend.map(t=>{
          const h = t.mood ? 20 + t.mood.score*15 : 6;
          return `<div class="col"><div class="stalk ${t.mood?"":"empty"}" style="height:${h}%"></div><div class="day">${t.day}</div></div>`;
        }).join("")}
      </div>
      ${well().moods.length===0?`<p class="tiny faint center" style="margin-top:8px">Log your mood daily to see your trend grow.</p>`:""}
    </div>

    <div class="sec-h"><h3>Tools</h3></div>
    <div class="tool-grid">
      <button class="tool-card" data-go2="breathing"><div class="tico">🌬️</div><b>Guided breathing</b><div class="sub">Calm in a few breaths</div></button>
      <button class="tool-card" data-go2="gratitude"><div class="tico">🙏</div><b>Gratitude journal</b><div class="sub">${grat.length?grat.length+" entries":"Start today"}</div></button>
      <button class="tool-card" data-go2="checkin"><div class="tico">📝</div><b>Wellness check-in</b><div class="sub">A gentle self-review</div></button>
      <button class="tool-card" id="prayercard"><div class="tico">${prompt.type==="Prayer"?"✨":"🧘"}</div><b>${prompt.type} prompt</b><div class="sub">Tap for a new one</div></button>
    </div>

    <div class="sec-h"><h3>Today's affirmation</h3></div>
    <div class="affirm">
      <div class="txt" id="afftext">"${esc(aff)}"</div>
      <div class="acts">
        <button class="ib" id="afffav" title="Save">🤍</button>
        <button class="ib" id="affnext" title="Another">🔄</button>
      </div>
    </div>

    <div class="sec-h"><h3>${prompt.type} & meditation</h3></div>
    <div class="card" id="promptcard">
      <div class="row" style="gap:10px;align-items:flex-start">
        <span style="font-size:22px">${prompt.type==="Prayer"?"✨":"🧘"}</span>
        <div><span class="chip tiny" style="margin-bottom:6px;display:inline-block">${prompt.type}</span>
          <p id="prompttext">${esc(prompt.text)}</p></div>
      </div>
    </div>

    ${grat.length?`<div class="sec-h"><h3>Recent gratitude</h3><a href="#/gratitude">See all</a></div>
      ${grat.slice(0,2).map(g=>`<div class="entry"><div class="meta">${relTime(g.ts)}</div>${esc(g.text)}</div>`).join("")}`:""}
    <div style="height:8px"></div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("home");
    $$("[data-go2]",root).forEach(b=> b.onclick = ()=> go(b.dataset.go2));

    // mood logging
    $$("#moodrow .mood-btn",root).forEach(b=> b.onclick = ()=>{
      logMood(+b.dataset.score);
      toast("Mood logged 💚");
      render();  // refresh trend, streak, note field
    });
    const note = $("#moodnote",root);
    if(note) note.onchange = ()=>{ const cur = moodToday(); if(cur){ logMood(cur.score, note.value); toast("Note saved"); } };

    // affirmation
    let affIdx = dailyIndex(AFFIRMATIONS.length);
    const fav = $("#afffav",root);
    const syncFav = ()=> fav.textContent = well().affFav.includes(affIdx) ? "💚" : "🤍";
    syncFav();
    $("#affnext",root).onclick = ()=>{ affIdx = (affIdx+1)%AFFIRMATIONS.length; $("#afftext",root).textContent = `"${AFFIRMATIONS[affIdx]}"`; syncFav(); };
    fav.onclick = ()=>{ const f = well().affFav; const i = f.indexOf(affIdx);
      if(i>=0) f.splice(i,1); else f.push(affIdx); save(); syncFav(); toast(i>=0?"Removed":"Saved to favourites 💚"); };

    // rotating reflection prompt
    let pIdx = dailyIndex(REFLECT_PROMPTS.length);
    const nextPrompt = ()=>{ pIdx=(pIdx+1)%REFLECT_PROMPTS.length; const p=REFLECT_PROMPTS[pIdx]; $("#prompttext",root).textContent = p.text; };
    $("#prayercard",root).onclick = nextPrompt;
  }};
});

/* ---- Guided breathing (animated) ---- */
let breathPattern = "box";
route("breathing", ()=>{
  const pat = BREATH_PATTERNS.find(p=>p.id===breathPattern) || BREATH_PATTERNS[0];
  return {
  html:`
  <div class="breathe-stage">
    <div class="row between" style="width:100%">
      <button class="back" data-act="back" style="color:#fff">←</button>
      <b>${pat.name}</b>
      <span style="width:34px"></span>
    </div>

    <div class="breathe-orb-wrap">
      <div style="position:relative;display:grid;place-items:center">
        <div class="ring2"></div>
        <div class="breathe-orb" id="orb"></div>
      </div>
      <div>
        <div class="breathe-phase" id="phase">Ready?</div>
        <div class="breathe-count" id="count">Follow the circle. In through the nose, out through the mouth.</div>
      </div>
    </div>

    <div style="width:100%">
      <div class="breathe-pattern-pick" id="picker">
        ${BREATH_PATTERNS.map(p=>`<button class="p ${p.id===breathPattern?"on":""}" data-pat="${p.id}"><b>${p.name}</b><br><span>${p.hint}</span></button>`).join("")}
      </div>
      <button class="btn secondary" id="toggle" style="margin-top:14px;background:rgba(255,255,255,.16);color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.5)">Begin</button>
    </div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("wellness");
    const orb = $("#orb",root), phaseEl = $("#phase",root), countEl = $("#count",root), toggle = $("#toggle",root);
    let running = false, timers = [], cycles = 0;

    const clearTimers = ()=>{ timers.forEach(clearTimeout); timers = []; };
    const stop = (msg)=>{
      running = false; clearTimers();
      orb.style.transition = "transform .8s ease"; orb.style.transform = "scale(.62)";
      phaseEl.textContent = msg || "Paused";
      toggle.textContent = "Begin";
    };
    const runPhase = (i)=>{
      if(!running) return;
      const pat = BREATH_PATTERNS.find(p=>p.id===breathPattern);
      const [label, secs] = pat.phases[i];
      phaseEl.textContent = label;
      countEl.textContent = `Cycle ${cycles+1}`;
      // scale target: in -> big, out -> small, hold -> keep
      const big = 1.0, small = .62;
      let target = orb.style.transform;
      if(/in/i.test(label)) target = `scale(${big})`;
      else if(/out/i.test(label)) target = `scale(${small})`;
      orb.style.transition = `transform ${secs}s ease-in-out`;
      orb.style.transform = target;
      timers.push(setTimeout(()=>{
        let ni = i+1;
        if(ni >= pat.phases.length){ ni = 0; cycles++; }
        runPhase(ni);
      }, secs*1000));
    };
    const start = ()=>{
      running = true; cycles = 0; toggle.textContent = "Stop";
      runPhase(0);
    };
    toggle.onclick = ()=>{ running ? stop("Well done 🌿") : start(); };
    $$("#picker .p",root).forEach(b=> b.onclick = ()=>{
      breathPattern = b.dataset.pat;
      stop(); render();  // re-render to reflect selected pattern
    });
  }};
});

/* ---- Gratitude journal ---- */
route("gratitude", ()=>{
  const g = well().gratitude;
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Gratitude journal</h2></div>
  <div class="pad">
    <div class="card">
      <label class="field"><span>What are you grateful for today?</span>
        <textarea class="input" id="gtext" placeholder="However small — a kind word, a good cup of chai, a moment of peace." style="min-height:74px"></textarea></label>
      <button class="btn" id="gadd" style="margin-top:12px">Add to journal</button>
    </div>
    <div class="sec-h"><h3>${g.length?`${g.length} ${g.length===1?"entry":"entries"}`:"Your entries"}</h3></div>
    <div id="glist">
      ${g.length ? g.map(e=>`<div class="entry"><div class="meta">${relTime(e.ts)}</div>${esc(e.text)}</div>`).join("")
        : `<div class="empty"><div class="ico">🙏</div><p>No entries yet.<br>Gratitude, practised daily, rewires how we see.</p></div>`}
    </div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("wellness");
    $("#gadd",root).onclick = ()=>{
      const t = $("#gtext",root).value.trim();
      if(t.length<2){ toast("Write a little something first 🙂"); return; }
      addGratitude(t); toast("Added to your journal 💚"); render();
    };
  }};
});

/* ---- Wellness check-in ---- */
route("checkin", ()=>{
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Wellness check-in</h2></div>
  <div class="pad stack">
    <p class="muted tiny">A gentle, private self-review. There are no wrong answers — just honesty.</p>
    ${CHECKIN_QUESTIONS.map(q=>`
      <div class="card">
        <p style="font-weight:600">${q.q}</p>
        <div class="likert" data-q="${q.id}">
          ${q.opts.map((o,i)=>`<button data-v="${i+1}" title="${esc(o)}">${i+1}</button>`).join("")}
        </div>
        <div class="likert-legend"><span>${esc(q.opts[0])}</span><span>${esc(q.opts[q.opts.length-1])}</span></div>
      </div>`).join("")}
    <label class="field"><span>Anything else on your heart? (optional)</span>
      <textarea class="input" id="cnote" placeholder="Write freely — just for you."></textarea></label>
    <button class="btn" id="csave">Complete check-in</button>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("wellness");
    $$(".likert",root).forEach(row=> row.querySelectorAll("button").forEach(b=> b.onclick = ()=>{
      row.querySelectorAll("button").forEach(x=>x.classList.remove("on")); b.classList.add("on");
    }));
    $("#csave",root).onclick = ()=>{
      const answers = {};
      let missing = false;
      $$(".likert",root).forEach(row=>{
        const on = row.querySelector("button.on");
        if(!on){ missing = true; } else answers[row.dataset.q] = +on.dataset.v;
      });
      if(missing){ toast("Please answer each question"); return; }
      addCheckin(answers, $("#cnote",root).value.trim());
      const avg = Object.values(answers).reduce((a,b)=>a+b,0)/Object.values(answers).length;
      openCheckinResult(avg);
    };
  }};
});
function openCheckinResult(avg){
  const msg = avg>=4 ? ["You're in a good place 🌟","Keep tending what's working. You've earned this steadiness."]
            : avg>=3 ? ["You're doing okay 🌤️","Some things feel steady, some heavier. Be gentle with yourself today."]
                     : ["A tender season 💛","Thank you for checking in honestly. Consider reaching out — a counsellor or a friend."];
  const showBook = avg < 3;
  const box = sheet(`
    <div class="center">
      <div style="font-size:40px">${avg>=4?"🌟":avg>=3?"🌤️":"💛"}</div>
      <h3 style="margin-top:6px">${msg[0]}</h3>
      <p class="muted" style="margin:8px 0 16px">${msg[1]}</p>
    </div>
    ${showBook?`<button class="btn" id="book">Talk to a counsellor</button>`:""}
    <button class="btn ${showBook?"ghost":""}" id="done" ${showBook?'style="margin-top:6px"':''}>Done</button>`);
  $("#done",box.el).onclick = ()=>{ box.close(); go("wellness"); };
  const bk = $("#book",box.el); if(bk) bk.onclick = ()=>{ box.close(); toast("Opening Counsellor Support…"); go("counselling"); };
}

/* relative time helper */
function relTime(ts){
  const s = Math.floor((Date.now()-ts)/1000);
  if(s<60) return "just now";
  const m = Math.floor(s/60); if(m<60) return `${m} min ago`;
  const h = Math.floor(m/60); if(h<24) return `${h} hr ago`;
  const d = Math.floor(h/24); if(d===1) return "yesterday";
  if(d<7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString([], {day:"numeric", month:"short"});
}

/* ========================= Counsellor Support ========================= */

/* ---- Counselling hub ---- */
route("counselling", ()=>{
  if(!ensureCounselling()) return loadingScreen("Counsellor Support");
  if(remote.cErr) return errorScreen("Counsellor Support", remote.cErr);
  const up = bookingsList();
  const q = questionsList();
  const wCount = couns().webinars.length, gCount = couns().groups.length;   // webinars/groups are Phase 3
  const openQ = q.filter(x=>!x.reply).length;
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Counsellor Support</h2></div>
  <div class="pad">
    <p class="muted tiny">Professional support is with you throughout your journey — confidential and judgement-free.</p>

    ${up.length ? `
      <div class="sec-h"><h3>Your next session</h3><a href="#/book">Book another</a></div>
      ${bookingCardHTML(up[0])}
      ${up.length>1?`<p class="tiny faint center" style="margin-top:8px">+ ${up.length-1} more upcoming</p>`:""}
    ` : `
      <div class="card" style="margin-top:14px;text-align:center">
        <div style="font-size:36px">🧑‍⚕️</div>
        <b style="display:block;margin-top:6px">Book a counselling session</b>
        <p class="tiny muted" style="margin:6px 0 14px">Refresher check-ins, individual or couples support — by video, phone or in person.</p>
        <button class="btn" data-go2="book">Book a session</button>
      </div>
    `}

    <div class="sec-h"><h3>Support</h3></div>
    <div class="tool-grid">
      <button class="tool-card" data-go2="book"><div class="tico">📅</div><b>Book a session</b><div class="sub">${up.length?up.length+" upcoming":"Video · phone · in person"}</div></button>
      <button class="tool-card" data-go2="ask"><div class="tico">💬</div><b>Ask a question</b><div class="sub">${openQ?openQ+" awaiting reply":"Confidential"}</div></button>
      <button class="tool-card" data-go2="webinars"><div class="tico">🎓</div><b>Webinars</b><div class="sub">${wCount?wCount+" registered":WEBINARS.length+" upcoming"}</div></button>
      <button class="tool-card" data-go2="groups"><div class="tico">👥</div><b>Support groups</b><div class="sub">${gCount?gCount+" joined":SUPPORT_GROUPS.length+" groups"}</div></button>
    </div>

    <div class="sec-h"><h3>Upcoming webinars</h3><a href="#/webinars">See all</a></div>
    ${WEBINARS.slice(0,2).map(w=>{
      const on = couns().webinars.includes(w.id);
      return `<div class="list-row" data-web="${w.id}">
        <div class="lico">🎓</div>
        <div class="grow"><b>${esc(w.title)}</b><div class="sub">${esc(w.by)} · ${fmtDate(dateFromOffset(w.inDays))} · ${w.time}</div></div>
        ${on?`<span class="chip">✓ Going</span>`:`<span class="chev">›</span>`}
      </div>`;
    }).join("")}

    <div class="sec-h"><h3>Resources</h3></div>
    ${RESOURCES.map((r,i)=>`
      <div class="list-row" data-res="${i}">
        <div class="lico">${r.icon}</div>
        <div class="grow"><b>${esc(r.title)}</b><div class="sub">${r.kind==="course"?"Academy course":"Read"}</div></div>
        <div class="chev">›</div>
      </div>`).join("")}
    <div style="height:8px"></div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("home");
    $$("[data-go2]",root).forEach(b=> b.onclick = ()=> go(b.dataset.go2));
    $$("[data-web]",root).forEach(el=> el.onclick = ()=> go("webinars"));
    $$("[data-res]",root).forEach(el=> el.onclick = ()=>{
      const r = RESOURCES[+el.dataset.res];
      if(r.kind==="course") go("course", r.ref);
      else openResource(r);
    });
  }};
});

function bookingCardHTML(b){
  const cn = Backend.enabled() ? counsellorNamed(b.counsellor) : counsellorById(b.counsellor);
  const st = SESSION_TYPES.find(s=>s.id===b.type);
  const fmt = SESSION_FORMATS.find(f=>f.id===b.format);
  return `
  <div class="card">
    <div class="row" style="gap:12px">
      ${avatar(cn?.name, cn?.color, "sm")}
      <div class="grow">
        <b>${esc(st?.name||"Session")}</b>
        <div class="tiny faint">${esc(cn?.name||"")} · ${st?.mins} min</div>
      </div>
      <span class="chip">${fmt?.icon||""} ${esc(fmt?.name||"")}</span>
    </div>
    <div class="callout teal" style="margin-top:12px">📅 ${fmtDate(new Date(b.date))} at ${b.time}</div>
    <div class="row" style="gap:8px;margin-top:12px">
      ${b.format==="video"?`<button class="btn sm" data-join-video="${b.id}" style="flex:1">🎥 Join video call</button>`:""}
      <button class="btn sm secondary" data-cancel="${b.id}" style="flex:1">Cancel</button>
    </div>
  </div>`;
}

function openResource(r){
  const box = sheet(`
    <div class="row" style="gap:10px"><span style="font-size:26px">${r.icon}</span><h3 class="grow">${esc(r.title)}</h3></div>
    <p class="muted" style="margin:12px 0 16px">${esc(r.body||"")}</p>
    <button class="btn" id="close">Close</button>`);
  $("#close",box.el).onclick = box.close;
}

/* ---- Booking flow ----
   Local mode invents a day/time grid. In Supabase mode we book REAL
   availability_slots published by the counsellor, so the picker shows their
   actual openings and book_session() claims one atomically. */
const emptyDraft = () => ({ type:"refresher", counsellor:null, format:"video", date:null, time:null, slot:null });
let bookDraft = emptyDraft();
route("book", ()=>{
  if(!ensureCounselling()) return loadingScreen("Book a session");
  if(remote.cErr) return errorScreen("Book a session", remote.cErr);

  const cns = counsellorsList();
  if(!bookDraft.counsellor) bookDraft.counsellor = cns[0] ? cns[0].id : null;

  const days = next7Days();
  if(!Backend.enabled() && !bookDraft.date) bookDraft.date = days[0].key;

  // Supabase mode: real openings for the selected counsellor
  const slotsReady = Backend.enabled() ? ensureSlots(bookDraft.counsellor) : true;
  const slots = Backend.enabled() ? (remote.slots[bookDraft.counsellor] || []) : [];

  if(Backend.enabled() && !cns.length){
    return {
      html:`<div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Book a session</h2></div>
        <div class="pad stack"><div class="callout gold">🧑‍⚕️ No counsellors are available yet. Once your counselling team publishes their availability, you'll be able to book here.</div></div>`,
      mount(root){ $("[data-act=back]",root).onclick = ()=> go("counselling"); }
    };
  }

  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Book a session</h2></div>
  <div class="pad stack">
    <div>
      <span class="fld-lbl">Session type</span>
      <div class="stack" style="margin-top:8px">
        ${SESSION_TYPES.map(s=>`<button class="pickrow ${bookDraft.type===s.id?"on":""}" data-type="${s.id}">
          <div class="grow" style="text-align:left"><b>${s.name}</b><div class="sub">${s.desc}</div></div>
          <span class="chip tiny">${s.mins} min</span></button>`).join("")}
      </div>
    </div>

    <div>
      <span class="fld-lbl">Counsellor</span>
      <div class="stack" style="margin-top:8px">
        ${cns.map(c=>`<button class="pickrow ${bookDraft.counsellor===c.id?"on":""}" data-cn="${c.id}" style="align-items:flex-start">
          ${avatar(c.name,c.color,"sm")}
          <div class="grow" style="text-align:left"><b>${esc(c.name)}</b><div class="sub">${esc(c.title)}</div>
            ${(c.credentials||[]).map(cr=>`<div class="tiny" style="color:var(--teal-700);margin-top:2px">✓ ${esc(cr)}</div>`).join("")}
          </div></button>`).join("")}
      </div>
    </div>

    <div>
      <span class="fld-lbl">Format</span>
      <div class="chips" style="margin-top:8px">
        ${SESSION_FORMATS.map(f=>`<button class="chip select ${bookDraft.format===f.id?"on":""}" data-fmt="${f.id}">${f.icon} ${f.name}</button>`).join("")}
      </div>
    </div>

    ${Backend.enabled() ? `
    <div>
      <span class="fld-lbl">Available times</span>
      ${!slotsReady ? `<p class="tiny faint" style="margin-top:8px">Loading their availability…</p>`
        : slots.length ? `<div class="chips" style="margin-top:8px">
            ${slots.map(s=>{
              const d = new Date(s.starts_at);
              return `<button class="chip select ${bookDraft.slot===s.id?"on":""}" data-slot="${s.id}">${fmtDate(d)} · ${d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</button>`;
            }).join("")}
          </div>`
        : `<div class="callout gold" style="margin-top:8px">📅 This counsellor has no open times in the next 30 days. Try another counsellor.</div>`}
    </div>` : `
    <div>
      <span class="fld-lbl">Choose a day</span>
      <div class="chips" style="margin-top:8px">
        ${days.map(d=>`<button class="chip select daychip ${bookDraft.date===d.key?"on":""}" data-day="${d.key}">${d.label} ${d.day}</button>`).join("")}
      </div>
    </div>

    <div>
      <span class="fld-lbl">Choose a time</span>
      <div class="chips" style="margin-top:8px">
        ${SLOT_TIMES.map(t=>`<button class="chip select ${bookDraft.time===t?"on":""}" data-time="${t}">${t}</button>`).join("")}
      </div>
    </div>`}

    <button class="btn" id="confirm">Confirm booking</button>
    <p class="tiny faint center">You'll get a reminder before your session. You can cancel anytime.</p>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("counselling");
    const rerender = ()=> render();
    $$("[data-type]",root).forEach(b=> b.onclick = ()=>{ bookDraft.type=b.dataset.type; rerender(); });
    $$("[data-cn]",root).forEach(b=> b.onclick = ()=>{ bookDraft.counsellor=b.dataset.cn; bookDraft.slot=null; rerender(); });
    $$("[data-fmt]",root).forEach(b=> b.onclick = ()=>{ bookDraft.format=b.dataset.fmt; rerender(); });
    $$("[data-day]",root).forEach(b=> b.onclick = ()=>{ bookDraft.date=b.dataset.day; rerender(); });
    $$("[data-time]",root).forEach(b=> b.onclick = ()=>{ bookDraft.time=b.dataset.time; rerender(); });
    $$("[data-slot]",root).forEach(b=> b.onclick = ()=>{ bookDraft.slot=b.dataset.slot; rerender(); });

    $("#confirm",root).onclick = async ()=>{
      const cn = Backend.enabled() ? counsellorNamed(bookDraft.counsellor) : counsellorById(bookDraft.counsellor);
      const shortName = (cn && cn.name ? cn.name.split(" ").slice(-1)[0] : "your counsellor");

      if(Backend.enabled()){
        if(!bookDraft.slot){ toast("Please choose an available time"); return; }
        const btn = $("#confirm",root); btn.disabled = true; btn.textContent = "Booking…";
        try{
          await Backend.bookSession(bookDraft.slot, bookDraft.type, bookDraft.format);
          bookDraft = emptyDraft();
          resetCounsellingCache();               // slot is now taken; refetch
          toast(`Session booked with ${shortName} ✓`);
          go("counselling");
        }catch(e){
          const msg = /slot_unavailable/i.test(e.message||"")
            ? "Someone just took that time — please pick another."
            : (e.message || "Could not book");
          toast(msg);
          delete remote.slots[bookDraft.counsellor];   // refresh their openings
          btn.disabled = false; btn.textContent = "Confirm booking";
          render();
        }
        return;
      }

      if(!bookDraft.time){ toast("Please choose a time"); return; }
      addBooking({ type:bookDraft.type, counsellor:bookDraft.counsellor, format:bookDraft.format, date:bookDraft.date, time:bookDraft.time });
      bookDraft = emptyDraft();
      toast(`Session booked with ${shortName} ✓`);
      go("counselling");
    };
  }};
});

/* ---- Confidential Q&A ---- */
route("ask", ()=>{
  if(!ensureCounselling()) return loadingScreen("Ask a question");
  if(remote.cErr) return errorScreen("Ask a question", remote.cErr);
  const q = questionsList();
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Ask a question</h2></div>
  <div class="pad">
    <div class="callout teal">🔒 Confidential. Your questions are seen only by our counselling team.</div>
    <div class="card" style="margin-top:12px">
      <textarea class="input" id="qtext" placeholder="Ask anything — about healing, dating, boundaries, or how you're feeling." style="min-height:80px"></textarea>
      <button class="btn" id="qsend" style="margin-top:12px">Send confidentially</button>
    </div>
    <div class="sec-h"><h3>${q.length?"Your questions":"How it works"}</h3></div>
    ${q.length ? q.map(item=>`
      <div class="card" style="margin-bottom:12px">
        <div class="meta tiny faint" style="margin-bottom:6px">You · ${relTime(item.ts)}</div>
        <p>${esc(item.text)}</p>
        ${item.reply ? `
          <div class="divider"></div>
          <div class="row" style="gap:8px;align-items:flex-start">
            <span style="font-size:18px">🧑‍⚕️</span>
            <div><b class="tiny" style="color:var(--teal-700)">Counselling team</b>
              <p class="tiny" style="margin-top:3px">${esc(item.reply)}</p></div>
          </div>`
        : `<div class="chip gold tiny" style="margin-top:10px;display:inline-block">⏳ Awaiting counsellor reply</div>`}
      </div>`).join("")
    : `<div class="empty"><div class="ico">💬</div><p>No questions yet. There's no such thing as a silly question here.</p></div>`}
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("counselling");
    $("#qsend",root).onclick = async ()=>{
      const t = $("#qtext",root).value.trim();
      if(t.length<5){ toast("Please write your question first"); return; }

      if(Backend.enabled()){
        const btn = $("#qsend",root); btn.disabled = true; btn.textContent = "Sending…";
        try{
          // ask_question() also runs the crisis-safety detector server-side
          await Backend.askQuestion(t);
          remote.questions = null;              // refetch so it appears
          toast("Sent confidentially 💚");
          render();
        }catch(e){
          toast(e.message || "Could not send"); btn.disabled = false; btn.textContent = "Send confidentially";
        }
        return;
      }

      const q = addQuestion(t);
      toast("Sent confidentially 💚");
      render();
      // simulated acknowledgement from the counselling team
      setTimeout(()=>{
        const item = couns().questions.find(x=>x.id===q.id);
        if(item && !item.reply){
          item.reply = QA_ACKS[couns().questions.length % QA_ACKS.length];
          save(); updateBadge();
          if(parseHash().name==="ask") render();
          else toast("A counsellor replied to your question");
        }
      }, 3000);
    };
  }};
});

/* ---- Webinars ---- */
route("webinars", ()=>({
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Webinars</h2></div>
  <div class="pad">
    <p class="muted tiny">Live sessions with our counsellors. Register to get the link and a reminder.</p>
    <div style="margin-top:14px">
      ${WEBINARS.map(w=>{
        const on = couns().webinars.includes(w.id);
        return `<div class="card" style="margin-bottom:12px">
          <div class="row between"><b>${esc(w.title)}</b><span class="chip ${on?"":"gold"}">${fmtDate(dateFromOffset(w.inDays))}</span></div>
          <p class="tiny faint" style="margin:4px 0 8px">${esc(w.by)} · ${w.time}</p>
          <p class="tiny">${esc(w.blurb)}</p>
          <button class="btn sm ${on?"secondary":""}" data-reg="${w.id}" style="width:100%;margin-top:12px">${on?"✓ Registered — tap to cancel":"Register"}</button>
        </div>`;
      }).join("")}
    </div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("counselling");
    $$("[data-reg]",root).forEach(b=> b.onclick = ()=>{
      const now = toggleWebinar(b.dataset.reg);
      toast(now?"Registered — see you there 🎓":"Registration cancelled");
      render();
    });
  }
}));

/* ---- Support groups ---- */
route("groups", ()=>({
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Support groups</h2></div>
  <div class="pad">
    <p class="muted tiny">Moderated, confidential groups to grow alongside people in a similar season.</p>
    <div style="margin-top:14px">
      ${SUPPORT_GROUPS.map(g=>{
        const on = couns().groups.includes(g.id);
        return `<div class="card" style="margin-bottom:12px">
          <div class="row" style="gap:12px">
            <div class="lico" style="font-size:22px">${g.icon}</div>
            <div class="grow"><b>${esc(g.name)}</b><div class="sub tiny faint">${esc(g.when)} · ${g.members + (on?1:0)} members</div>
              <div class="tiny faint">Facilitated by ${esc(g.by)}</div></div>
          </div>
          <button class="btn sm ${on?"secondary":""}" data-join="${g.id}" style="width:100%;margin-top:12px">${on?"✓ Joined — tap to leave":"Join group"}</button>
        </div>`;
      }).join("")}
    </div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("counselling");
    $$("[data-join]",root).forEach(b=> b.onclick = ()=>{
      const now = toggleGroup(b.dataset.join);
      toast(now?"Welcome to the group 👋":"You've left the group");
      render();
    });
  }
}));

/* Booking join / cancel are wired on the hub via delegation.
   (Uses its own data-join-video attribute — real booking ids are UUIDs, so we
   can't identify them by prefix the way the local demo ids allowed.) */
document.addEventListener("click", async e=>{
  const join = e.target.closest("[data-join-video]");
  if(join){
    // The room exists on the booking; short-lived provider tokens are minted by
    // an Edge Function (not built yet), so this is still a placeholder.
    toast("Connecting to your video session… 🎥");
    return;
  }
  const cancel = e.target.closest("[data-cancel]");
  if(cancel){
    const id = cancel.dataset.cancel;
    if(Backend.enabled()){
      cancel.disabled = true;
      try{
        await Backend.cancelBooking(id);
        resetCounsellingCache();          // frees the slot server-side too
        toast("Session cancelled");
      }catch(err){ toast(err.message || "Could not cancel"); cancel.disabled = false; return; }
    } else {
      cancelBooking(id); toast("Session cancelled");
    }
    render();
  }
});

/* ============================ Couple Space ============================ */
route("couple", ()=>{
  const c = cpl();
  if(!c.active) return coupleGate();
  const p = candidate(c.partnerId);
  const prompt = COUPLE_PROMPTS[dailyIndex(COUPLE_PROMPTS.length)];
  const bt = budgetTotals();
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Couple Space</h2>
    <button class="back" data-act="settings">⋯</button></div>
  <div class="pad">
    <div class="card" style="background:linear-gradient(135deg,#12857f,#0a4b47);color:#fff">
      <div class="row" style="gap:6px;justify-content:center">
        ${avatar(S.user.name,S.user.color,"lg")}
        <span style="font-size:22px;align-self:center">💚</span>
        ${avatar(p?.name,p?.color,"lg")}
      </div>
      <div class="center" style="margin-top:12px">
        <b>${esc(S.user.name)} & ${esc(p?.name||"Partner")}</b>
        <p class="tiny" style="opacity:.9">Together since ${fmtDate(new Date(c.since))} · ${daysTogether()} day${daysTogether()===1?"":"s"}</p>
      </div>
    </div>

    <div class="callout gold" style="margin-top:12px">🎉 ${anniversaryNote(c)}</div>

    <div class="sec-h"><h3>This week, together</h3></div>
    <div class="prompt-card">
      <div class="kicker">Conversation prompt</div>
      <div class="q">"${esc(prompt)}"</div>
    </div>

    <div class="sec-h"><h3>Your space</h3></div>
    <div class="tool-grid">
      <button class="tool-card" data-go2="couple-journal"><div class="tico">📔</div><b>Shared journal</b><div class="sub">${c.journal.length?c.journal.length+" entries":"Write together"}</div></button>
      <button class="tool-card" data-go2="couple-goals"><div class="tico">🎯</div><b>Couple goals</b><div class="sub">${c.goals.length?c.goals.filter(g=>g.done).length+"/"+c.goals.length+" done":"Set a goal"}</div></button>
      <button class="tool-card" data-go2="couple-dates"><div class="tico">🗓️</div><b>Date planner</b><div class="sub">${c.dates.length?c.dates.length+" planned":"Plan a date"}</div></button>
      <button class="tool-card" data-go2="couple-budget"><div class="tico">💰</div><b>Budget planner</b><div class="sub">${c.budget.length?"Balance "+fmtKes(bt.balance):"Plan finances"}</div></button>
    </div>
    <button class="btn secondary" data-go2="couple-checkin" style="margin-top:12px">📝 Weekly relationship check-in</button>

    ${c.journal.length?`<div class="sec-h"><h3>Recent journal</h3><a href="#/couple-journal">See all</a></div>
      ${c.journal.slice(-2).reverse().map(e=>journalEntryHTML(e,p)).join("")}`:""}
    <div style="height:8px"></div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("profile");
    $$("[data-go2]",root).forEach(b=> b.onclick = ()=> go(b.dataset.go2));
    $("[data-act=settings]",root).onclick = ()=>{
      const box = sheet(`<h3>Couple Space</h3><p class="muted tiny" style="margin:8px 0 14px">Ending this clears your shared journal, goals and plans on this device.</p>
        <button class="btn danger" id="end">End relationship space</button><button class="btn ghost" id="cancel" style="margin-top:6px">Cancel</button>`);
      $("#cancel",box.el).onclick = box.close;
      $("#end",box.el).onclick = ()=>{ endCouple(); box.close(); toast("Couple Space closed"); go("couple"); };
    };
  }};
});

function coupleGate(){
  const partners = connectedPartners();
  const demo = rankedMatches()[0]?.c;
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Couple Space</h2></div>
  <div class="pad stack center">
    <div style="font-size:52px">💑</div>
    <h2>A space that's just yours</h2>
    <p class="muted" style="max-width:34ch;margin:0 auto">Couple Space unlocks when you and a match both agree to commit to a relationship. Inside: a shared journal, goals, a date planner, budget and weekly check-ins.</p>
    ${partners.length ? `
      <div class="card" style="text-align:left;width:100%">
        <p class="tiny faint" style="margin-bottom:10px">COMMIT WITH SOMEONE YOU'VE CONNECTED WITH</p>
        <div class="stack">
          ${partners.map(pt=>`<div class="row between"><div class="row" style="gap:10px">${avatar(pt.name,pt.color,"sm")}<b>${esc(pt.name)}</b></div>
            <button class="btn sm" data-commit="${pt.id}">Commit together</button></div>`).join("")}
        </div>
      </div>` : `
      <div class="callout teal" style="text-align:left;width:100%">💡 Connect with a match first — once you've both expressed interest and are ready, you can open Couple Space together.</div>
      <button class="btn" data-go2="matches">Browse matches</button>`}
    ${demo?`<button class="btn ghost" data-demo="${demo.id}">Preview with a sample partner (demo)</button>`:""}
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("profile");
    $$("[data-go2]",root).forEach(b=> b.onclick = ()=> go(b.dataset.go2));
    $$("[data-commit]",root).forEach(b=> b.onclick = ()=> beginCouple(b.dataset.commit));
    const dm = $("[data-demo]",root); if(dm) dm.onclick = ()=> beginCouple(dm.dataset.demo);
  }};
}
function beginCouple(partnerId){
  commitCouple(partnerId);
  const p = candidate(partnerId);
  cpl().journal.push({ from:"partner", text:`I'm so glad we're building this together, ${S.user.name}. Here's to us 💚`, ts:Date.now() });
  save();
  toast(`Couple Space opened with ${p?.name} 💚`);
  go("couple");
}
function anniversaryNote(c){
  const d = daysTogether();
  if(d===0) return "Welcome to your shared space — day one of the journey.";
  const milestones = {7:"One week together!",30:"One month together!",100:"100 days together!",365:"One year together!"};
  if(milestones[d]) return milestones[d];
  const next = [7,30,100,365].find(m=>m>d);
  return next ? `${next-d} day${next-d===1?"":"s"} until your ${next===7?"1-week":next===30?"1-month":next===100?"100-day":"1-year"} milestone.` : "Every day is worth celebrating.";
}
function journalEntryHTML(e,p){
  const mine = e.from!=="partner";
  const who = mine ? S.user.name : (p?.name||"Partner");
  return `<div class="entry"><div class="meta">${esc(who)} · ${relTime(e.ts)}</div>${esc(e.text)}</div>`;
}
const fmtKes = n => "KES " + (n||0).toLocaleString();

/* Couple sub-tools */
route("couple-journal", ()=>{
  const c = cpl(); if(!c.active) return go("couple");
  const p = candidate(c.partnerId);
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Shared journal</h2></div>
  <div class="pad">
    <div class="card"><textarea class="input" id="jtext" placeholder="Share a thought, a memory, a thank-you…" style="min-height:74px"></textarea>
      <button class="btn" id="jadd" style="margin-top:12px">Add entry</button></div>
    <div class="sec-h"><h3>${c.journal.length?"Entries":"Your journal"}</h3></div>
    <div class="stack">
      ${c.journal.length? c.journal.slice().reverse().map(e=>journalEntryHTML(e,p)).join("")
        : `<div class="empty"><div class="ico">📔</div><p>No entries yet. Start with one thing you're grateful for in each other.</p></div>`}
    </div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("couple");
    $("#jadd",root).onclick = ()=>{ const t=$("#jtext",root).value.trim(); if(t.length<2){toast("Write something first");return;}
      c.journal.push({from:"me",text:t,ts:Date.now()}); save(); toast("Added 💚"); render(); };
  }};
});

route("couple-goals", ()=>{
  const c = cpl(); if(!c.active) return go("couple");
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Couple goals</h2></div>
  <div class="pad">
    <div class="card"><label class="field"><span>A goal to work toward together</span>
      <input class="input" id="gtext" placeholder="e.g. Save for a trip, pray together weekly"></label>
      <button class="btn" id="gadd" style="margin-top:12px">Add goal</button></div>
    <div class="sec-h"><h3>${c.goals.length?"Your goals":"Goals"}</h3></div>
    ${c.goals.length? c.goals.map((g,i)=>`<div class="list-row" style="cursor:default">
        <button class="lico" data-toggle="${i}" style="background:${g.done?'var(--teal-700)':'var(--teal-50)'};color:${g.done?'#fff':'var(--teal-700)'};font-weight:800;border:none">${g.done?'✓':'○'}</button>
        <div class="grow"><b style="${g.done?'text-decoration:line-through;opacity:.6':''}">${esc(g.text)}</b></div>
        <button class="chev" data-del="${i}" style="background:none">✕</button></div>`).join("")
      : `<div class="empty"><div class="ico">🎯</div><p>No goals yet. Dreaming together is part of the fun.</p></div>`}
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("couple");
    $("#gadd",root).onclick = ()=>{ const t=$("#gtext",root).value.trim(); if(t.length<2){toast("Add a goal first");return;}
      c.goals.push({text:t,done:false}); save(); render(); };
    $$("[data-toggle]",root).forEach(b=> b.onclick = ()=>{ const i=+b.dataset.toggle; c.goals[i].done=!c.goals[i].done; save(); render(); });
    $$("[data-del]",root).forEach(b=> b.onclick = ()=>{ c.goals.splice(+b.dataset.del,1); save(); render(); });
  }};
});

route("couple-dates", ()=>{
  const c = cpl(); if(!c.active) return go("couple");
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Date planner</h2></div>
  <div class="pad">
    <div class="card"><label class="field"><span>Plan a date</span>
      <input class="input" id="dtext" placeholder="Your idea, or pick a suggestion below"></label>
      <div class="chips" style="margin-top:10px">${DATE_IDEAS.map((d,i)=>`<button class="chip select" data-idea="${i}">${d.length>26?d.slice(0,26)+"…":d}</button>`).join("")}</div>
      <button class="btn" id="dadd" style="margin-top:12px">Add to plan</button></div>
    <div class="sec-h"><h3>${c.dates.length?"Planned dates":"Your dates"}</h3></div>
    ${c.dates.length? c.dates.map((d,i)=>`<div class="list-row" style="cursor:default">
        <button class="lico" data-done="${i}" style="background:${d.done?'var(--teal-700)':'var(--teal-50)'};color:${d.done?'#fff':'var(--teal-700)'};border:none">${d.done?'✓':'🗓️'}</button>
        <div class="grow"><b style="${d.done?'text-decoration:line-through;opacity:.6':''}">${esc(d.text)}</b></div>
        <button class="chev" data-del="${i}" style="background:none">✕</button></div>`).join("")
      : `<div class="empty"><div class="ico">🗓️</div><p>No dates planned yet. Intentional time together matters.</p></div>`}
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("couple");
    $$("[data-idea]",root).forEach(b=> b.onclick = ()=>{ $("#dtext",root).value = DATE_IDEAS[+b.dataset.idea]; });
    $("#dadd",root).onclick = ()=>{ const t=$("#dtext",root).value.trim(); if(t.length<2){toast("Add a date idea first");return;}
      c.dates.push({text:t,done:false}); save(); toast("Date planned 💚"); render(); };
    $$("[data-done]",root).forEach(b=> b.onclick = ()=>{ const i=+b.dataset.done; c.dates[i].done=!c.dates[i].done; save(); render(); });
    $$("[data-del]",root).forEach(b=> b.onclick = ()=>{ c.dates.splice(+b.dataset.del,1); save(); render(); });
  }};
});

route("couple-budget", ()=>{
  const c = cpl(); if(!c.active) return go("couple");
  const bt = budgetTotals();
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Budget planner</h2></div>
  <div class="pad">
    <div class="card">
      <div class="row" style="gap:10px">
        <div class="grow center"><div class="tiny faint">Income</div><b style="color:var(--ok)">${fmtKes(bt.income)}</b></div>
        <div class="grow center"><div class="tiny faint">Expenses</div><b style="color:var(--danger)">${fmtKes(bt.expense)}</b></div>
        <div class="grow center"><div class="tiny faint">Balance</div><b style="color:${bt.balance>=0?'var(--teal-700)':'var(--danger)'}">${fmtKes(bt.balance)}</b></div>
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="row" style="gap:8px">
        <input class="input" id="blabel" placeholder="Item, e.g. Rent" style="flex:2">
        <input class="input" id="bamt" type="number" placeholder="Amount" style="flex:1">
      </div>
      <div class="row" style="gap:8px;margin-top:10px">
        <button class="btn sm secondary" id="binc" style="flex:1">+ Income</button>
        <button class="btn sm secondary" id="bexp" style="flex:1">+ Expense</button>
      </div>
    </div>
    <div class="sec-h"><h3>${c.budget.length?"Items":"Your budget"}</h3></div>
    ${c.budget.length? c.budget.map((b,i)=>`<div class="list-row" style="cursor:default">
        <div class="lico" style="background:${b.type==='income'?'#e7f4f2':'var(--coral-50)'};color:${b.type==='income'?'var(--ok)':'var(--danger)'}">${b.type==='income'?'▲':'▼'}</div>
        <div class="grow"><b>${esc(b.label)}</b><div class="sub">${b.type}</div></div>
        <div class="row" style="gap:10px"><b class="tiny">${fmtKes(b.amount)}</b><button class="chev" data-del="${i}" style="background:none">✕</button></div></div>`).join("")
      : `<div class="empty"><div class="ico">💰</div><p>Add income and expenses to plan together.</p></div>`}
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("couple");
    const add = type =>{
      const label = $("#blabel",root).value.trim(); const amt = +$("#bamt",root).value;
      if(!label){ toast("Add a label"); return; } if(!(amt>0)){ toast("Add an amount"); return; }
      c.budget.push({label,amount:amt,type}); save(); render();
    };
    $("#binc",root).onclick = ()=> add("income");
    $("#bexp",root).onclick = ()=> add("expense");
    $$("[data-del]",root).forEach(b=> b.onclick = ()=>{ c.budget.splice(+b.dataset.del,1); save(); render(); });
  }};
});

route("couple-checkin", ()=>{
  const c = cpl(); if(!c.active) return go("couple");
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Weekly check-in</h2></div>
  <div class="pad stack">
    <p class="muted tiny">A gentle weekly pulse on your relationship. Answer honestly and, if you like, share it together.</p>
    ${COUPLE_CHECKIN.map(q=>`<div class="card"><p style="font-weight:600">${q.q}</p>
      <div class="likert" data-q="${q.id}">${[1,2,3,4,5].map(n=>`<button data-v="${n}">${n}</button>`).join("")}</div>
      <div class="likert-legend"><span>Not much</span><span>A lot</span></div></div>`).join("")}
    <label class="field"><span>One thing to celebrate, one to work on (optional)</span>
      <textarea class="input" id="cnote" placeholder="Write together…"></textarea></label>
    <button class="btn" id="csave">Save check-in</button>
    ${c.checkins.length?`<p class="center tiny faint">${c.checkins.length} check-in${c.checkins.length>1?"s":""} so far</p>`:""}
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("couple");
    $$(".likert",root).forEach(row=> row.querySelectorAll("button").forEach(b=> b.onclick = ()=>{
      row.querySelectorAll("button").forEach(x=>x.classList.remove("on")); b.classList.add("on"); }));
    $("#csave",root).onclick = ()=>{
      const answers = {}; let missing=false;
      $$(".likert",root).forEach(row=>{ const on=row.querySelector("button.on"); if(!on) missing=true; else answers[row.dataset.q]=+on.dataset.v; });
      if(missing){ toast("Please answer each question"); return; }
      c.checkins.push({ ts:Date.now(), answers, note:$("#cnote",root).value.trim() }); save();
      toast("Check-in saved 💚"); go("couple");
    };
  }};
});

/* ========================= Marriage Preparation ========================= */
route("marriage", ()=>{
  const p = marriageProgress();
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Marriage Preparation</h2></div>
  <div class="pad">
    <p class="muted tiny">A guided pathway of the honest conversations that build a marriage able to last. Work through them at your own pace.</p>
    <div class="card" style="margin-top:14px">
      <div class="row between"><b>Your progress</b><span class="chip">${p.done}/${p.total}</span></div>
      <div class="bar" style="margin-top:10px"><i style="width:${p.pct}%"></i></div>
      ${p.pct===100?`<p class="tiny" style="color:var(--teal-700);margin-top:10px">🎉 You've worked through every conversation. Beautiful preparation.</p>`:""}
    </div>
    <div class="sec-h"><h3>Conversations</h3></div>
    ${MARRIAGE_TOPICS.map(t=>{
      const done = marriageDone()[t.id];
      return `<div class="list-row" data-topic="${t.id}">
        <div class="lico" style="background:${done?'var(--teal-700)':'var(--teal-50)'};color:${done?'#fff':'inherit'};font-size:20px">${done?'✓':t.icon}</div>
        <div class="grow"><b>${esc(t.title)}</b><div class="sub">${done?'Discussed':esc(t.desc)}</div></div>
        <div class="chev">›</div></div>`;
    }).join("")}
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("profile");
    $$("[data-topic]",root).forEach(el=> el.onclick = ()=> go("mtopic", el.dataset.topic));
  }};
});
route("mtopic", (id)=>{
  const t = MARRIAGE_TOPICS.find(x=>x.id===id); if(!t) return go("marriage");
  const done = marriageDone()[id];
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Conversation</h2></div>
  <div class="pad stack">
    <div class="center"><div style="font-size:46px">${t.icon}</div><h2 style="margin-top:6px">${esc(t.title)}</h2>
      <p class="muted">${esc(t.desc)}</p></div>
    <div class="card">
      <p class="tiny faint" style="margin-bottom:10px">TALK ABOUT</p>
      <div class="stack">${t.points.map(pt=>`<div class="reason"><span class="k">•</span><span>${esc(pt)}</span></div>`).join("")}</div>
    </div>
    <div class="callout teal">💡 There are no right answers — the goal is to understand each other, not to agree on everything.</div>
    <button class="btn ${done?'secondary':''}" id="mark">${done?'✓ Discussed — tap to undo':'Mark as discussed'}</button>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("marriage");
    $("#mark",root).onclick = ()=>{ const d=marriageDone(); if(d[id]) delete d[id]; else d[id]=true; save();
      toast(d[id]?"Marked as discussed ✓":"Marked as not done"); go("marriage"); };
  }};
});

/* ============================ Community Groups ============================ */
route("community", ()=>({
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Community Groups</h2></div>
  <div class="pad">
    <p class="muted tiny">Moderated, confidential discussion groups to grow alongside people in a similar season. Be kind — every group is a safe space.</p>
    <div style="margin-top:14px">
      ${COMMUNITY_GROUPS.map(g=>{
        const on = community().joined.includes(g.id);
        return `<div class="card" style="margin-bottom:12px">
          <div class="row" style="gap:12px">
            <div class="lico" style="font-size:22px">${g.icon}</div>
            <div class="grow"><b>${esc(g.name)}</b><div class="sub tiny faint">${g.members + (on?1:0)} members</div></div>
            <button class="btn sm ${on?"secondary":""}" data-join="${g.id}">${on?"Joined":"Join"}</button>
          </div>
          <p class="tiny muted" style="margin-top:8px">${esc(g.desc)}</p>
          <button class="btn sm ghost" data-open="${g.id}" style="margin-top:6px;width:100%">Open discussion →</button>
        </div>`;
      }).join("")}
    </div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("profile");
    $$("[data-join]",root).forEach(b=> b.onclick = ()=>{ const now=toggleCommunity(b.dataset.join); toast(now?"Joined 👋":"Left group"); render(); });
    $$("[data-open]",root).forEach(b=> b.onclick = ()=> go("cgroup", b.dataset.open));
  }
}));
route("cgroup", (id)=>{
  const g = COMMUNITY_GROUPS.find(x=>x.id===id); if(!g) return go("community");
  const posts = communityPosts(id);
  const joined = community().joined.includes(id);
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button>
    <div class="grow"><b>${esc(g.name)}</b><div class="tiny faint">${g.members+(joined?1:0)} members · moderated</div></div>
    <button class="btn sm ${joined?"secondary":""}" data-join style="width:auto">${joined?"Joined":"Join"}</button></div>
  <div class="pad">
    <div class="card"><textarea class="input" id="ptext" placeholder="Share with the group…" style="min-height:60px"></textarea>
      <button class="btn" id="ppost" style="margin-top:10px">Post</button>
      <p class="tiny faint center" style="margin-top:8px">🛡️ Posts are moderated for a respectful, safe space.</p></div>
    <div class="sec-h"><h3>Discussion</h3></div>
    <div class="stack">
      ${posts.map(post=>`<div class="entry">
        <div class="row" style="gap:8px;margin-bottom:4px">${avatar(post.a,post.mine?S.user.color:'#7f908d',"sm")}
          <div><b class="tiny">${esc(post.a)}</b><div class="meta">${relTime(post.ts)}</div></div></div>
        <p>${esc(post.t)}</p></div>`).join("")}
    </div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> go("community");
    $("[data-join]",root).onclick = ()=>{ toggleCommunity(id); render(); };
    $("#ppost",root).onclick = ()=>{ const t=$("#ptext",root).value.trim(); if(t.length<2){toast("Write something first");return;}
      addCommunityPost(id,t); toast("Posted"); render(); };
  }};
});

/* ================================ Events ================================ */
route("events", ()=>({
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Events</h2></div>
  <div class="pad">
    <p class="muted tiny">Meet safely in real life at counsellor-hosted gatherings. RSVP to save your place.</p>
    <div style="margin-top:14px">
      ${EVENTS.map(e=>{
        const on = eventsState().rsvp.includes(e.id);
        return `<div class="card" style="margin-bottom:12px" data-ev="${e.id}">
          <div class="row" style="gap:12px">
            <div class="lico" style="font-size:22px">${e.icon}</div>
            <div class="grow"><b>${esc(e.title)}</b><div class="sub tiny faint">${esc(e.type)} · ${esc(e.location)} · ${esc(e.price)}</div></div>
            <span class="chip ${on?"":"gold"}">${fmtDate(dateFromOffset(e.inDays))}</span>
          </div>
          <p class="tiny muted" style="margin-top:8px">${esc(e.blurb)}</p>
          <button class="btn sm ${on?"secondary":""}" data-rsvp="${e.id}" style="width:100%;margin-top:10px">${on?"✓ You're going — tap to cancel":"RSVP"}</button>
        </div>`;
      }).join("")}
    </div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("profile");
    $$("[data-rsvp]",root).forEach(b=> b.onclick = e=>{ e.stopPropagation(); const now=toggleRSVP(b.dataset.rsvp);
      toast(now?"RSVP confirmed — see you there 🎉":"RSVP cancelled"); render(); });
  }
}));

/* ================================ Premium ================================ */
route("premium", ()=>{
  const plan = currentPlan();
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Premium</h2></div>
  <div class="pad">
    <p class="muted tiny">Go deeper with unlimited professional support. Your core journey is always free.</p>
    <div style="margin-top:14px">
      ${PREMIUM_PLANS.map(pl=>{
        const active = pl.id===plan;
        return `<div class="card plan-card ${pl.popular?"popular":""} ${active?"active":""}" style="margin-bottom:12px">
          ${pl.popular?`<span class="chip gold" style="position:absolute;top:-9px;right:16px">Most popular</span>`:""}
          <div class="row between"><b style="font-size:17px">${esc(pl.name)}</b>${active?`<span class="chip">Current</span>`:""}</div>
          <div style="margin:4px 0 2px"><span style="font-size:24px;font-weight:800;color:var(--teal-700)">${esc(pl.price)}</span><span class="tiny faint">${esc(pl.per)}</span></div>
          <p class="tiny faint">${esc(pl.tagline)}</p>
          <div class="stack" style="margin-top:12px">${pl.features.map(f=>`<div class="reason"><span class="k">✓</span><span class="tiny">${esc(f)}</span></div>`).join("")}</div>
          ${active ? `<button class="btn secondary" disabled style="margin-top:14px">Your current plan</button>`
                   : pl.id==="free" ? `<button class="btn secondary" data-plan="free" style="margin-top:14px">Switch to Free</button>`
                   : `<button class="btn" data-plan="${pl.id}" style="margin-top:14px">Choose ${esc(pl.name)}</button>`}
        </div>`;
      }).join("")}
    </div>
    <p class="center tiny faint" style="margin-top:6px">Prototype — no payment is taken. This is a demo of the upgrade flow.</p>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("profile");
    $$("[data-plan]",root).forEach(b=> b.onclick = ()=>{
      const id = b.dataset.plan;
      if(id==="free"){ setPlan("free"); toast("Switched to Free"); render(); return; }
      const pl = PREMIUM_PLANS.find(x=>x.id===id);
      const box = sheet(`
        <div class="center"><div style="font-size:38px">⭐</div><h3 style="margin-top:6px">${esc(pl.name)} — ${esc(pl.price)}${esc(pl.per)}</h3>
        <p class="muted tiny" style="margin:8px 0 4px">You're about to start the ${esc(pl.name)} plan.</p>
        <div class="callout gold" style="text-align:left;margin:12px 0">🔒 This is a prototype — no payment method is requested and no money is taken.</div></div>
        <button class="btn" id="confirm">Start ${esc(pl.name)} (demo)</button>
        <button class="btn ghost" id="cancel" style="margin-top:6px">Cancel</button>`);
      $("#cancel",box.el).onclick = box.close;
      $("#confirm",box.el).onclick = ()=>{ setPlan(id); box.close(); toast(`${pl.name} activated 🌟`); render(); };
    });
  }};
});

/* ---- Feature-row helpers ---- */
function featureRow(nav, ico, title, sub){
  return `<div class="list-row" data-go="${nav}">
    <div class="lico">${ico}</div>
    <div class="grow"><b>${title}</b><div class="sub">${sub}</div></div>
    <div class="chev">›</div></div>`;
}
function wireFeatureRows(root){
  $$("[data-go]",root).forEach(el=> el.onclick = ()=>{
    const [n,p] = el.dataset.go.split("/");
    go(n, p);
  });
}

/* ---------------- Boot ---------------- */
(async function boot(){
  if(Backend.configured){
    try{
      await Backend.init();
      if(Backend.enabled()){
        const prof = await Backend.getProfile();     // null if no active session
        if(prof){
          S.user = Backend.fromRow(prof);
          S.onboarded = !!prof.onboarded;
          save();
        }
      }
    }catch(e){ console.warn("[Backend] boot restore failed — continuing in local mode.", e); }
  }
  render();
})();
