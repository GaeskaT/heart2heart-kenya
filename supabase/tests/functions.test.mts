/* ============================================================================
   Unit tests for the Edge Functions' pure logic.

   Imports the REAL files under ../functions/_shared — Node strips the types, so
   these test what actually ships, not a copy.

   Scope, honestly: this covers the fiddly, high-risk pure logic (Daraja
   timestamp/password/msisdn formats, callback parsing, moderation verdict
   mapping, the video join window). It does NOT cover the HTTP handlers, which
   need Deno + a live project.

   Run:  cd supabase/tests && npm run test:functions
   ============================================================================ */
import {
  mpesaTimestamp, mpesaPassword, normalizeMsisdn, parseStkCallback, darajaBase,
} from "../functions/_shared/mpesa.ts";
import {
  verdictFromOpenAI, keywordScreen, keywordCrisis,
} from "../functions/_shared/moderation.ts";
import { joinWindow } from "../functions/_shared/video.ts";

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log("  \x1b[32m✓\x1b[0m " + name); }
  else { fail++; failures.push(name); console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? `  (${detail})` : "")); }
}
const section = (t: string) => console.log(`\n\x1b[1m${t}\x1b[0m`);

/* ---------------- M-Pesa formats ---------------- */
section("M-Pesa — Daraja formats");
{
  // 2026-07-17T09:30:00Z -> Nairobi (UTC+3) is 12:30:00 the same day
  const ts = mpesaTimestamp(new Date("2026-07-17T09:30:00Z"));
  ok("timestamp is YYYYMMDDHHmmss in Nairobi time", ts === "20260717123000", ts);
  ok("timestamp is exactly 14 digits", /^\d{14}$/.test(ts), ts);

  // crossing midnight UTC must roll the Nairobi date forward
  const ts2 = mpesaTimestamp(new Date("2026-07-17T22:00:00Z"));
  ok("timestamp rolls the date at UTC+3", ts2 === "20260718010000", ts2);

  const pw = mpesaPassword("174379", "PASSKEY", "20260717123000");
  ok("password is base64(shortcode+passkey+timestamp)",
     pw === Buffer.from("174379PASSKEY20260717123000").toString("base64"), pw);

  ok("sandbox base url", darajaBase("sandbox").includes("sandbox.safaricom"));
  ok("production base url", darajaBase("production") === "https://api.safaricom.co.ke");
}

/* ---------------- MSISDN normalisation ---------------- */
section("M-Pesa — phone normalisation");
{
  const cases: [string, string | null][] = [
    ["0712345678",     "254712345678"],
    ["712345678",      "254712345678"],
    ["254712345678",   "254712345678"],
    ["+254712345678",  "254712345678"],
    ["+254 712 345 678", "254712345678"],
    ["0712-345-678",   "254712345678"],
    ["0112345678",     "254112345678"],   // newer 01x range
    ["07123456",       null],             // too short
    ["0812345678",     null],             // not a mobile prefix
    ["",               null],
    ["not a phone",    null],
  ];
  for (const [input, want] of cases) {
    const got = normalizeMsisdn(input);
    ok(`${JSON.stringify(input).padEnd(18)} -> ${want ?? "null"}`, got === want, `got ${got}`);
  }
}

/* ---------------- Daraja callback parsing ---------------- */
section("M-Pesa — callback parsing");
{
  const success = {
    Body: { stkCallback: {
      CheckoutRequestID: "ws_CO_1", ResultCode: 0, ResultDesc: "The service request is processed successfully.",
      CallbackMetadata: { Item: [
        { Name: "Amount", Value: 1500 },
        { Name: "MpesaReceiptNumber", Value: "SGR5TXQ1ZQ" },
        { Name: "PhoneNumber", Value: 254712345678 },
      ]},
    }},
  };
  const s = parseStkCallback(success);
  ok("success: ok=true", s.ok === true);
  ok("success: receipt extracted", s.receipt === "SGR5TXQ1ZQ", String(s.receipt));
  ok("success: amount extracted", s.amount === 1500, String(s.amount));
  ok("success: checkout id extracted", s.checkoutRequestId === "ws_CO_1");

  // Safaricom omits CallbackMetadata entirely when the user cancels — a naive
  // reader throws exactly when the payment has failed.
  const cancelled = {
    Body: { stkCallback: { CheckoutRequestID: "ws_CO_2", ResultCode: 1032, ResultDesc: "Request cancelled by user" } },
  };
  const c = parseStkCallback(cancelled);
  ok("cancelled: does not throw on missing metadata", c.checkoutRequestId === "ws_CO_2");
  ok("cancelled: ok=false", c.ok === false);
  ok("cancelled: receipt is null", c.receipt === null);
  ok("cancelled: reason preserved", /cancelled/i.test(c.resultDesc));

  // ResultCode sometimes arrives as a string
  const strCode = parseStkCallback({ Body: { stkCallback: { CheckoutRequestID: "x", ResultCode: "0", ResultDesc: "" } } });
  ok("ResultCode as string still parses as success", strCode.ok === true);

  const junk = parseStkCallback({ nonsense: true });
  ok("junk payload yields no checkout id (rejected upstream)", junk.checkoutRequestId === null);
  ok("junk payload is not treated as success", junk.ok === false);
}

/* ---------------- Moderation verdicts ---------------- */
section("Moderation — verdict mapping");
{
  const mk = (categories: Record<string, boolean>) => ({ categories, category_scores: {} });

  const clean = verdictFromOpenAI(mk({}));
  ok("clean message is approved", clean.status === "approved" && clean.crisis === null);

  const harass = verdictFromOpenAI(mk({ harassment: true }));
  ok("harassment is flagged", harass.status === "flagged");

  const threat = verdictFromOpenAI(mk({ "harassment/threatening": true }));
  ok("threatening harassment is blocked", threat.status === "blocked");

  // The important one: distress must NOT be punished.
  const sh = verdictFromOpenAI(mk({ "self-harm": true }));
  ok("self-harm raises a crisis signal", sh.crisis === "self_harm");
  ok("self-harm is NOT treated as a violation (message still delivered)",
     sh.status === "approved", `status=${sh.status}`);

  const shIntent = verdictFromOpenAI(mk({ "self-harm/intent": true }));
  ok("self-harm/intent also raises crisis", shIntent.crisis === "self_harm");

  // someone can be both distressed and abusive
  const both = verdictFromOpenAI(mk({ "self-harm": true, harassment: true }));
  ok("distress + abuse: flagged AND crisis raised",
     both.status === "flagged" && both.crisis === "self_harm");
}

/* ---------------- Keyword fallback parity with the SQL ---------------- */
section("Moderation — keyword fallback (parity with 0002 SQL)");
{
  ok("abusive keyword flagged", keywordScreen("you are an idiot") === "flagged");
  ok("clean keyword approved", keywordScreen("lovely to meet you") === "approved");
  ok("crisis keyword detected", keywordCrisis("sometimes I want to die") === "self_harm");
  ok("no false crisis on ordinary text", keywordCrisis("I could die of embarrassment") === null);
}

/* ---------------- Video join window ---------------- */
section("Video — join window");
{
  const at = new Date("2026-07-18T10:00:00Z");
  ok("too early (30 min before)", joinWindow(at, 50, new Date("2026-07-18T09:30:00Z")) === "early");
  ok("open (5 min before)",       joinWindow(at, 50, new Date("2026-07-18T09:55:00Z")) === "open");
  ok("open (mid-session)",        joinWindow(at, 50, new Date("2026-07-18T10:30:00Z")) === "open");
  ok("open (just after end)",     joinWindow(at, 50, new Date("2026-07-18T11:00:00Z")) === "open");
  ok("over (2 hours later)",      joinWindow(at, 50, new Date("2026-07-18T12:00:00Z")) === "over");
}

console.log(`\n${"─".repeat(52)}`);
console.log(`\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
if (fail) { console.log("\nFailures:"); failures.forEach(f => console.log("  • " + f)); }
process.exit(fail ? 1 : 0);
