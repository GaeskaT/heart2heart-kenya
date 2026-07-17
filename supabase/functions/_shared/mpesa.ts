/* ============================================================================
   M-Pesa (Safaricom Daraja) helpers.

   The pure functions here are unit-tested from Node (supabase/tests/
   functions.test.mts) because they're the fiddly, easy-to-get-wrong parts:
   Daraja rejects a request outright if the timestamp format or the base64
   password is off by a character, and Kenyan phone numbers arrive in four
   different shapes.

   NOTHING here reads or stores card/PIN data. STK push means the member
   approves the charge on their own handset; we only ever hold references.
   ============================================================================ */

export type MpesaEnv = "sandbox" | "production";

export const darajaBase = (env: MpesaEnv): string =>
  env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

/** Daraja wants the timestamp as YYYYMMDDHHmmss in Nairobi time (UTC+3). */
export function mpesaTimestamp(d: Date = new Date()): string {
  // Africa/Nairobi is UTC+3 year-round (no DST), so a fixed offset is correct.
  const nairobi = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    nairobi.getUTCFullYear() +
    p(nairobi.getUTCMonth() + 1) +
    p(nairobi.getUTCDate()) +
    p(nairobi.getUTCHours()) +
    p(nairobi.getUTCMinutes()) +
    p(nairobi.getUTCSeconds())
  );
}

/** Password = base64(shortcode + passkey + timestamp). */
export function mpesaPassword(shortcode: string, passkey: string, timestamp: string): string {
  const raw = `${shortcode}${passkey}${timestamp}`;
  // btoa is available in Deno and modern Node.
  return btoa(raw);
}

/**
 * Normalise a Kenyan number to Daraja's required 2547XXXXXXXX / 2541XXXXXXXX.
 * Accepts 07xx…, 7xx…, +2547xx…, 2547xx…, and tolerates spaces/dashes.
 * Returns null when it isn't a valid Kenyan mobile number — callers must treat
 * null as a user error rather than passing junk to Daraja.
 */
export function normalizeMsisdn(input: string): string | null {
  if (!input) return null;
  let s = String(input).replace(/[\s\-()+]/g, "");
  if (s.startsWith("254")) s = s.slice(3);
  else if (s.startsWith("0")) s = s.slice(1);
  // Safaricom/Airtel mobile prefixes are 7xxxxxxxx or 1xxxxxxxx (9 digits)
  if (!/^[71]\d{8}$/.test(s)) return null;
  return "254" + s;
}

/** OAuth token for Daraja. Cached by the caller if desired (valid ~1h). */
export async function darajaToken(env: MpesaEnv, key: string, secret: string): Promise<string> {
  const res = await fetch(`${darajaBase(env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: "Basic " + btoa(`${key}:${secret}`) },
  });
  if (!res.ok) throw new Error(`daraja oauth failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  if (!j.access_token) throw new Error("daraja oauth returned no access_token");
  return j.access_token as string;
}

export interface StkPushArgs {
  env: MpesaEnv;
  token: string;
  shortcode: string;
  passkey: string;
  msisdn: string;        // already normalised
  amountKes: number;
  accountRef: string;    // our payment id — echoed back in the callback
  description: string;
  callbackUrl: string;
}

/** Initiates the STK prompt on the member's handset. */
export async function stkPush(a: StkPushArgs): Promise<{ checkoutRequestId: string; raw: unknown }> {
  const timestamp = mpesaTimestamp();
  const body = {
    BusinessShortCode: a.shortcode,
    Password: mpesaPassword(a.shortcode, a.passkey, timestamp),
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(a.amountKes),      // Daraja rejects decimals
    PartyA: a.msisdn,
    PartyB: a.shortcode,
    PhoneNumber: a.msisdn,
    CallBackURL: a.callbackUrl,
    AccountReference: a.accountRef.slice(0, 12),  // Daraja caps this at 12 chars
    TransactionDesc: a.description.slice(0, 13),
  };
  const res = await fetch(`${darajaBase(a.env)}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.json();
  if (!res.ok || !raw.CheckoutRequestID) {
    throw new Error(`stk push failed: ${res.status} ${JSON.stringify(raw)}`);
  }
  return { checkoutRequestId: raw.CheckoutRequestID, raw };
}

export interface CallbackResult {
  checkoutRequestId: string | null;
  ok: boolean;              // ResultCode === 0
  resultCode: number | null;
  resultDesc: string;
  receipt: string | null;   // M-Pesa receipt number, when successful
  amount: number | null;
}

/**
 * Parses a Daraja STK callback. Defensive on purpose: the callback shape is
 * deeply nested and Safaricom omits CallbackMetadata entirely on failure, so a
 * naive reader throws exactly when a payment has failed.
 */
export function parseStkCallback(payload: any): CallbackResult {
  const cb = payload?.Body?.stkCallback ?? {};
  const items: any[] = cb?.CallbackMetadata?.Item ?? [];
  const pick = (name: string) => items.find((i) => i?.Name === name)?.Value ?? null;
  const code = typeof cb.ResultCode === "number" ? cb.ResultCode : Number(cb.ResultCode);
  return {
    checkoutRequestId: cb.CheckoutRequestID ?? null,
    ok: code === 0,
    resultCode: Number.isFinite(code) ? code : null,
    resultDesc: String(cb.ResultDesc ?? ""),
    receipt: (pick("MpesaReceiptNumber") as string) ?? null,
    amount: (pick("Amount") as number) ?? null,
  };
}
