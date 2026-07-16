/* ============================================================================
   Creates a counsellor auth account, then prints the SQL an ADMIN must run to
   promote them and publish availability.

   Why the split? By design a member cannot make themselves a counsellor:
   profiles.role is locked by the protect_profile_columns trigger, and the
   `counsellors` table has no INSERT policy. Only the service role / SQL editor
   can onboard a counsellor — which is exactly what we want.

   Run:  cd supabase/tests && node seed-counsellor.mjs
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const local = new URL("./local-project.json", import.meta.url);
if (!existsSync(local)) { console.error("Create supabase/tests/local-project.json first."); process.exit(1); }
const { url, anonKey } = JSON.parse(readFileSync(local, "utf8"));

const stamp = Date.now().toString().slice(-6);
const email = `njeri.${stamp}@h2h-demo.local`;
const pw = "Test-passw0rd!";

const c = createClient(url, anonKey, { auth: { persistSession: false } });
const { data, error } = await c.auth.signUp({ email, password: pw });
if (error) { console.error(error.message); process.exit(1); }
const id = data.user.id;

await c.from("profiles").update({
  full_name: "Dr. Njeri Kamau", county: "Nairobi", onboarded: true,
  avatar_color: "#0f6f6a", bio: "Clinical psychologist.",
}).eq("id", id);

console.log(`✓ counsellor auth account created: ${email}  (id ${id})\n`);

const sql = `-- Promote the new account to counsellor and publish availability.
-- (A member cannot do this themselves — role is admin-only by design.)
update public.profiles set role = 'counsellor' where id = '${id}';

insert into public.counsellors (id, title, specialties, bio, active, accepting_new)
values ('${id}', 'Clinical Psychologist',
        array['Healing after divorce','Trauma','Self-worth'],
        '15 years walking with people through painful endings toward healthy new beginnings.',
        true, true)
on conflict (id) do nothing;

-- Publish 8 open slots over the coming week (10:00 and 14:00 daily).
insert into public.availability_slots (counsellor_id, starts_at, ends_at)
select '${id}',
       (current_date + d)::timestamptz + t,
       (current_date + d)::timestamptz + t + interval '50 minutes'
from generate_series(1, 4) as d,
     unnest(array[interval '10 hours', interval '14 hours']) as t
on conflict (counsellor_id, starts_at) do nothing;

select p.full_name, p.role, c.title,
       (select count(*) from public.availability_slots s where s.counsellor_id = c.id) as slots
from public.counsellors c join public.profiles p on p.id = c.id where c.id = '${id}';`;

console.log(sql);
