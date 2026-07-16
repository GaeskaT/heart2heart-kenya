import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const { url, anonKey } = JSON.parse(readFileSync(new URL("./local-project.json", import.meta.url), "utf8"));
const c = createClient(url, anonKey, { auth: { persistSession: false } });
// sign in as an existing member to read the counsellor directory
const { error: se } = await c.auth.signInWithPassword({ email: "amina.024843@h2h-demo.local", password: "Test-passw0rd!" });
if (se) { console.log("signin failed:", se.message); process.exit(1); }
const { data: cns, error } = await c.from("counsellors").select("id,title,specialties,active");
if (error) { console.log("error:", error.message); process.exit(1); }
console.log("counsellors:", cns.length, JSON.stringify(cns.map(x=>x.title)));
for (const x of cns) {
  const { data: slots } = await c.rpc("open_slots", { counsellor: x.id });
  console.log(`  ${x.title}: ${slots ? slots.length : 0} open slots`);
  if (slots && slots[0]) console.log(`  first slot: ${new Date(slots[0].starts_at).toLocaleString()}`);
}
