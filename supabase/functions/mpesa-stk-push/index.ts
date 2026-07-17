/* ============================================================================
   mpesa-stk-push — start an M-Pesa payment for a pending intent.

   The member approves the charge ON THEIR OWN HANDSET. This app never sees,
   collects or stores a PIN, card number or any payment credential — only the
   phone number to prompt and the provider's reference.

   Flow:
     client (user JWT) -> this function
       1. resolve the payer from their JWT
       2. confirm the payment intent exists, belongs to them, and is pending
       3. Daraja OAuth -> STK push
       4. store CheckoutRequestID on the payment so the callback can find it

   Crucially this does NOT grant anything. Entitlement is only ever granted by
   mpesa-callback -> activate_subscription(), after Safaricom confirms.

   Secrets: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE,
            MPESA_PASSKEY, MPESA_ENV (sandbox|production), MPESA_CALLBACK_SECRET
   Deploy:  supabase functions deploy mpesa-stk-push
   ============================================================================ */
import { json, preflight, requireUser, serviceClient, handleError, HttpError } from "../_shared/http.ts";
import { darajaToken, stkPush, normalizeMsisdn, type MpesaEnv } from "../_shared/mpesa.ts";

const need = (k: string): string => {
  const v = Deno.env.get(k);
  if (!v) throw new HttpError(500, `${k} is not configured`);
  return v;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  try {
    if (req.method !== "POST") throw new HttpError(405, "POST only");

    const { id: userId } = await requireUser(req);
    const { payment_id, phone } = await req.json().catch(() => ({}));
    if (!payment_id || !phone) throw new HttpError(400, "payment_id and phone are required");

    const msisdn = normalizeMsisdn(String(phone));
    if (!msisdn) throw new HttpError(400, "that doesn't look like a Kenyan mobile number");

    const svc = serviceClient();

    // The intent must be theirs and still pending — this is what stops someone
    // paying against another member's intent, or re-paying a settled one.
    const { data: rows, error } = await svc.rpc("payment_intent_for", {
      p_payment: payment_id, p_user: userId,
    });
    if (error) throw error;
    const intent = rows?.[0];
    if (!intent) throw new HttpError(404, "payment not found");
    if (intent.status !== "pending") throw new HttpError(409, `payment is already ${intent.status}`);

    const env = (Deno.env.get("MPESA_ENV") ?? "sandbox") as MpesaEnv;
    const shortcode = need("MPESA_SHORTCODE");
    const passkey = need("MPESA_PASSKEY");

    const token = await darajaToken(env, need("MPESA_CONSUMER_KEY"), need("MPESA_CONSUMER_SECRET"));

    // The callback URL carries a shared secret: Daraja does not sign its
    // callbacks, so an unguessable path is our first line of defence.
    const callbackUrl =
      `${need("SUPABASE_URL")}/functions/v1/mpesa-callback?token=${need("MPESA_CALLBACK_SECRET")}`;

    const { checkoutRequestId } = await stkPush({
      env, token, shortcode, passkey, msisdn,
      amountKes: intent.amount_kes,
      accountRef: String(payment_id).replace(/-/g, "").slice(0, 12),
      description: "H2H plan",
      callbackUrl,
    });

    await svc.rpc("attach_payment_ref", { p_payment: payment_id, p_ref: checkoutRequestId });

    return json({
      status: "prompt_sent",
      checkout_request_id: checkoutRequestId,
      message: "Check your phone and enter your M-Pesa PIN to approve.",
    });
  } catch (e) {
    return handleError(e);
  }
});
