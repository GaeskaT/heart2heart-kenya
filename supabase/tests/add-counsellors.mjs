/* ============================================================================
   Creates auth accounts for a batch of counsellors on the live project, then
   prints the SQL an ADMIN must run to promote them + publish availability.
   (A member cannot self-promote — role changes are admin-only by design.)

   Run:  cd supabase/tests && node add-counsellors.mjs
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const local = new URL("./local-project.json", import.meta.url);
if (!existsSync(local)) { console.error("Create supabase/tests/local-project.json first."); process.exit(1); }
const { url, anonKey } = JSON.parse(readFileSync(local, "utf8"));
const pw = "Test-passw0rd!";

const PEOPLE = [
  { name: "Victoria Njuguna", title: "Clinical Psychologist",
    specialties: ["Anxiety", "Emotional wellness", "Boundaries"],
    bio: "Calm, practical support for building emotional steadiness and healthy boundaries.",
    color: "#0f6f6a" },
  { name: "Priscilla Maina", title: "Marriage & Family Therapist",
    specialties: ["Couples", "Communication", "Family expectations"],
    bio: "Helps couples navigate expectations and communicate with honesty and care.",
    color: "#cc5b8a" },
  { name: "Brenda Omondi", title: "Counselling Psychologist",
    specialties: ["Single parents", "Self-worth", "New beginnings"],
    bio: "Warm, encouraging guidance for single parents and anyone starting a new chapter.",
    color: "#3a6ea5" },
];

const stamp = Date.now().toString().slice(-6);
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const arr = (a) => "array[" + a.map(lit).join(",") + "]";

const created = [];
for (const p of PEOPLE) {
  const handle = p.name.split(" ")[0].toLowerCase();
  const email = `${handle}.${stamp}@h2h-demo.local`;
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signUp({ email, password: pw });
  if (error) { console.error(`✗ ${p.name}: ${error.message}`); process.exit(1); }
  const id = data.user.id;
  await c.from("profiles").update({
    full_name: p.name, county: "Nairobi", onboarded: true, avatar_color: p.color, bio: p.bio,
  }).eq("id", id);
  created.push({ ...p, id, email });
  console.log(`✓ ${p.name.padEnd(20)} ${email}`);
}

console.log(`\n${"─".repeat(60)}\nRun this in the Supabase SQL editor to activate them:\n${"─".repeat(60)}\n`);

const promote = created.map(p => `update public.profiles set role = 'counsellor' where id = '${p.id}';`).join("\n");
const CREDS = [
  "Graduate, Kenya Institute of Professional Counselling (KIPC)",
  "Registered — Counsellors & Psychologists Board",
];
const insert = "insert into public.counsellors (id, title, specialties, bio, credentials, active, accepting_new) values\n" +
  created.map(p => `  ('${p.id}', ${lit(p.title)}, ${arr(p.specialties)}, ${lit(p.bio)}, ${arr(CREDS)}, true, true)`).join(",\n") +
  "\non conflict (id) do nothing;";

// One shared week of availability for all three (10:00 & 14:00, next 4 days).
const slots = "insert into public.availability_slots (counsellor_id, starts_at, ends_at)\n" +
  "select cid, (current_date + d)::timestamptz + t, (current_date + d)::timestamptz + t + interval '50 minutes'\n" +
  "from (values\n" +
  created.map(p => `  ('${p.id}'::uuid)`).join(",\n") + "\n) as c(cid),\n" +
  "     generate_series(1,4) as d,\n" +
  "     unnest(array[interval '10 hours', interval '14 hours']) as t\n" +
  "on conflict (counsellor_id, starts_at) do nothing;";

const check = "select p.full_name, p.role, c.title,\n" +
  "       (select count(*) from public.availability_slots s where s.counsellor_id = c.id) as slots\n" +
  "from public.counsellors c join public.profiles p on p.id = c.id\n" +
  "order by p.full_name;";

console.log([promote, "", insert, "", slots, "", check].join("\n"));
