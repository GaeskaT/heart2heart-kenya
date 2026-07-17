/* ============================================================================
   Heart2Heart Kenya — schema & RLS test suite
   ----------------------------------------------------------------------------
   Runs the REAL migrations (../migrations/*.sql) against an embedded Postgres
   (PGlite — no Docker, no Supabase account), then impersonates member /
   counsellor / admin / anon sessions and asserts the security policies hold.

   Run:  cd supabase/tests && npm install && npm test
   ============================================================================ */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const db = new PGlite();

/* ---------- tiny test harness ---------- */
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log("  \x1b[32m✓\x1b[0m " + name); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : "")); console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? `  (${detail})` : "")); }
}
async function denied(name, fn, match) {
  try { await fn(); ok(name, false, "expected an error, none thrown"); }
  catch (e) {
    const m = String(e.message || e);
    ok(name, !match || new RegExp(match, "i").test(m), m.split("\n")[0].slice(0, 90));
  }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

/* ---------- session impersonation ---------- */
async function actAs(uid, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [uid ? JSON.stringify({ sub: uid }) : ""]);
  await db.exec(`set role ${role}`);
}
async function actAsSuper() {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', '', false)");
}
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;

/* ---------- ids ---------- */
const U = {
  memberA:   "11111111-1111-4111-8111-111111111111",
  memberB:   "22222222-2222-4222-8222-222222222222",
  memberC:   "33333333-3333-4333-8333-333333333333",
  counsellor:"44444444-4444-4444-8444-444444444444",
  admin:     "55555555-5555-4555-8555-555555555555",
};

/* ---------- 1. apply shim + migrations ---------- */
section("Applying shim + migrations");
await db.exec(readFileSync(join(here, "supabase-shim.sql"), "utf8"));
console.log("  ✓ supabase-shim.sql");

const migDir = join(here, "..", "migrations");
const migrations = readdirSync(migDir).filter(f => f.endsWith(".sql")).sort();
for (const f of migrations) {
  let sql = readFileSync(join(migDir, f), "utf8");
  // PGlite ships Postgres 16, where gen_random_uuid() is core; the pgcrypto
  // extension isn't bundled. Only this line differs from what Supabase runs.
  sql = sql.replace(/create extension if not exists pgcrypto;/gi, "-- [test] pgcrypto: gen_random_uuid() is core in PG13+");
  try {
    await db.exec(sql);
    console.log(`  \x1b[32m✓\x1b[0m ${f}`);
  } catch (e) {
    console.log(`  \x1b[31m✗\x1b[0m ${f}\n     ${String(e.message).split("\n").join("\n     ")}`);
    console.log("\n\x1b[31mMigration failed — cannot continue.\x1b[0m");
    process.exit(1);
  }
}

/* ---------- 2. seed users ---------- */
section("Seeding test users");
await actAsSuper();
// NOTE: no trigger-disabling here. Seeding runs exactly as the Supabase SQL
// editor does (superuser, no JWT), which is precisely the path that used to
// silently revert role changes. If the bootstrap regresses, seeding breaks and
// the counsellor tests below fail loudly.
for (const [k, id] of Object.entries(U)) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${k}@test.local`]);
}
await db.exec(`
  update public.profiles set full_name='Member A', age=32, county='Nairobi', faith='Christian',
    intention='marriage', family_goal='Want children', "values"=array['Faith','Family','Growth'],
    age_min=28, age_max=45, onboarded=true, verified=true where id='${U.memberA}';
  update public.profiles set full_name='Member B', age=34, county='Nairobi', faith='Christian',
    intention='marriage', family_goal='Want children', "values"=array['Faith','Family','Kindness'],
    age_min=28, age_max=45, onboarded=true, verified=true where id='${U.memberB}';
  update public.profiles set full_name='Member C', age=30, county='Kisumu', faith='Muslim',
    intention='exploring', family_goal='Still deciding', "values"=array['Growth'],
    age_min=25, age_max=40, onboarded=true where id='${U.memberC}';
  update public.profiles set full_name='Dr Counsellor', role='counsellor', onboarded=true where id='${U.counsellor}';
  update public.profiles set full_name='Admin',        role='admin',      onboarded=true where id='${U.admin}';
  insert into public.counsellors (id, title, specialties) values ('${U.counsellor}','Clinical Psychologist', array['Trauma']);
`);
console.log("  ✓ 5 users (2 matched members, 1 unrelated member, counsellor, admin)");

// The bootstrap path itself is a regression test: an admin/SQL-editor session
// (superuser, no JWT) MUST be able to assign roles, or nobody can ever be made
// a counsellor or admin.
{
  const r = await rows(`select role from public.profiles where id=$1`, [U.counsellor]);
  ok("admin bootstrap works (SQL-editor session can assign roles)", r[0].role === "counsellor",
     `role=${r[0].role} — protect_profile_columns is over-clamping`);
}

/* ---------- 3. profiles: members must not see each other ---------- */
section("Profiles — privacy");
await actAs(U.memberA);
ok("member reads own profile", (await rows(`select id from public.profiles where id=$1`, [U.memberA])).length === 1);
ok("member CANNOT read another member's profile",
   (await rows(`select id from public.profiles where id=$1`, [U.memberB])).length === 0);
ok("member cannot enumerate the member base",
   (await rows(`select id from public.profiles`)).length === 1);

await db.exec(`update public.profiles set role='admin' where id='${U.memberA}'`);
await actAsSuper();
ok("member CANNOT escalate own role",
   (await rows(`select role from public.profiles where id=$1`, [U.memberA]))[0].role === "member");

await actAs(U.memberC);
await db.exec(`update public.profiles set verified=true where id='${U.memberC}'`);
await actAsSuper();
ok("member CANNOT self-verify",
   (await rows(`select verified from public.profiles where id=$1`, [U.memberC]))[0].verified === false);

/* ---------- 4. anon must be locked out ---------- */
section("Anonymous access");
await actAs(null, "anon");
// stricter than "no rows": anon has no grant on the table at all
await denied("anon CANNOT read profiles", () => db.query(`select id from public.profiles`), "permission denied");
await denied("anon CANNOT read messages", () => db.query(`select id from public.messages`), "permission denied");
await denied("anon CANNOT call get_matches()", () => db.query(`select * from public.get_matches(5)`), "permission denied");
await denied("anon CANNOT call express_interest()", () => db.query(`select public.express_interest($1)`, [U.memberB]), "permission denied");
await denied("anon CANNOT call activate_subscription()", () => db.query(`select public.activate_subscription($1,$2)`, [U.memberA, "x"]), "permission denied");

/* ---------- 5. matching ---------- */
section("Matching (server-side)");
await actAs(U.memberA);
const matches = await rows(`select id, full_name, score from public.get_matches(10)`);
ok("get_matches returns only other onboarded members", matches.length === 2, `got ${matches.length}`);
ok("get_matches excludes self", !matches.some(m => m.id === U.memberA));
ok("get_matches excludes staff (counsellor/admin never in the dating pool)",
   !matches.some(m => m.id === U.counsellor || m.id === U.admin));
const mB = matches.find(m => m.id === U.memberB);
const mC = matches.find(m => m.id === U.memberC);
ok("well-matched member scores higher than poorly-matched", mB && mC && mB.score > mC.score,
   mB && mC ? `B=${mB.score} C=${mC.score}` : "missing");
ok("score is a sane percentage", mB && mB.score > 0 && mB.score <= 100, mB && `${mB.score}`);

/* ---------- 6. interest → mutual consent ---------- */
section("Interest & mutual consent");
await actAs(U.memberA);
ok("first interest returns 'sent'", (await rows(`select public.express_interest($1) as r`, [U.memberB]))[0].r === "sent");
ok("no conversation exists yet", (await rows(`select id from public.conversations`)).length === 0);

await actAs(U.memberB);
ok("reciprocal interest returns 'connected'", (await rows(`select public.express_interest($1) as r`, [U.memberA]))[0].r === "connected");
ok("conversation now exists for B", (await rows(`select id from public.conversations`)).length === 1);
await actAs(U.memberA);
ok("conversation visible to A too", (await rows(`select id from public.conversations`)).length === 1);
await actAs(U.memberC);
ok("conversation NOT visible to uninvolved member", (await rows(`select id from public.conversations`)).length === 0);

/* ---------- 7. messaging + moderation ---------- */
section("Messaging & moderation");
await actAs(U.memberA);
const conv = (await rows(`select id from public.conversations`))[0].id;
const m1 = (await rows(`select public.send_message($1,$2) as r`, [conv, "Hello, lovely to connect."]))[0].r;
ok("participant can send a message", m1.moderation_status === "approved", JSON.stringify(m1));

const m2 = (await rows(`select public.send_message($1,$2) as r`, [conv, "you are an idiot"]))[0].r;
ok("abusive message is flagged by moderation", m2.moderation_status === "flagged", JSON.stringify(m2));

await db.query(`select public.send_message($1,$2)`, [conv, "honestly I want to die sometimes"]);
await actAsSuper();
const flags = await rows(`select signal, source from public.safety_flags`);
ok("crisis language raises a safety_flag", flags.length === 1 && flags[0].signal === "self_harm", JSON.stringify(flags));

await actAs(U.memberC);
await denied("non-participant CANNOT send into a conversation",
  () => db.query(`select public.send_message($1,$2)`, [conv, "let me in"]), "not a participant");
ok("non-participant reads no messages", (await rows(`select id from public.messages`)).length === 0);

await actAs(U.memberB);
ok("participant reads the conversation's messages", (await rows(`select id from public.messages`)).length === 3);

/* ---------- 8. blocking ---------- */
section("Blocking");
await actAs(U.memberA);
await db.query(`select public.block_user($1)`, [U.memberB]);
ok("block ends the connection",
   (await rows(`select status from public.connections`))[0].status === "ended");
await denied("blocked pair cannot message",
   () => db.query(`select public.send_message($1,$2)`, [conv, "hi again"]), "blocked");
const afterBlock = await rows(`select id from public.get_matches(10)`);
ok("blocked member disappears from matches", !afterBlock.some(m => m.id === U.memberB));
await db.query(`select public.unblock_user($1)`, [U.memberB]);

/* ---------- 9. counsellor scoping ---------- */
section("Counsellor least-privilege");
await actAs(U.counsellor);
ok("counsellor CANNOT read a non-client's profile",
   (await rows(`select id from public.profiles where id=$1`, [U.memberA])).length === 0);
ok("counsellor CANNOT read a non-client's readiness",
   (await rows(`select id from public.readiness_assessments where user_id=$1`, [U.memberA])).length === 0);

// give the counsellor a slot; member books it -> becomes a client
await actAsSuper();
await db.exec(`insert into public.availability_slots (counsellor_id, starts_at, ends_at)
               values ('${U.counsellor}', now() + interval '2 days', now() + interval '2 days 1 hour')`);
await actAs(U.memberA);
const slot = (await rows(`select id from public.availability_slots where booked=false`))[0].id;
const booking = (await rows(`select public.book_session($1,'individual','video') as id`, [slot]))[0].id;
ok("member can book an open slot", !!booking);
await denied("the same slot cannot be double-booked",
   () => db.query(`select public.book_session($1,'individual','video')`, [slot]), "slot_unavailable");

await actAs(U.counsellor);
ok("counsellor CAN now read their client's profile",
   (await rows(`select id from public.profiles where id=$1`, [U.memberA])).length === 1);
ok("counsellor still CANNOT read an unrelated member",
   (await rows(`select id from public.profiles where id=$1`, [U.memberC])).length === 0);

/* counsellor directory: members must see names without any blanket profile read */
await actAs(U.memberC);   // no relationship with the counsellor at all
{
  const dir = await rows(`select id, full_name, title from public.counsellor_directory()`);
  ok("member sees the counsellor directory with real names",
     dir.length === 1 && dir[0].full_name === "Dr Counsellor", JSON.stringify(dir));
  ok("...without gaining any profile read on them",
     (await rows(`select id from public.profiles where id=$1`, [U.counsellor])).length === 0);
}

/* ---------- 10. clinical notes ---------- */
section("Clinical notes confidentiality");
await actAs(U.counsellor);
await db.query(`insert into public.session_notes (booking_id, counsellor_id, body) values ($1,$2,$3)`,
  [booking, U.counsellor, "Private clinical impression."]);
ok("counsellor reads their own note", (await rows(`select id from public.session_notes`)).length === 1);
await actAs(U.memberA);
ok("the MEMBER cannot read notes written about them",
   (await rows(`select id from public.session_notes`)).length === 0);

/* ---------- 11. billing entitlement ---------- */
section("Billing & entitlement");
await actAs(U.memberA);
ok("member starts without premium", (await rows(`select public.has_premium() as p`))[0].p === false);
const pay = (await rows(`select public.create_payment_intent('premium','mpesa') as id`))[0].id;
ok("member can create a pending payment intent", !!pay);
ok("intent is pending, not paid",
   (await rows(`select status from public.payments where id=$1`, [pay]))[0].status === "pending");
await denied("member CANNOT grant themselves premium (activate_subscription)",
   () => db.query(`select public.activate_subscription($1,$2)`, [pay, "FAKE"]), "permission denied");
ok("still no premium after the attempt", (await rows(`select public.has_premium() as p`))[0].p === false);

// the webhook path (service_role) is the only way money grants access
await actAs(null, "service_role");
await db.query(`select public.activate_subscription($1,$2)`, [pay, "MPESA-RECEIPT-1"]);
await actAs(U.memberA);
ok("premium granted only via the server-side webhook path",
   (await rows(`select public.has_premium() as p`))[0].p === true);
ok("payment marked succeeded",
   (await rows(`select status from public.payments where id=$1`, [pay]))[0].status === "succeeded");
ok("member cannot see another member's payments",
   (await rows(`select id from public.payments`)).length === 1);

/* ---------- 12. community ---------- */
section("Community groups");
await actAsSuper();
await db.exec(`insert into public.community_groups (slug, name) values ('singles','Singles Preparing for Marriage')`);
const grp = (await rows(`select id from public.community_groups`))[0].id;

await actAs(U.memberA);
await denied("cannot post to a group you haven't joined",
   () => db.query(`select * from public.post_to_group($1,$2)`, [grp, "hello"]), "join_the_group_first");
await db.query(`select public.join_group($1)`, [grp]);
const post = (await rows(`select * from public.post_to_group($1,$2)`, [grp, "Grateful for this space."]))[0];
ok("member can post after joining", post.moderation_status === "approved");
ok("author sees the post", (await rows(`select id from public.community_posts`)).length === 1);

await actAs(U.memberC);
ok("non-member CANNOT read group posts", (await rows(`select id from public.community_posts`)).length === 0);

/* ---------- 13. events ---------- */
section("Events & capacity");
await actAsSuper();
await db.exec(`insert into public.events (title, starts_at, capacity) values ('Tiny Mixer', now() + interval '5 days', 1)`);
const ev = (await rows(`select id from public.events`))[0].id;
await actAs(U.memberA);
ok("first RSVP gets a place", (await rows(`select public.rsvp_event($1) as r`, [ev]))[0].r === "going");
await actAs(U.memberB);
ok("RSVP past capacity is waitlisted", (await rows(`select public.rsvp_event($1) as r`, [ev]))[0].r === "waitlist");

/* ---------- summary ---------- */
console.log(`\n${"─".repeat(52)}`);
console.log(`\x1b[1m${pass} passed, ${fail} failed\x1b[0m  (${migrations.length} migrations applied)`);
if (fail) {
  console.log("\n\x1b[31mFailures:\x1b[0m");
  failures.forEach(f => console.log("  • " + f));
}
await db.close();
process.exit(fail ? 1 : 0);
