/* ============================================================================
   Creates two real, fully-onboarded members on the Supabase project and
   connects them (mutual consent) with a couple of messages — so the app UI can
   be logged into and exercised against genuine server data.

   Run:  cd supabase/tests && node seed-demo-pair.mjs
   Prints the credentials to log in with.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const local = new URL("./local-project.json", import.meta.url);
if (!existsSync(local)) { console.error("Create supabase/tests/local-project.json first (see README)."); process.exit(1); }
const { url, anonKey } = JSON.parse(readFileSync(local, "utf8"));

const stamp = Date.now().toString().slice(-6);
const pw = "Test-passw0rd!";
const emailA = `amina.${stamp}@h2h-demo.local`;
const emailB = `brian.${stamp}@h2h-demo.local`;
const mk = () => createClient(url, anonKey, { auth: { persistSession: false } });

async function makeMember(client, email, profile) {
  const { data, error } = await client.auth.signUp({ email, password: pw });
  if (error) throw new Error(`${email}: ${error.message}`);
  if (!data.session) throw new Error("No session — turn OFF 'Confirm email' in Auth → Providers → Email");
  const id = data.user.id;
  const { error: pe } = await client.from("profiles").update({ ...profile, onboarded: true }).eq("id", id);
  if (pe) throw pe;
  await client.from("readiness_assessments").insert({
    user_id: id, answers: {}, dimension_scores: { emotional: 80, communication: 75 }, overall: 78,
  });
  await client.from("consents").insert({ user_id: id, policy_version: "v1", code_of_conduct: true, data_processing: true });
  return id;
}

const A = mk(), B = mk();

const idA = await makeMember(A, emailA, {
  full_name: "Amina", age: 31, gender: "Woman", county: "Nairobi", faith: "Christian",
  education: "Postgraduate", career: "Public health officer", intention: "marriage",
  family_goal: "Want children", values: ["Faith", "Family", "Growth", "Kindness"],
  age_min: 30, age_max: 44, bio: "Rebuilt myself after a hard season. I love calm mornings and honest conversation.",
  avatar_color: "#0f6f6a",
});
console.log(`✓ member A created  ${emailA}`);

const idB = await makeMember(B, emailB, {
  full_name: "Brian", age: 35, gender: "Man", county: "Nairobi", faith: "Christian",
  education: "Undergraduate", career: "Agribusiness owner", intention: "marriage",
  family_goal: "Want children", values: ["Faith", "Family", "Ambition", "Kindness"],
  age_min: 28, age_max: 40, bio: "Patient, faith-centred, ready to build something lasting.",
  avatar_color: "#6b4a72",
});
console.log(`✓ member B created  ${emailB}`);

/* B expresses interest in A, but A has NOT reciprocated -> A sees a pending
   request to accept in the UI. */
const { data: r1 } = await B.rpc("express_interest", { target: idA });
console.log(`✓ B -> A interest: ${r1}`);

/* Give A a second person to browse: C, unconnected. */
const C = mk();
const emailC = `grace.${stamp}@h2h-demo.local`;
await makeMember(C, emailC, {
  full_name: "Grace", age: 30, gender: "Woman", county: "Kiambu", faith: "Christian",
  education: "Undergraduate", career: "Nurse", intention: "committed",
  family_goal: "Want children", values: ["Service", "Faith", "Growth"],
  age_min: 29, age_max: 41, bio: "I care for others all day; I'd love someone who notices me too.",
  avatar_color: "#cc5b8a",
});
console.log(`✓ member C created  ${emailC}`);

console.log(`\n────────────────────────────────────────────`);
console.log(`Log into the app as member A:`);
console.log(`  email:    ${emailA}`);
console.log(`  password: ${pw}`);
console.log(`\nA should see: a pending request from Brian, and Grace among matches.`);
