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
  seededInbound:false,
};

let S = load();

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(raw) return Object.assign({}, structuredClone(DEFAULT_STATE), JSON.parse(raw));
  }catch(e){ /* ignore */ }
  return structuredClone(DEFAULT_STATE);
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
function reset(){ S = structuredClone(DEFAULT_STATE); save(); go("welcome"); }

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

/* ---------------- Compatibility matcher ---------------- */
const INTENTION_RANK = { exploring:0, committed:1, marriage:2 };

function scoreMatch(u, c){
  let pts = 0, max = 0; const reasons = [];

  // Shared values — up to 30
  max += 30;
  const shared = (u.values||[]).filter(v => c.values.includes(v));
  pts += Math.min(30, shared.length * 10);
  if(shared.length) reasons.push({k:"Shared values", v: shared.slice(0,3).join(", ")});

  // Relationship intention — up to 20
  max += 20;
  const gap = Math.abs((INTENTION_RANK[u.intention]??1) - (INTENTION_RANK[c.intention]??1));
  if(gap === 0){ pts += 20; reasons.push({k:"Same intention", v: intentionLabel(c.intention)}); }
  else if(gap === 1){ pts += 11; }

  // Faith — up to 15
  max += 15;
  const shy = v => v === "Prefer not to say";
  if(u.faith === c.faith && !shy(u.faith)){ pts += 15; reasons.push({k:"Shared faith", v:c.faith}); }
  else if(shy(u.faith) || shy(c.faith)){ pts += 8; }

  // Family goals — up to 15
  max += 15;
  const fg = familyAlign(u.familyGoal, c.familyGoal);
  pts += fg.pts;
  if(fg.pts >= 12) reasons.push({k:"Family goals align", v:c.familyGoal});

  // Mutual age fit — up to 10
  max += 10;
  const uWants = c.age >= (u.ageMin||18) && c.age <= (u.ageMax||99);
  const cWants = u.age >= c.prefs.ageMin && u.age <= c.prefs.ageMax;
  if(uWants && cWants){ pts += 10; }
  else if(uWants || cWants){ pts += 5; }

  // Location — up to 10
  max += 10;
  if(u.county === c.county){ pts += 10; reasons.push({k:"Near you", v:c.county}); }

  return { pct: Math.round((pts/max)*100), reasons };
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
  if(S.seededInbound) return;
  const top = rankedMatches().slice(0,5).map(m=>m.c.id);
  ["c1","c6"].forEach(id=>{ if(top.includes(id)) conn(id).status = "they_sent"; });
  // fallback: if neither in top, use the two best
  if(!top.includes("c1") && !top.includes("c6")){
    top.slice(0,2).forEach(id=> conn(id).status = "they_sent");
  }
  S.seededInbound = true; save();
}

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

  // Onboarding guard
  const openRoutes = ["welcome","invite","signup","readiness","conduct","result"];
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
  const total = Object.values(S.connections).reduce((n,c)=> n + (c.unread||0), 0);
  const pend  = Object.values(S.connections).filter(c=>c.status==="they_sent").length;
  const b = $("#msg-badge");
  const count = total + pend;
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
    </div>
  </div>`,
  mount(root){
    $$("[data-act=begin]", root).forEach(b=> b.onclick = ()=> go("invite"));
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
    verify.onclick = ()=>{ toast("Invitation verified ✓"); go("signup"); };
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
    $("#continue",root).onclick = ()=>{
      const g = id => $("#"+id,root);
      const values = $$("#values .chip.on",root).map(c=>c.dataset.v);
      const name = g("name").value.trim();
      const age  = +g("age").value;
      if(name.length<2){ toast("Please add your name"); return; }
      if(!(age>=18)){ toast("Please add a valid age (18+)"); return; }
      if(values.length<3){ toast("Pick at least 3 values"); return; }
      S.user = {
        name, age, gender:g("gender").value, county:g("county").value,
        faith:g("faith").value, education:g("education").value, career:g("career").value.trim(),
        intention:g("intention").value, familyGoal:g("familyGoal").value, values,
        ageMin:+g("ageMin").value||18, ageMax:+g("ageMax").value||99,
        bio:g("bio").value.trim(),
        color:"#0f6f6a", initials:initials(name),
      };
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
      else { computeReadiness(); go("conduct"); }
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
  const topMatch = rankedMatches()[0];
  const inbound = Object.entries(S.connections).filter(([,c])=>c.status==="they_sent").length;
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
    ${topMatch ? matchCardHTML(topMatch) : ""}

    <div class="sec-h"><h3>Keep growing</h3></div>
    ${(()=>{ const t=academyTotals(); const sub = t.done>0 ? `${t.done}/${t.total} lessons · ${t.pct}% complete` : "Courses on healthy love & communication"; return featureRow("learn","📚","Learning Academy",sub); })()}
    ${(()=>{ const m=moodToday(); const sub = m ? `Today: ${MOODS.find(x=>x.score===m.score)?.emoji} ${MOODS.find(x=>x.score===m.score)?.label} · tap to check in` : "Mood, gratitude, breathing & reflection"; return featureRow("wellness","🧘","Wellness Tools",sub); })()}
    ${featureRow("feature/counsellor","🧑‍⚕️","Counsellor Support","Book a session, ask, or join a group")}
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
  const c = m.c; const st = conn(c.id).status;
  const cta = st==="connected" ? `<span class="chip">Connected 💬</span>`
            : st==="you_sent"  ? `<span class="chip gold">Interest sent ⏳</span>`
            : st==="they_sent" ? `<span class="chip coral">Interested in you 💌</span>`
            : "";
  return `
  <div class="card match" data-match="${c.id}">
    <div class="score"><span class="n">${m.pct}%</span> match</div>
    <div class="top">
      ${avatar(c.name,c.color,"lg")}
      <div class="grow">
        <div class="row" style="gap:7px"><h3>${esc(c.name)}, ${c.age}</h3> ${c.verified?`<span class="verified">✓ Verified</span>`:""}</div>
        <p class="tiny faint">${esc(c.career)} · ${esc(c.county)}</p>
        <div style="margin-top:6px">${cta}</div>
      </div>
    </div>
    <div class="body">
      <div class="chips">${c.values.slice(0,3).map(v=>`<span class="chip">${v}</span>`).join("")}
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
  const list = rankedMatches().slice(0,4);   // "a limited number of carefully selected matches"
  const inbound = rankedMatches().filter(m=>conn(m.c.id).status==="they_sent");
  return {
  html:`
  <div class="pad">
    <h1>Your matches</h1>
    <p class="muted tiny" style="margin-top:4px">A few carefully chosen people — not an endless feed. Curated on your values, goals and readiness.</p>

    ${inbound.length ? `<div class="sec-h"><h3>Interested in you</h3></div>
      ${inbound.map(matchCardHTML).join("")}` : ""}

    <div class="sec-h"><h3>Selected for you</h3></div>
    ${list.map(matchCardHTML).join("")}

    <div class="callout gold" style="margin-top:16px">🔄 New matches are released thoughtfully. Take your time with these first.</div>
  </div>`,
  mount(root){ wireMatchCards(root); }};
});

/* ---- Match detail ---- */
route("match", (id)=>{
  const c = candidate(id); if(!c) return go("matches");
  const m = { c, ...scoreMatch(S.user, c) };
  const st = conn(id).status;
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2 class="grow">Profile</h2>
    <button class="back" data-act="more">⋯</button></div>
  <div class="pad stack center">
    ${avatar(c.name,c.color,"xl")}
    <div>
      <div class="row" style="justify-content:center;gap:8px"><h2>${esc(c.name)}, ${c.age}</h2>${c.verified?`<span class="verified">✓ Verified</span>`:""}</div>
      <p class="muted tiny">${esc(c.career)} · ${esc(c.county)}</p>
    </div>
    <div class="chip" style="background:var(--teal-700);color:#fff">${m.pct}% compatibility</div>

    <div class="card" style="text-align:left">
      <p style="font-style:italic">"${esc(c.bio)}"</p>
    </div>

    <div class="card" style="text-align:left">
      <div class="kv"><span class="k">Intention</span><span>${intentionLabel(c.intention)}</span></div>
      <div class="kv"><span class="k">Faith</span><span>${esc(c.faith)}</span></div>
      <div class="kv"><span class="k">Education</span><span>${esc(c.education)}</span></div>
      <div class="kv"><span class="k">Family goals</span><span>${esc(c.familyGoal)}</span></div>
    </div>

    <div class="card" style="text-align:left">
      <p class="tiny faint" style="margin-bottom:8px">VALUES</p>
      <div class="chips">${c.values.map(v=>`<span class="chip ${S.user.values.includes(v)?"":"select"}">${v}</span>`).join("")}</div>
    </div>

    <div class="card" style="text-align:left">
      <p class="tiny faint" style="margin-bottom:8px">WHY YOU MATCH</p>
      <div class="stack">${m.reasons.map(r=>`<div class="reason"><span class="k">✓</span><span><b>${r.k}:</b> ${esc(r.v)}</span></div>`).join("")}</div>
    </div>

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
  const st = conn(id).status;
  if(st==="connected") return `<button class="btn" data-cta="chat">💬 Open conversation</button>`;
  if(st==="you_sent")  return `<button class="btn" disabled>Interest sent — awaiting reply ⏳</button>`;
  if(st==="they_sent") return `<button class="btn coral" data-cta="accept">💌 Accept & connect</button>`;
  if(st==="blocked")   return `<button class="btn danger" data-cta="unblock">Unblock</button>`;
  return `<button class="btn" data-cta="express">💚 Express interest</button>`;
}
function wireConnectCTA(root, id){
  const btn = $("[data-cta]",root); if(!btn) return;
  const act = btn.dataset.cta;
  btn.onclick = ()=>{
    const c = conn(id);
    if(act==="chat"){ go("chat", id); return; }
    if(act==="express"){
      c.status = "you_sent"; save(); toast(`Interest sent to ${candidate(id).name}`);
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
  const c = candidate(id);
  const box = sheet(`
    <h3>Safety & privacy</h3>
    <p class="muted tiny" style="margin:6px 0 14px">You're always in control of who you connect with.</p>
    <button class="btn secondary" id="report" style="margin-bottom:10px">🚩 Report ${esc(c.name)}</button>
    <button class="btn danger" id="block">🚫 Block ${esc(c.name)}</button>
    <button class="btn ghost" id="cancel" style="margin-top:6px">Cancel</button>`);
  $("#cancel",box.el).onclick = box.close;
  $("#report",box.el).onclick = ()=>{ box.close(); openReport(id); };
  $("#block",box.el).onclick = ()=>{
    conn(id).status = "blocked"; save(); box.close();
    toast(`${c.name} blocked`); updateBadge();
    if(parseHash().name==="chat") go("messages"); else render();
  };
}
function openReport(id){
  const c = candidate(id);
  const reasons = ["Disrespectful or abusive language","Made me feel unsafe","Fake or misleading profile","Pushing for something I didn't consent to","Other concern"];
  const box = sheet(`
    <h3>Report ${esc(c.name)}</h3>
    <p class="muted tiny" style="margin:6px 0 12px">Reports are confidential and reviewed by our counselling team. AI moderation flags abusive language automatically.</p>
    <div class="stack">${reasons.map((r,i)=>`<label class="row"><input type="radio" name="rr" value="${i}"> <span class="tiny">${r}</span></label>`).join("")}</div>
    <button class="btn coral" id="send" style="margin-top:14px">Submit report</button>`);
  $("#send",box.el).onclick = ()=>{
    if(!$('input[name=rr]:checked',box.el)){ toast("Please choose a reason"); return; }
    box.close(); toast("Report submitted — thank you. Our team will review it.");
  };
}

/* ---- Messages list ---- */
route("messages", ()=>{
  const items = Object.entries(S.connections)
    .filter(([,c])=> c.status==="connected" || c.status==="they_sent")
    .map(([id,c])=>({ id, c, cand:candidate(id) }))
    .filter(x=>x.cand);
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
route("chat", (id)=>{
  const c = candidate(id); if(!c) return go("messages");
  const cn = conn(id);
  if(cn.status!=="connected"){ return go("match", id); }
  cn.unread = 0; save(); updateBadge();
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
      ${cn.messages.map(bubbleHTML).join("")}
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
    ${featureRow("feature/couple","💑","Couple Space","Unlocks when you both commit")}
    ${featureRow("feature/marriage","💍","Marriage Preparation","Stage 4 pathway")}
    ${featureRow("feature/community","🌍","Community Groups","Moderated groups by life stage")}
    ${featureRow("feature/events","📅","Events","Mixers, seminars & retreats")}
    ${featureRow("feature/counsellor","🧑‍⚕️","Counsellor Support","Sessions, webinars & support groups")}
    ${featureRow("wellness","🧘","Wellness Tools","Mood, gratitude & reflection")}
    ${featureRow("feature/premium","⭐","Premium","Unlimited counselling & coaching")}

    <div class="sec-h"><h3>Account</h3></div>
    <div class="list-row" data-act="edit"><div class="lico">✏️</div><div class="grow"><b>Edit profile & preferences</b></div><div class="chev">›</div></div>
    <div class="list-row" data-act="reset" style="margin-top:10px"><div class="lico">🔄</div><div class="grow"><b>Reset demo</b><div class="sub">Clear all data and start over</div></div><div class="chev">›</div></div>
    <p class="center tiny faint" style="margin-top:20px">Heart2Heart Kenya · Healing first. Healthy relationships next.</p>
  </div>`,
  mount(root){
    wireFeatureRows(root);
    $("[data-act=edit]",root).onclick = ()=> go("signup");
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
  const bk = $("#book",box.el); if(bk) bk.onclick = ()=>{ box.close(); toast("Opening Counsellor Support…"); go("feature","counsellor"); };
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

const FEATURES = {
  couple:   ["💑","Couple Space","A private shared space that unlocks once you and a partner mutually commit to a relationship.",
             ["Shared journal","Couple goals","Anniversary reminders","Budget planner","Reflection journal","Weekly check-ins","Date planner"]],
  marriage: ["💍","Marriage Preparation","When you're both ready, unlock a guided pathway toward marriage.",
             ["Financial planning","Conflict management","Family expectations","Parenting discussions","Sexual health education","Legal aspects of marriage","Wedding planning checklist"]],
  community:["🌍","Community Groups","Moderated discussion groups to grow alongside people in a similar season.",
             ["Singles preparing for marriage","Young professionals","Widows & widowers","Single parents","Retirement relationships","Faith-based enrichment"]],
  events:   ["📅","Events","Meet safely in real life at counsellor-hosted gatherings.",
             ["Singles mixers","Relationship seminars","Premarital workshops","Marriage enrichment retreats","Community service days"]],
  counsellor:["🧑‍⚕️","Counsellor Support","Professional support is with you throughout the journey.",
             ["Book refresher sessions","Video counselling","Attend webinars","Join support groups","Ask confidential questions","Educational resources"]],
  premium:  ["⭐","Premium","Go deeper with unlimited professional support.",
             ["Unlimited counsellor messaging","Video counselling","Compatibility insights","Exclusive webinars","Couples coaching","Advanced courses"]],
};
route("feature", (key)=>{
  const f = FEATURES[key]; if(!f) return go("home");
  return {
  html:`
  <div class="topbar"><button class="back" data-act="back">←</button><h2>${f[1]}</h2></div>
  <div class="pad stack center">
    <div style="font-size:52px">${f[0]}</div>
    <h2>${f[1]}</h2>
    <p class="muted" style="max-width:34ch;margin:0 auto">${f[2]}</p>
    ${key==="premium"?`<div class="chip gold">Premium</div>`:""}
    <div class="card" style="text-align:left;width:100%">
      <p class="tiny faint" style="margin-bottom:10px">WHAT'S INSIDE</p>
      <div class="stack">${f[3].map(x=>`<div class="row"><span class="k" style="color:var(--teal-600);font-weight:800">•</span><span>${x}</span></div>`).join("")}</div>
    </div>
    <div class="callout teal" style="text-align:left">🚧 This area is part of the full experience and is on the roadmap after the core-journey release.</div>
    <button class="btn" id="notify">Notify me when it's ready</button>
  </div>`,
  mount(root){
    $("[data-act=back]",root).onclick = ()=> history.length>1 ? history.back() : go("home");
    $("#notify",root).onclick = ()=> toast("We'll let you know 💚");
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
render();
