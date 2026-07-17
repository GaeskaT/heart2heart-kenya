/* ============================================================================
   mpesa-callback — Safaricom posts the payment result here.

   THIS IS THE ONLY PATH THAT GRANTS ENTITLEMENT. A client saying "I paid" is
   never believed; only a Daraja callback that we can tie back to a pending
   payment we created will activate a subscription.

   Safaricom does not sign its callbacks, so we defend with:
     1. a shared secret in the URL (?token=…), compared in constant time
     2. matching CheckoutRequestID to a payment WE created and marked pending
     3. idempotency — Daraja retries; record_payment_event() makes a repeat a
        no-op, so nobody gets a free extra month from a retry
     4. the raw payload is stored for audit either way
   Also recommended: restrict this function to Safaricom's callback IP ranges
   at the network edge (see functions/README.md).

   This function must be deployed with JWT verification OFF — Safaricom cannot
   present a user token:
     supabase functions deploy mpesa-callback --no-verify-jwt

   Secrets: MPESA_CALLBACK_SECRET
   ============================================================================ */
import { serviceClient } from "../_shared/http.ts";
import { parseStkCallback } from "../_shared/mpesa.ts";

/** Constant-time compare, so the secret can't be discovered by timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/* Always 200 back to Safaricom once we've accepted the callback: a non-2xx
   makes Daraja retry, and our own processing errors shouldn't cause a retry
   storm. Genuine problems are recorded in payment_events / audit_log. */
const ok = (msg = "accepted") =>
  new Response(JSON.stringify({ ResultCode: 0, ResultDesc: msg }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  try {
    const expected = Deno.env.get("MPESA_CALLBACK_SECRET") ?? "";
    const got = new URL(req.url).searchParams.get("token") ?? "";
    if (!expected || !safeEqual(got, expected)) {
      console.warn("[mpesa-callback] rejected: bad or missing token");
      return new Response("not found", { status: 404 });   // don't confirm the endpoint exists
    }

    const payload = await req.json().catch(() => null);
    if (!payload) return ok("ignored: unparseable body");

    const r = parseStkCallback(payload);
    if (!r.checkoutRequestId) {
      console.warn("[mpesa-callback] no CheckoutRequestID in payload");
      return ok("ignored: no CheckoutRequestID");
    }

    const svc = serviceClient();

    // Idempotency FIRST: if we've seen this callback, stop here.
    const { data: isNew, error: evErr } = await svc.rpc("record_payment_event", {
      p_provider: "mpesa",
      p_key: r.checkoutRequestId,
      p_payload: payload,
    });
    if (evErr) { console.error("[mpesa-callback] event insert failed", evErr); return ok("logged"); }
    if (isNew === false) return ok("duplicate ignored");

    // Tie it back to a payment we created.
    const { data: pays } = await svc.rpc("payment_by_ref", { p_ref: r.checkoutRequestId });
    const pay = pays?.[0];
    if (!pay) { console.warn("[mpesa-callback] no matching payment", r.checkoutRequestId); return ok("no matching payment"); }
    if (pay.status === "succeeded") return ok("already settled");

    if (!r.ok) {
      await svc.rpc("fail_payment", { p_payment: pay.id, p_reason: r.resultDesc || `ResultCode ${r.resultCode}` });
      return ok("payment failed, recorded");
    }

    // Success — this is the single place a subscription is granted.
    const { error } = await svc.rpc("activate_subscription", {
      payment_id: pay.id,
      ref: r.receipt ?? r.checkoutRequestId,
    });
    if (error) { console.error("[mpesa-callback] activate failed", error); return ok("activation error logged"); }

    return ok("activated");
  } catch (e) {
    console.error("[mpesa-callback] unhandled", e);
    return ok("error logged");
  }
});
