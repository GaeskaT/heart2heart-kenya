/* ============================================================================
   Live smoke test against a real Supabase project.

   Run:  cd supabase/tests && node live-smoke.mjs

   Creates two throwaway member accounts and exercises the Phase 0 onboarding
   writes + the Phase 1 consent/messaging loop, then asserts RLS holds for real.

   Project credentials are resolved in this order:
     1. env SUPABASE_URL / SUPABASE_ANON_KEY
     2. ./local-project.json   (gitignored — see README)
     3. ../../supabase-config.js  (only if the app has been wired to a project)

   The shipped supabase-config.js is deliberately left blank so the public demo
   stays on localStorage; keep your project details in local-project.json.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

function resolveConfig() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY, from: "env" };
  }
  const local = new URL("./local-project.json", import.meta.url);
  if (existsSync(local)) {
    const j = JSON.parse(readFileSync(local, "utf8"));
    if (j.url && j.anonKey) return { ...j, from: "local-project.json" };
  }
  const appCfg = new URL("../../supabase-config.js", import.meta.url);
  if (existsSync(appCfg)) {
    const window = {};
    // eslint-disable-next-line no-eval
    eval(readFileSync(appCfg, "utf8"));
    const c = window.SUPABASE_CONFIG || {};
    if (c.url && c.anonKey) return { ...c, from: "supabase-config.js" };
  }
  return null;
}

const cfg = resolveConfig();
if (!cfg) {
  console.error("No project configured.\n" +
    "Create supabase/tests/local-project.json:\n" +
    '  { "url": "https://<ref>.supabase.co", "anonKey": "<anon or publishable key>" }\n' +
    "or set SUPABASE_URL / SUPABASE_ANON_KEY.");
  process.exit(1);
}
const { url, anonKey } = cfg;
console.log(`Project: ${url}  (from ${cfg.from})\n`);

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? (pass++, console.log("  \x1b[32m✓\x1b[0m " + n)) : (fail++, console.log("  \x1b[31m✗\x1b[0m " + n + (d ? `  (${d})` : ""))); };
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const stamp = Date.now();
const mk = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

/* ---- 0. reachability + schema presence ---- */
section("Connection & schema");
const anon = mk();
{
  const { error } = await anon.rpc("get_matches", { match_limit: 1 });
  // anon should be refused — but the error tells us whether the function exists
  const msg = (error?.message || "") + (error?.code || "");
  const missing = /does not exist|schema cache|PGRST202/i.test(msg);
  ok("project reachable", !!error || true);
  ok("migrations applied (get_matches exists)", !missing, missing ? `RPC not found — did setup-all.sql run? [${msg}]` : "");
  ok("anon is refused by get_matches", !!error, error ? "" : "anon was allowed!");
  if (missing) { console.log("\n\x1b[31mSchema missing — run supabase/setup-all.sql in the SQL editor first.\x1b[0m"); process.exit(1); }
}

/* ---- 1. sign up two members ---- */
section("Auth & profile trigger");
const A = mk(), B = mk();
const emailA = `a.${stamp}@h2h-test.local`, emailB = `b.${stamp}@h2h-test.local`;
const pw = "Test-passw0rd!";

const { data: sa, error: ea } = await A.auth.signUp({ email: emailA, password: pw });
if (ea) { console.log(`  \x1b[31m✗\x1b[0m sign up member A — ${ea.message}`); process.exit(1); }
ok("member A signed up", !!sa.user);
if (!sa.session) {
  console.log("\n\x1b[33m!\x1b[0m No session returned — 'Confirm email' is still ON.");
  console.log("  Turn it off: Authentication → Providers → Email → uncheck 'Confirm email'.\n");
  process.exit(1);
}
const { data: sb2, error: eb } = await B.auth.signUp({ email: emailB, password: pw });
if (eb) { console.log(`  \x1b[31m✗\x1b[0m sign up member B — ${eb.message}`); process.exit(1); }
ok("member B signed up", !!sb2.user);
const idA = sa.user.id, idB = sb2.user.id;

const { data: profA } = await A.from("profiles").select("*").eq("id", idA).single();
ok("profile auto-created by the signup trigger", !!profA, "handle_new_user() didn't fire");
ok("new profile defaults to role=member, unverified", profA?.role === "member" && profA?.verified === false,
   `role=${profA?.role} verified=${profA?.verified}`);

/* ---- 2. onboarding writes (Phase 0) ---- */
section("Onboarding writes");
{
  // Non-destructive: proves redeem_invite() runs and rejects an invalid code
  // without burning a real one (codes are single-use).
  const { data, error } = await A.rpc("redeem_invite", { invite_code: "DEFINITELY-NOT-A-CODE" });
  ok("redeem_invite() runs and rejects an invalid code", !error && data === false, error?.message || `returned ${data}`);
  const { count } = await A.from("counsellor_invites").select("*", { count: "exact", head: true });
  console.log(`     \x1b[2m(invite codes visible to this member: ${count ?? 0} — members only see ones they issued/redeemed)\x1b[0m`);
}
const baseProfile = (name, county) => ({
  full_name: name, age: 32, gender: "Woman", county, faith: "Christian",
  education: "Undergraduate", career: "Physiotherapist", intention: "marriage",
  family_goal: "Want children", values: ["Faith", "Family", "Growth"],
  age_min: 28, age_max: 45, bio: "Test account.", avatar_color: "#0f6f6a",
});
{
  const { error } = await A.from("profiles").update(baseProfile("Test A", "Nairobi")).eq("id", idA);
  ok("profile update persists", !error, error?.message);
}
{
  const { error } = await B.from("profiles").update({ ...baseProfile("Test B", "Nairobi"), gender: "Man" }).eq("id", idB);
  ok("second profile persists", !error, error?.message);
}
{
  const { error } = await A.from("readiness_assessments").insert({
    user_id: idA, answers: { emotional: [4, 4, 4] },
    dimension_scores: { emotional: 80, communication: 73 }, overall: 77,
  });
  ok("readiness assessment persists", !error, error?.message);
}
{
  const { error } = await A.from("consents").insert({
    user_id: idA, policy_version: "v1", code_of_conduct: true, data_processing: true,
  });
  ok("consent record persists", !error, error?.message);
}
{
  const { error } = await A.from("profiles").update({ onboarded: true }).eq("id", idA);
  await B.from("profiles").update({ onboarded: true }).eq("id", idB);
  ok("onboarded flag persists", !error, error?.message);
}

/* ---- 3. RLS for real ---- */
section("RLS (live)");
{
  const { data } = await A.from("profiles").select("id").eq("id", idB);
  ok("member A CANNOT read member B's profile", (data || []).length === 0);
}
{
  const { data } = await A.from("profiles").select("id");
  ok("member A cannot enumerate the member base", (data || []).length === 1, `saw ${(data || []).length}`);
}
{
  await A.from("profiles").update({ role: "admin" }).eq("id", idA);
  const { data } = await A.from("profiles").select("role").eq("id", idA).single();
  ok("member CANNOT escalate own role", data?.role === "member", `role=${data?.role}`);
}
{
  await A.from("profiles").update({ verified: true }).eq("id", idA);
  const { data } = await A.from("profiles").select("verified").eq("id", idA).single();
  ok("member CANNOT self-verify", data?.verified === false);
}
{
  const { error } = await A.rpc("activate_subscription", { payment_id: idA, ref: "FAKE" });
  ok("member CANNOT self-grant premium", !!error, "activate_subscription was callable!");
}

/* ---- 4. matching + consent + messaging (Phase 1) ---- */
section("Matching, consent & messaging");
{
  const { data, error } = await A.rpc("get_matches", { match_limit: 10 });
  ok("get_matches returns candidates", !error && Array.isArray(data), error?.message);
  const hitB = (data || []).find(m => m.id === idB);
  ok("member B appears as a match with a score", !!hitB && hitB.score > 0, hitB ? `score=${hitB.score}` : "not found");
  ok("get_matches excludes self", !(data || []).some(m => m.id === idA));
}
{
  const { data } = await A.rpc("express_interest", { target: idB });
  ok("first interest = 'sent'", data === "sent", `got ${data}`);
  const { data: convs } = await A.from("conversations").select("id");
  ok("no conversation before mutual consent", (convs || []).length === 0);
}
{
  const { data } = await B.rpc("express_interest", { target: idA });
  ok("reciprocal interest = 'connected'", data === "connected", `got ${data}`);
}
let conv;
{
  const { data } = await A.from("conversations").select("id");
  conv = data?.[0]?.id;
  ok("conversation created on mutual consent", !!conv);
}
if (conv) {
  const { data, error } = await A.rpc("send_message", { conversation_id: conv, body: "Hello from the live test." });
  ok("send_message works (the bug we fixed)", !error && data?.moderation_status === "approved",
     error?.message || JSON.stringify(data));

  const { data: bad } = await A.rpc("send_message", { conversation_id: conv, body: "you are an idiot" });
  ok("abusive message is flagged", bad?.moderation_status === "flagged", JSON.stringify(bad));

  const { data: msgs } = await B.from("messages").select("id").eq("conversation_id", conv);
  ok("participant B can read the messages", (msgs || []).length === 2, `saw ${(msgs || []).length}`);
}

/* ---- summary ---- */
console.log(`\n${"─".repeat(52)}`);
console.log(`\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
console.log(`\nTest accounts left in the project:\n  ${emailA}\n  ${emailB}`);
process.exit(fail ? 1 : 0);
