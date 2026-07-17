/* Probes the live project. NOTE: PostgREST resolves RPCs by name+signature, so
   a no-arg probe false-negatives on any function that takes arguments. We read
   the full PGRST202 body, whose hint reveals same-named overloads. */
import { readFileSync } from "node:fs";
const { url, anonKey } = JSON.parse(readFileSync(new URL("./local-project.json", import.meta.url), "utf8"));
const H = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" };

async function probeRpc(name, args){
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, { method:"POST", headers:H, body: JSON.stringify(args||{}) });
  const body = await r.text();
  let j = {}; try { j = JSON.parse(body); } catch {}
  // 401/403 => exists but refused. PGRST202 => no such name/signature.
  const refused = r.status === 401 || r.status === 403 || /permission denied/i.test(body);
  const noSuch  = j.code === "PGRST202";
  return { name, status:r.status, refused, noSuch, msg:(j.message||body).slice(0,110), hint:(j.hint||"").slice(0,150) };
}

console.log(`Live project: ${url}\n`);
console.log("── OUR RPCs, probed with correct signatures (401/permission-denied = exists + gated)");
for (const [n,a] of [
  ["get_matches",{match_limit:1}],
  ["express_interest",{target:"11111111-1111-4111-8111-111111111111"}],
  ["redeem_invite",{invite_code:"x"}],
  ["activate_subscription",{payment_id:"11111111-1111-4111-8111-111111111111", ref:"x"}],
  ["send_message",{conversation_id:"11111111-1111-4111-8111-111111111111", body:"x"}],
  ["book_session",{slot:"11111111-1111-4111-8111-111111111111", s_type:"refresher", fmt:"video"}],
]) {
  const p = await probeRpc(n,a);
  console.log(`   ${n.padEnd(22)} ${p.noSuch ? "❌ NOT FOUND" : p.refused ? "✅ exists, anon refused" : `⚠️  status ${p.status}`}`);
}

console.log("\n── FOREIGN objects — probed by name; hint would reveal any overload");
for (const n of ["set_member_role","make_admin","grant_role","promote_user","elevate"]) {
  const p = await probeRpc(n, {});
  const line = p.noSuch ? "does NOT exist ✅" : `EXISTS ⚠️  [${p.status}] ${p.msg}`;
  console.log(`   ${n.padEnd(18)} ${line}`);
  if (p.hint) console.log(`      hint: ${p.hint}`);
}
