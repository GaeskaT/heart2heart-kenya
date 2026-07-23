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
  membership:{ plan:null, since:null },  // "basic" | "premium" — monthly, gates features per package
  progress:[],       // match/relationship progress reports for the counselling team
  listening:[],      // Listening Centre callback requests
  seededInbound:false,
  tourSeen:false,    // has the first-run onboarding tour been shown/dismissed
};

/* Membership packages (KES / month, recurring). Anyone can register and browse;
   using a feature requires an active package, and each package sets monthly limits.
   Prototype — no payment is ever taken. */
const MEMBERSHIP_PLANS = [
  { id:"basic", name:"Basic", price:2500, tagline:"Everything you need to get started",
    limits:{ matches:5, counselling:1, webinars:5, groups:1 },
    features:[
      "Up to 5 curated matches",
      "1 free counselling session / month",
      "Up to 5 webinars",
      "1 group membership",
      "Full Learning Academy & Wellness Tools",
    ] },
  { id:"premium", name:"Premium", price:3500, popular:true, tagline:"Unlimited access",
    limits:{ matches:Infinity, counselling:2, webinars:Infinity, groups:Infinity },
    features:[
      "Unlimited matches",
      "Unlimited webinars",
      "Unlimited group memberships",
      "2 free counselling sessions / month",
      "Full Learning Academy & Wellness Tools",
    ] },
];
const planById = id => MEMBERSHIP_PLANS.find(p => p.id === id) || null;
const unlimited = n => n === Infinity;

let S = load();
let pendingInvite = null;   // invite code entered on the invite screen (Supabase mode)

/* ---- PWA install ---- */
let installPrompt = null;   // the deferred beforeinstallprompt event, if offered
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  if(typeof render === "function") render();   // surface the Install button
});
window.addEventListener("appinstalled", () => { installPrompt = null; toast("App installed 💚"); });
async function doInstall(){
  if(!installPrompt) return;
  installPrompt.prompt();
  try{ await installPrompt.userChoice; }catch(e){}
  installPrompt = null;
  render();
}

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

/* ============================ Onboarding tour ============================
   A lightweight spotlight/coach-mark walkthrough. Anchors to the fixed
   bottom tab bar (always present on nav screens) so there's no scroll math.
   Auto-runs once after onboarding; replayable from Profile. */
let tourActive = false;
const TOUR_STEPS = [
  { center:true, title:"Welcome to Heart2Heart 💚",
    body:"A calm, counsellor-guided space for building a healthy relationship. Here's a 20-second tour of how it works." },
  { sel:'[data-nav=home]', title:"Home",
    body:"Your daily check-in — a weekly reflection, your top match, and quick links to your tools." },
  { sel:'[data-nav=matches]', title:"Matches",
    body:"A few thoughtfully chosen people, each with clear reasons you fit. No endless swiping." },
  { sel:'[data-nav=messages]', title:"Messages",
    body:"No anonymous chat — a conversation only opens after both of you express interest." },
  { sel:'[data-nav=learn]', title:"Learn",
    body:"The Academy: short courses on communication, healthy love and growing together." },
  { sel:'[data-nav=profile]', title:"You",
    body:"Your wellness score, your journey and settings. You can replay this tour here anytime." },
  { center:true, title:"You're all set 🌿",
    body:"Take your time — healing first, healthy relationships next. Enjoy the journey." },
];

function startTour(){
  if(tourActive) return;
  if(parseHash().name !== "home"){ go("home"); }   // ensure the tab bar is present
  tourActive = true;

  const back = document.createElement("div");
  back.className = "tour-back";
  back.innerHTML = `
    <div class="tour-hole" hidden></div>
    <div class="tour-pop">
      <div class="tour-dots">${TOUR_STEPS.map(()=>`<i></i>`).join("")}</div>
      <h3 class="tour-title"></h3>
      <p class="tour-body"></p>
      <div class="tour-nav">
        <button class="btn ghost sm" data-t="skip">Skip</button>
        <div class="grow"></div>
        <button class="btn secondary sm" data-t="back">Back</button>
        <button class="btn sm" data-t="next">Next</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  requestAnimationFrame(()=> back.classList.add("show"));

  const hole = $(".tour-hole", back), pop = $(".tour-pop", back);
  const titleEl = $(".tour-title", back), bodyEl = $(".tour-body", back);
  const dots = $$(".tour-dots i", back);
  const backBtn = $("[data-t=back]", back), nextBtn = $("[data-t=next]", back);
  let i = 0;

  function place(){
    const step = TOUR_STEPS[i];
    const target = step.center ? null : $(step.sel);
    if(target){
      // The tab bar sits at the bottom of a 100vh shell — if the visual viewport
      // is shorter (mobile browser chrome), pull the target into view before measuring.
      target.scrollIntoView({ block:"nearest", inline:"nearest" });
      const r = target.getBoundingClientRect(), pad = 6;
      hole.hidden = false;
      hole.style.left = (r.left - pad) + "px";
      hole.style.top = (r.top - pad) + "px";
      hole.style.width = (r.width + pad*2) + "px";
      hole.style.height = (r.height + pad*2) + "px";
      back.classList.remove("solid");
      pop.classList.remove("center");
      const below = r.top < window.innerHeight/2;   // target in top half → pop below it
      if(below){ pop.style.top = (r.bottom + 16) + "px"; pop.style.bottom = "auto"; }
      else { pop.style.bottom = (window.innerHeight - r.top + 16) + "px"; pop.style.top = "auto"; }
    } else {
      hole.hidden = true;
      back.classList.add("solid");
      pop.classList.add("center");
      pop.style.top = ""; pop.style.bottom = "";
    }
  }
  function show(){
    const step = TOUR_STEPS[i];
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    dots.forEach((d,n)=> d.classList.toggle("on", n===i));
    backBtn.style.visibility = i===0 ? "hidden" : "visible";
    nextBtn.textContent = i===TOUR_STEPS.length-1 ? "Done" : "Next";
    place();
  }
  function finish(){
    if(!tourActive) return;
    tourActive = false;
    S.tourSeen = true; save();
    window.removeEventListener("resize", place);
    back.classList.remove("show");
    setTimeout(()=> back.remove(), 250);
  }

  nextBtn.onclick = ()=>{ if(i>=TOUR_STEPS.length-1){ finish(); } else { i++; show(); } };
  backBtn.onclick = ()=>{ if(i>0){ i--; show(); } };
  $("[data-t=skip]", back).onclick = finish;
  window.addEventListener("resize", place);
  show();
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
// Toggles return true (added), false (removed), or "limit" (package cap reached)
function toggleWebinar(id){ const w = couns().webinars; const i = w.indexOf(id);
  if(i>=0){ w.splice(i,1); save(); return false; }
  if(w.length >= planLimit("webinars")) return "limit";
  w.push(id); save(); return true; }
function toggleGroup(id){ const g = couns().groups; const i = g.indexOf(id);
  if(i>=0){ g.splice(i,1); save(); return false; }
  if(groupsJoined() >= planLimit("groups")) return "limit";
  g.push(id); save(); return true; }
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
function toggleCommunity(id){ const j = community().joined; const i = j.indexOf(id);
  if(i>=0){ j.splice(i,1); save(); return false; }
  if(groupsJoined() >= planLimit("groups")) return "limit";
  j.push(id); save(); return true; }

/* ---- Events ---- */
function eventsState(){ if(!S.events) S.events = {rsvp:[]}; S.events.rsvp ||= []; return S.events; }
function toggleRSVP(id){ const r = eventsState().rsvp; const i = r.indexOf(id); if(i>=0) r.splice(i,1); else r.push(id); save(); return i<0; }

/* ---- Premium ---- */
function currentPlan(){ if(!S.premium) S.premium = {plan:"free"}; return S.premium.plan || "free"; }
function setPlan(id){ if(!S.premium) S.premium = {}; S.premium.plan = id; save(); }

/* ---- Membership packages (gate features + set monthly limits, simulated) ---- */
function membershipState(){ if(!S.membership) S.membership = { plan:null, since:null }; return S.membership; }
const member = () => !!membershipState().plan;
function membershipPlan(){ return planById(membershipState().plan); }
function planLimit(key){ const p = membershipPlan(); return p ? p.limits[key] : 0; }
function activateMembership(planId){ const m = membershipState(); m.plan = planId; m.since = Date.now(); save(); }
function cancelMembership(){ const m = membershipState(); m.plan = null; m.since = null; save(); }
// "one group membership" spans both support groups and community groups
function groupsJoined(){ return couns().groups.length + community().joined.length; }

/* ---------------- Compatibility matcher ---------------- */
/* Commitment scale, mirrored in SQL match_score() (migration 0009).
   'unsure' sits mid-scale so "not sure yet" reads as broadly compatible. */
const INTENTION_RANK = { friends:0, casual:1, short:2, exploring:3, unsure:3, committed:4, marriage:5 };
/* Faiths that shouldn't grant a "shared faith" bonus on their own. */
const FAITH_SHY = new Set(["Prefer not to say","Other"]);

/* The "why you match" lines. Shared by both modes: locally we pair them with a
   locally-computed score, in Supabase mode with the server's authoritative one
   (public.match_score). Deliberately needs no age prefs, which get_matches()
   doesn't expose. */
function matchReasons(u, c){
  const reasons = [];
  const shared = (u.values||[]).filter(v => (c.values||[]).includes(v));
  if(shared.length) reasons.push({k:"Shared values", v: shared.slice(0,3).join(", ")});

  const gap = Math.abs((INTENTION_RANK[u.intention]??3) - (INTENTION_RANK[c.intention]??3));
  if(gap === 0) reasons.push({k:"Same intention", v: intentionLabel(c.intention)});

  if(u.faith === c.faith && !FAITH_SHY.has(u.faith) && u.faith) reasons.push({k:"Shared faith", v:c.faith});

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
  const gap = Math.abs((INTENTION_RANK[u.intention]??3) - (INTENTION_RANK[c.intention]??3));
  if(gap === 0){ pts += 20; }
  else if(gap === 1){ pts += 11; }

  // Faith — up to 15
  max += 15;
  if(u.faith === c.faith && !FAITH_SHY.has(u.faith)){ pts += 15; }
  else if(FAITH_SHY.has(u.faith) || FAITH_SHY.has(c.faith)){ pts += 8; }

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
                 counsellors:null, bookings:null, questions:null, slots:{}, cLoading:false, cErr:null,
                 listening:null, lLoading:false };
function resetRemote(){
  remote.matches=null; remote.rel=null; remote.cards={}; remote.msgs={}; remote.err=null;
  resetCounsellingCache();
  remote.listening=null;
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

/* ---- Listening Centre (a listening ear, not counselling) ---- */
function ensureListening(){
  if(!Backend.enabled()) return true;
  if(remote.listening !== null) return true;
  if(remote.lLoading) return false;
  remote.lLoading = true;
  Backend.listListeningRequests()
    .then(rows => { remote.listening = rows; })
    .catch(e => { remote.listening = []; console.warn("[listening]", e); })
    .finally(() => { remote.lLoading = false; render(); });
  return false;
}
function listeningList(){
  if(!Backend.enabled()) return (S.listening || []);
  return (remote.listening || []).map(r => ({
    id:r.id, phone:r.phone, note:r.note, time:r.preferred_time, status:r.status,
    ts:new Date(r.created_at).getTime(),
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

  // Membership gate — anyone can register and browse Home/Profile, but using any
  // feature requires an active membership subscription.
  const freeRoutes = ["home","profile","membership"];
  const gated = S.onboarded && !member() && !freeRoutes.includes(name) && !openRoutes.includes(name);

  const fn = routes[name] || routes.home;
  const screen = $("#screen");
  const out = gated ? membershipGate(name) : (fn(param) || { html:"" });
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

  // First-run onboarding tour — once, after onboarding, on the Home screen.
  if(name==="home" && S.onboarded && !S.tourSeen && !tourActive){
    setTimeout(()=>{ if(!S.tourSeen && parseHash().name==="home") startTour(); }, 350);
  }
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
          ["🌱","Counsellor-guided — support is here whenever you want it"],
          ["🛡️","Verified members. No anonymous messaging, ever"],
          ["💞","A few thoughtful matches, not endless swiping"],
          ["💍","A path from healthy dating toward marriage"],
        ].map(([i,t])=>`<div class="row"><span class="vi">${i}</span><span>${t}</span></div>`).join("")}
      </div>
    </div>
    <div class="stack">
      <button class="btn" data-act="begin">Get started — free to explore</button>
      <p class="center tiny" style="opacity:.85">Open to any adult ready for a healthy relationship. No invitation needed.</p>
      ${Backend.enabled()?`<button class="btn ghost" data-act="login" style="color:#fff">Log in</button>`:""}
      ${installPrompt?`<button class="btn ghost" data-act="install" style="color:#fff">📲 Install app</button>`:""}
    </div>
  </div>`,
  mount(root){
    $$("[data-act=begin]", root).forEach(b=> b.onclick = ()=> go("invite"));
    const li = $("[data-act=login]", root); if(li) li.onclick = ()=> go("login");
    const ins = $("[data-act=install]", root); if(ins) ins.onclick = doInstall;
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
  <div class="topbar"><button class="back" data-act="back">←</button><h2>Getting started</h2></div>
  <div class="pad stack">
    <div class="callout teal">💚 Heart2Heart is open to any adult who's emotionally ready to build a healthy, intentional relationship. No invitation needed — just register to explore. Counselling is offered and encouraged throughout.</div>
    <div class="card flat stack">
      <p class="tiny muted">Please confirm the following to continue:</p>
      ${[
        "I am 18 years or older.",
        "I'm emotionally ready to build a healthy relationship.",
        "I'm seeking a healthy, respectful relationship.",
      ].map((t,i)=>`<label class="row" style="align-items:flex-start"><input type="checkbox" class="elig" data-i="${i}" style="margin-top:3px"> <span class="tiny">${t}</span></label>`).join("")}
    </div>
    <button class="btn" id="verify" disabled>Continue</button>
    <p class="center tiny faint">Anyone can register and explore. A membership subscription unlocks the features when you're ready.</p>
  </div>`,
  mount(root){
    $(".back",root).onclick = ()=> go("welcome");
    const verify = $("#verify",root);
    const boxes = $$(".elig",root);
    const check = ()=>{ verify.disabled = !boxes.every(b=>b.checked); };
    boxes.forEach(b=> b.onchange = check);
    verify.onclick = ()=>{ pendingInvite = null; toast("Welcome to Heart2Heart 💚"); go("signup"); };
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
      <span style="display:block;font-size:13px;font-weight:600;color:var(--ink-soft);margin:0 0 6px 2px">Your core values — pick up to 5</span>
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
    ${!member()
      ? `<button class="card center" id="home-membership" style="width:100%;cursor:pointer;border:none">
          <div style="font-size:30px">💞</div>
          <b style="display:block;margin-top:4px">Your matches are ready</b>
          <p class="tiny faint" style="margin-top:4px">Choose a membership from ${esc(fmtKes(MEMBERSHIP_PLANS[0].price))}/mo to unlock matches and everything else.</p>
          <span class="chip" style="margin-top:10px">See membership →</span>
        </button>`
      : topMatch ? matchCardHTML(topMatch)
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
    const hm = $("#home-membership",root); if(hm) hm.onclick = ()=> go("membership");
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
  // Cap the curated set to the member's package (Basic: 5, Premium: unlimited).
  const cap = planLimit("matches");
  const pool = matchesList().filter(m => !inboundIds.has(m.c.id) && statusFor(m.c.id) !== "blocked");
  const list = unlimited(cap) ? pool : pool.slice(0, cap);
  const plan = membershipPlan();
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

    ${plan && !unlimited(cap)
      ? `<button class="callout gold" id="matches-upsell" style="width:100%;text-align:left;margin-top:16px;border:none;cursor:pointer">⭐ Your ${esc(plan.name)} plan shows up to ${cap} matches. <b>Upgrade to Premium</b> for unlimited →</button>`
      : `<div class="callout gold" style="margin-top:16px">🔄 New matches are released thoughtfully. Take your time with these first.</div>`}
  </div>`,
  mount(root){ wireMatchCards(root); const u=$("#matches-upsell",root); if(u) u.onclick=()=>go("membership"); }};
});

/* ---- Membership gate (shown in place of any feature until membership is active) ----
   Anyone can register and browse Home/Profile; using a feature needs a subscription. */
const FEATURE_LABELS = {
  matches:"Matches", match:"this profile", messages:"Messages", chat:"this conversation",
  learn:"the Learning Academy", course:"this course", lesson:"this lesson",
  wellness:"Wellness Tools", breathing:"Guided breathing", gratitude:"the Gratitude journal",
  checkin:"the Wellness check-in", listening:"the Listening Centre",
  counselling:"Counsellor Support", book:"session booking", ask:"Ask a question",
  webinars:"Webinars", groups:"Support groups",
  couple:"Couple Space", marriage:"Marriage Preparation", community:"Community Groups",
  cgroup:"this group", events:"Events", premium:"Premium",
};
/* Two package cards, reused by the gate and the membership screen. */
function membershipPlansHTML(currentId){
  return MEMBERSHIP_PLANS.map(p=>{
    const cur = p.id===currentId;
    return `<div class="card plan-card ${p.popular?"popular":""} ${cur?"active":""}" style="margin-bottom:12px;position:relative">
      ${p.popular?`<span class="chip gold" style="position:absolute;top:-9px;right:16px">Most popular</span>`:""}
      <div class="row between"><b style="font-size:17px">${esc(p.name)}</b>${cur?`<span class="chip">Current</span>`:""}</div>
      <div style="margin:4px 0 2px"><span style="font-size:24px;font-weight:800;color:var(--teal-700)">${esc(fmtKes(p.price))}</span><span class="tiny faint">/month</span></div>
      <p class="tiny faint">${esc(p.tagline)}</p>
      <div class="stack" style="margin-top:12px">${p.features.map(f=>`<div class="reason"><span class="k">✓</span><span class="tiny">${esc(f)}</span></div>`).join("")}</div>
      ${cur ? `<button class="btn secondary" disabled style="margin-top:14px">Your current plan</button>`
            : `<button class="btn ${p.popular?"":"secondary"}" data-plan="${p.id}" style="margin-top:14px">Choose ${esc(p.name)}</button>`}
    </div>`;
  }).join("");
}
function wirePlanButtons(root){
  $$("[data-plan]",root).forEach(b=> b.onclick = ()=> openMembershipSheet(b.dataset.plan));
}

function membershipGate(routeName){
  const label = FEATURE_LABELS[routeName] || "this feature";
  return {
  html:`
  <div class="pad">
    <div class="topbar" style="padding:0 0 4px"><button class="back" data-act="home">←</button><h2 class="grow">Members only</h2></div>
    <p class="muted tiny">You're registered and free to explore. To open <b>${esc(label)}</b> — and everything else — choose a monthly membership.</p>

    <div style="margin-top:16px">${membershipPlansHTML(null)}</div>

    <div class="callout gold" style="margin-top:2px;text-align:left">🔒 Prototype — no payment method is requested and no money is ever taken.</div>
    <button class="list-row" id="gate-crisis" style="width:100%;text-align:left;margin-top:12px">
      <div class="lico" style="background:var(--coral-50)">🆘</div>
      <div class="grow"><b>In crisis or unsafe right now?</b><div class="sub">Get immediate help &amp; helplines — always free</div></div>
      <div class="chev">›</div>
    </button>
  </div>`,
  mount(root){
    $("[data-act=home]",root).onclick = ()=> go("home");
    wirePlanButtons(root);
    const cr = $("#gate-crisis",root); if(cr) cr.onclick = openCrisisHelp;
  }};
}

function openMembershipSheet(planId){
  const p = planById(planId); if(!p) return;
  const box = sheet(`
    <div class="center"><div style="font-size:38px">💚</div>
      <h3 style="margin-top:6px">${esc(p.name)} — ${esc(fmtKes(p.price))}/month</h3>
      <p class="muted tiny" style="margin:8px 0 4px">Recurring monthly. Cancel anytime.</p>
      <div class="stack" style="text-align:left;margin:10px 0">${p.features.map(f=>`<div class="reason"><span class="k">✓</span><span class="tiny">${esc(f)}</span></div>`).join("")}</div>
      <div class="callout gold" style="text-align:left;margin:4px 0 0">🔒 This is a prototype — no payment method is requested and no money is taken.</div></div>
    <button class="btn" id="pay" style="margin-top:12px">Subscribe ${esc(fmtKes(p.price))}/mo (demo)</button>
    <button class="btn ghost" id="cancel" style="margin-top:6px">Not now</button>`);
  $("#cancel",box.el).onclick = box.close;
  $("#pay",box.el).onclick = ()=>{
    activateMembership(p.id);
    box.close();
    toast(`${p.name} membership active 💚`);
    render();
  };
}

/* Upsell shown when a package limit is reached. */
const LIMIT_NOUNS = { matches:"matches", webinars:"webinars", groups:"group memberships", counselling:"free counselling sessions" };
function openUpsell(key){
  const p = membershipPlan(), noun = LIMIT_NOUNS[key] || "items", lim = planLimit(key);
  const premium = planById("premium");
  const canUpgrade = p && p.id !== "premium" && premium.limits[key] > lim;
  const premAllow = unlimited(premium.limits[key]) ? "unlimited" : premium.limits[key];
  const line = canUpgrade
    ? `Upgrade to <b>Premium</b> for ${premAllow} ${esc(noun)}.`
    : `That's the monthly allowance included in your plan.`;
  const box = sheet(`
    <div class="center"><div style="font-size:36px">⭐</div>
      <h3 style="margin-top:6px">You've reached your ${esc(noun)} limit</h3>
      <p class="muted tiny" style="margin:8px 0 4px">Your ${esc(p?p.name:"")} plan includes ${unlimited(lim)?"unlimited":lim} ${esc(noun)} per month. ${line}</p></div>
    ${canUpgrade ? `<button class="btn" id="up">See Premium</button>
    <button class="btn ghost" id="no" style="margin-top:6px">Not now</button>`
    : `<button class="btn" id="no">Got it</button>`}`);
  $("#no",box.el).onclick = box.close;
  const up = $("#up",box.el); if(up) up.onclick = ()=>{ box.close(); go("membership"); };
}

/* ---- Membership screen (choose / switch / cancel a package) ---- */
route("membership", ()=>{
  const plan = membershipPlan();
  const since = plan ? fmtDate(new Date(membershipState().since || Date.now())) : "";
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Membership</h2></div>
  <div class="pad">
    ${plan ? `
    <div class="card" style="text-align:center;margin-top:8px">
      <div style="font-size:40px">💚</div>
      <h3 style="margin-top:6px">${esc(plan.name)} membership · active</h3>
      <p class="tiny faint" style="margin-top:4px">Active since ${esc(since)} · ${esc(fmtKes(plan.price))}/month, recurring</p>
    </div>
    <div class="sec-h"><h3>Your plan</h3></div>
    ${membershipPlansHTML(plan.id)}
    <div class="list-row" data-act="cancel" style="margin-top:4px"><div class="lico">⏸️</div><div class="grow"><b>Cancel membership</b><div class="sub">Keep browsing; features lock until you resubscribe</div></div><div class="chev">›</div></div>
    <p class="center tiny faint" style="margin-top:16px">Prototype — no payment is ever taken.</p>
    ` : `
    <p class="muted tiny">You're registered and free to explore. Choose a monthly membership to unlock the features. Every package recurs monthly — cancel anytime.</p>
    <div style="margin-top:16px">${membershipPlansHTML(null)}</div>
    <div class="callout gold" style="margin-top:2px;text-align:left">🔒 Prototype — no payment method is requested and no money is ever taken.</div>
    `}
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("home");
    wirePlanButtons(root);
    const cx = $("[data-act=cancel]",root); if(cx) cx.onclick = ()=>{
      const box = sheet(`<h3>Cancel membership?</h3><p class="muted tiny" style="margin:8px 0 14px">You'll keep your profile and can still browse, but features will lock until you resubscribe.</p>
        <button class="btn danger" id="yes">Yes, cancel</button><button class="btn ghost" id="no" style="margin-top:6px">Keep membership</button>`);
      $("#no",box.el).onclick = box.close;
      $("#yes",box.el).onclick = ()=>{ cancelMembership(); box.close(); toast("Membership cancelled"); go("home"); };
    };
  }};
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
  const connected = statusFor(id) === "connected";
  const box = sheet(`
    <h3>Options</h3>
    <p class="muted tiny" style="margin:6px 0 14px">You're always in control of who you connect with.</p>
    ${connected?`<button class="btn secondary" id="progress" style="margin-bottom:10px">📈 Report progress</button>`:""}
    <button class="btn secondary" id="report" style="margin-bottom:10px">🚩 Report ${esc(c.name)}</button>
    <button class="btn danger" id="block">🚫 Block ${esc(c.name)}</button>
    <button class="btn ghost" id="cancel" style="margin-top:6px">Cancel</button>`);
  $("#cancel",box.el).onclick = box.close;
  const pr = $("#progress",box.el); if(pr) pr.onclick = ()=>{ box.close(); openProgress(id); };
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

/* Client-side crisis screen — mirrors the SQL crisis_signal() so the SENDER
   gets immediate support even when the server-side flag/response is async or
   the moderation Edge Function isn't deployed. */
function looksLikeCrisis(t){ return /\b(kill myself|end it all|suicide|want to die|self.?harm)\b/i.test(t || ""); }

/* Immediate crisis support. Surfaced whenever distress is detected and reachable
   any time from the Wellness hub. This is the fast in-app response; the human
   response runs in parallel via the safety queue (see the crisis protocol). */
function openCrisisHelp(){
  const R = CRISIS_RESOURCES;
  const box = sheet(`
    <div class="row" style="gap:10px"><span style="font-size:24px">💚</span><h3 class="grow">You're not alone</h3></div>
    <div class="callout coral" style="text-align:left;margin:10px 0">⚠️ ${esc(R.boundary)}</div>
    <div class="stack">
      ${R.lines.map(l=>`<div class="list-row" style="cursor:${l.tel?'pointer':'default'}" ${l.tel?`data-tel="${esc(l.tel)}"`:""}>
        <div class="lico" style="background:${l.urgent?'var(--coral-50)':'var(--teal-50)'};color:${l.urgent?'var(--danger)':'var(--teal-700)'}">${l.tel?'📞':'🔗'}</div>
        <div class="grow"><b>${esc(l.label)}</b><div class="sub">${esc(l.value)}</div></div>
        ${l.tel?`<div class="chev">›</div>`:""}</div>`).join("")}
    </div>
    <p class="tiny muted" style="margin-top:12px">${esc(R.note)}</p>
    <button class="btn ghost" id="close" style="margin-top:10px">Close</button>`);
  $("#close",box.el).onclick = box.close;
  $$("[data-tel]",box.el).forEach(el => el.onclick = ()=>{ location.href = "tel:" + el.dataset.tel; });
}

/* Report progress after meeting / a successful match — shared, privately, with
   the counselling team so they can support the journey. */
function openProgress(id){
  const c = cardFor(id) || { name:"this connection" };
  const stages = [
    { v:"met",     t:"We've met in person" },
    { v:"going",   t:"It's going well" },
    { v:"slow",    t:"Taking it slowly" },
    { v:"paused",  t:"We've paused things" },
    { v:"ended",   t:"We've decided to end it" },
    { v:"support", t:"I'd like counsellor support" },
  ];
  const box = sheet(`
    <h3>How's it going with ${esc(c.name)}?</h3>
    <p class="muted tiny" style="margin:6px 0 12px">Shared privately with your counselling team to help support your journey. Only you can see this with them.</p>
    <div class="stack">${stages.map((s,i)=>`<label class="row"><input type="radio" name="pg" value="${i}"> <span class="tiny">${s.t}</span></label>`).join("")}</div>
    <textarea class="input" id="pnote" placeholder="Anything you'd like to add (optional)" style="margin-top:12px;min-height:60px"></textarea>
    <button class="btn" id="psend" style="margin-top:12px">Share update</button>`);
  $("#psend",box.el).onclick = ()=>{
    const picked = $('input[name=pg]:checked',box.el);
    if(!picked){ toast("Please choose an update"); return; }
    const s = stages[+picked.value];
    (S.progress ||= []).push({ ts:Date.now(), with:id, stage:s.v, label:s.t, note:$("#pnote",box.el).value.trim() });
    save();
    box.close();
    toast(s.v==="support" ? "Thank you — a counsellor will reach out." : "Update shared with your counselling team 💚");
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
          // distress in the message -> immediate support for the sender
          if((res && res.crisis) || looksLikeCrisis(text)) openCrisisHelp();
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
      if(looksLikeCrisis(text)) openCrisisHelp();
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
    ${featureRow("membership","💚","Membership", member()?`${membershipPlan().name} · ${fmtKes(membershipPlan().price)}/mo`:`Choose a plan from ${fmtKes(MEMBERSHIP_PLANS[0].price)}/mo`)}
    ${(()=>{ const c=cpl(); const sub = c.active ? `With ${esc(candidate(c.partnerId)?.name||"partner")} · ${daysTogether()} days` : "Unlocks when you both commit"; return featureRow("couple","💑","Couple Space",sub); })()}
    ${(()=>{ const p=marriageProgress(); const sub = p.done>0 ? `${p.done}/${p.total} conversations · ${p.pct}%` : "Stage 4 pathway"; return featureRow("marriage","💍","Marriage Preparation",sub); })()}
    ${(()=>{ const n=community().joined.length; const sub = n?`${n} group${n>1?"s":""} joined`:"Moderated groups by life stage"; return featureRow("community","🌍","Community Groups",sub); })()}
    ${(()=>{ const n=eventsState().rsvp.length; const sub = n?`${n} event${n>1?"s":""} · you're going`:"Mixers, seminars & retreats"; return featureRow("events","📅","Events",sub); })()}
    ${featureRow("counselling","🧑‍⚕️","Counsellor Support","Sessions, webinars & support groups")}
    ${featureRow("wellness","🧘","Wellness Tools","Mood, gratitude & reflection")}

    <div class="sec-h"><h3>Account</h3></div>
    <div class="list-row" data-act="edit"><div class="lico">✏️</div><div class="grow"><b>Edit profile & preferences</b></div><div class="chev">›</div></div>
    <div class="list-row" data-act="tour" style="margin-top:10px"><div class="lico">🧭</div><div class="grow"><b>App tour</b><div class="sub">Replay the quick intro walkthrough</div></div><div class="chev">›</div></div>
    <div class="list-row" data-act="dataprotection" style="margin-top:10px"><div class="lico">🔒</div><div class="grow"><b>Data protection & privacy</b><div class="sub">How we handle your data · your rights</div></div><div class="chev">›</div></div>
    ${installPrompt?`<div class="list-row" data-act="install" style="margin-top:10px"><div class="lico">📲</div><div class="grow"><b>Install app</b><div class="sub">Add Heart2Heart to your home screen</div></div><div class="chev">›</div></div>`:""}
    ${Backend.enabled()?`<div class="list-row" data-act="signout" style="margin-top:10px"><div class="lico">🚪</div><div class="grow"><b>Sign out</b><div class="sub">End your session on this device</div></div><div class="chev">›</div></div>`:""}
    <div class="list-row" data-act="reset" style="margin-top:10px"><div class="lico">🔄</div><div class="grow"><b>Reset demo</b><div class="sub">Clear all data and start over</div></div><div class="chev">›</div></div>
    <p class="center tiny faint" style="margin-top:20px">Heart2Heart Kenya · Healing first. Healthy relationships next.</p>
  </div>`,
  mount(root){
    wireFeatureRows(root);
    $("[data-act=edit]",root).onclick = ()=> go("signup");
    $("[data-act=tour]",root).onclick = ()=>{ go("home"); setTimeout(startTour, 400); };
    const insRow = $("[data-act=install]",root); if(insRow) insRow.onclick = doInstall;
    $("[data-act=dataprotection]",root).onclick = ()=>{
      const box = sheet(`<div class="row" style="gap:10px"><span style="font-size:24px">🔒</span><h3 class="grow">${esc(DATA_PROTECTION.title)}</h3></div>
        <div class="stack" style="margin:12px 0 4px">${DATA_PROTECTION.body.map(p=>`<p class="tiny muted">${esc(p)}</p>`).join("")}</div>
        <button class="btn" id="ok" style="margin-top:12px">Got it</button>`);
      $("#ok",box.el).onclick = box.close;
    };
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

    <button class="callout coral" id="crisis-help" style="width:100%;text-align:left;margin-top:12px;border:none;cursor:pointer">
      <span>🆘</span><span><b>Struggling right now?</b> Tap for immediate support and helplines.</span>
    </button>

    <div class="card" style="margin-top:12px">
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

    <div class="sec-h"><h3>Just need to be heard?</h3></div>
    <button class="list-row" data-go2="listening" style="width:100%;text-align:left">
      <div class="lico">👂</div>
      <div class="grow"><b>Listening Centre</b><div class="sub">A trained listener calls you back to simply listen — not counselling</div></div>
      <div class="chev">›</div>
    </button>

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
    $("#crisis-help",root).onclick = openCrisisHelp;

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
  const veryLow = avg < 2;   // a strong signal — offer immediate support
  const box = sheet(`
    <div class="center">
      <div style="font-size:40px">${avg>=4?"🌟":avg>=3?"🌤️":"💛"}</div>
      <h3 style="margin-top:6px">${msg[0]}</h3>
      <p class="muted" style="margin:8px 0 16px">${msg[1]}</p>
    </div>
    ${veryLow?`<button class="btn coral" id="help">🆘 Get support now</button>`:""}
    ${showBook?`<button class="btn ${veryLow?"secondary":""}" id="book" ${veryLow?'style="margin-top:8px"':''}>Talk to a counsellor</button>`:""}
    <button class="btn ${(showBook||veryLow)?"ghost":""}" id="done" ${(showBook||veryLow)?'style="margin-top:6px"':''}>Done</button>`);
  $("#done",box.el).onclick = ()=>{ box.close(); go("wellness"); };
  const bk = $("#book",box.el); if(bk) bk.onclick = ()=>{ box.close(); toast("Opening Counsellor Support…"); go("counselling"); };
  const hp = $("#help",box.el); if(hp) hp.onclick = ()=>{ box.close(); openCrisisHelp(); };
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

    <button class="list-row" data-go2="listening" style="width:100%;text-align:left;margin-top:12px">
      <div class="lico">👂</div>
      <div class="grow"><b>Listening Centre</b><div class="sub">Just want to be heard? A listener calls back — not counselling</div></div>
      <div class="chev">›</div>
    </button>

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
      // Enforce the package's monthly free-counselling-session allowance.
      if((bookingsList()||[]).length >= planLimit("counselling")){ openUpsell("counselling"); return; }
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
          if(looksLikeCrisis(t)) openCrisisHelp();
        }catch(e){
          toast(e.message || "Could not send"); btn.disabled = false; btn.textContent = "Send confidentially";
        }
        return;
      }

      const q = addQuestion(t);
      toast("Sent confidentially 💚");
      render();
      if(looksLikeCrisis(t)) openCrisisHelp();
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

/* ---- Listening Centre ---- */
const LISTEN_STATUS = { open:["gold","Waiting for a listener"], in_progress:["teal","A listener is reaching out"],
  completed:["","Completed"], cancelled:["","Cancelled"] };
route("listening", ()=>{
  if(!ensureListening()) return loadingScreen("Listening Centre");
  const list = listeningList().filter(r => r.status !== "cancelled");
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Listening Centre</h2></div>
  <div class="pad">
    <div class="card" style="background:linear-gradient(135deg,#12857f,#0a4b47);color:#fff">
      <div style="font-size:30px">👂</div>
      <b style="display:block;margin-top:6px;font-size:16px">Sometimes you just need to be heard</b>
      <p class="tiny" style="opacity:.92;margin-top:6px">Request a call and a trained listener will simply listen — no advice, no counselling, no judgement. Just space to say it out loud.</p>
    </div>

    <div class="callout teal" style="margin-top:12px">💚 This is a listening ear, not counselling. If you'd like professional guidance instead, <a href="#/counselling">Counsellor Support</a> is there for you.</div>
    <button class="callout coral" data-crisis style="width:100%;text-align:left;margin-top:8px;border:none;cursor:pointer"><span>🆘</span><span>In crisis or unsafe right now? <b>Get help now →</b></span></button>

    <div class="card" style="margin-top:12px">
      <label class="field"><span>Phone number to call you back</span>
        <input class="input" id="lphone" type="tel" inputmode="tel" placeholder="e.g. 0712 345 678"></label>
      <label class="field" style="margin-top:10px"><span>Best time to call (optional)</span>
        <input class="input" id="ltime" placeholder="e.g. weekday evenings"></label>
      <label class="field" style="margin-top:10px"><span>Anything you'd like your listener to know (optional)</span>
        <textarea class="input" id="lnote" placeholder="You don't have to explain — share only what you want to." style="min-height:64px"></textarea></label>
      <button class="btn" id="lsend" style="margin-top:12px">Request a listening call</button>
      <p class="tiny faint center" style="margin-top:8px">🔒 Private. Your number is shared only with the listener who calls you.</p>
    </div>

    <div class="sec-h"><h3>${list.length?"Your requests":"How it works"}</h3></div>
    ${list.length ? list.map(r=>{
      const st = LISTEN_STATUS[r.status] || ["","—"];
      return `<div class="card" style="margin-bottom:10px">
        <div class="row between"><b>📞 ${esc(r.phone||"Callback")}</b><span class="chip ${st[0]}">${st[1]}</span></div>
        ${r.time?`<div class="tiny faint" style="margin-top:4px">Preferred: ${esc(r.time)}</div>`:""}
        ${r.note?`<p class="tiny muted" style="margin-top:6px">"${esc(r.note)}"</p>`:""}
        <div class="tiny faint" style="margin-top:6px">${relTime(r.ts)}</div>
        ${r.status==="open"?`<button class="btn sm secondary" data-cancel-listen="${r.id}" style="margin-top:10px">Cancel request</button>`:""}
      </div>`;
    }).join("")
    : `<div class="card"><p class="tiny muted">Leave your number and, if you like, a note. A listener will call you back to simply listen — for as long as you need. It's free, confidential, and there's nothing you need to "fix" or explain.</p></div>`}
    <div style="height:8px"></div>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("wellness");
    const cr = $("[data-crisis]",root); if(cr) cr.onclick = openCrisisHelp;
    $("#lsend",root).onclick = async ()=>{
      const phone = $("#lphone",root).value.trim();
      const time = $("#ltime",root).value.trim();
      const note = $("#lnote",root).value.trim();
      if(phone.length < 7){ toast("Please add a phone number we can call you on"); return; }
      if(looksLikeCrisis(note)) openCrisisHelp();
      const btn = $("#lsend",root); btn.disabled = true; btn.textContent = "Sending…";
      if(Backend.enabled()){
        try{
          await Backend.requestListening(phone, note, time);
          remote.listening = null;               // refetch
          toast("Request sent — a listener will call you 💚");
          render();
        }catch(e){ toast(e.message || "Could not send"); btn.disabled=false; btn.textContent="Request a listening call"; }
        return;
      }
      (S.listening ||= []).unshift({ id:"l"+Date.now(), phone, note, time, status:"open", ts:Date.now() });
      save();
      toast("Request sent — a listener will call you 💚");
      render();
    };
    $$("[data-cancel-listen]",root).forEach(b=> b.onclick = async ()=>{
      const id = b.dataset.cancelListen;
      if(Backend.enabled()){
        try{ await Backend.cancelListening(id); remote.listening=null; }catch(e){ toast(e.message||"Could not cancel"); return; }
      } else {
        const r = (S.listening||[]).find(x=>x.id===id); if(r){ r.status="cancelled"; save(); }
      }
      toast("Request cancelled"); render();
    });
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
      if(now==="limit"){ openUpsell("webinars"); return; }
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
      if(now==="limit"){ openUpsell("groups"); return; }
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
    $$("[data-join]",root).forEach(b=> b.onclick = ()=>{ const now=toggleCommunity(b.dataset.join); if(now==="limit"){ openUpsell("groups"); return; } toast(now?"Joined 👋":"Left group"); render(); });
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
    $("[data-join]",root).onclick = ()=>{ if(toggleCommunity(id)==="limit"){ openUpsell("groups"); return; } render(); };
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

/* ================================ Premium ================================
   Superseded by membership packages (Basic/Premium) — redirect to Membership. */
route("premium", ()=> go("membership"));
route("premium-legacy", ()=>{
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
