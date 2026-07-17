# Edge Functions

Four Deno functions that cover what the database can't do on its own: calling a
real moderation model, driving M-Pesa, and minting video tokens.

| Function | Purpose | JWT |
|---|---|---|
| `moderate-message` | Runs a message through a real moderation model, then inserts it via `send_message_moderated()`. | required |
| `mpesa-stk-push` | Sends an M-Pesa prompt to the member's handset for a pending payment intent. | required |
| `mpesa-callback` | Safaricom posts the result here. **The only path that grants entitlement.** | **off** |
| `video-token` | Mints a short-lived Daily.co token, only for the booking's member or counsellor. | required |

> **Status: written and unit-tested, NOT deployed.** The pure logic (Daraja
> timestamp/password/msisdn, callback parsing, moderation verdict mapping, the
> video join window) has **44 passing tests** run against these exact files
> (`npm run test:functions`). The HTTP handlers and the provider integrations
> have **never been executed** — they need Deno + a live project + provider
> credentials. Treat them as reviewed code, not proven code.

## Requires

Migration **`0007`** (the service-role-only RPCs these call). Apply it before deploying.

## Deploy

```bash
supabase login                       # you must do this — it's an interactive browser sign-in
supabase link --project-ref <your-project-ref>

supabase functions deploy moderate-message
supabase functions deploy mpesa-stk-push
supabase functions deploy video-token
supabase functions deploy mpesa-callback --no-verify-jwt   # Safaricom has no user token
```

## Secrets

Set these with `supabase secrets set KEY=value` — **never** commit them, and
never put them in `supabase-config.js` (that file ships to the browser).

| Secret | Used by | Notes |
|---|---|---|
| `OPENAI_API_KEY` | moderate-message | Optional. Without it, moderation falls back to the keyword screen. |
| `MPESA_ENV` | stk-push | `sandbox` or `production` |
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | stk-push | Daraja app credentials |
| `MPESA_SHORTCODE` / `MPESA_PASSKEY` | stk-push | Paybill/till + its passkey |
| `MPESA_CALLBACK_SECRET` | stk-push, callback | Long random string; guards the callback URL |
| `DAILY_API_KEY` | video-token | Daily.co API key |
| `DAILY_DOMAIN` | video-token | e.g. `yourteam.daily.co` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically.

## Design notes

### The Edge Function is trusted for verdicts, never for identity

Every user-facing function resolves the caller from **their JWT** (`requireUser`)
and never from the request body. It then acts via `service_role`. The database
still enforces the rules independently: `send_message_moderated()` re-checks
participation and blocking, so even a compromised function can't post as someone
else. The tests assert exactly this:

```
✓ service_role CAN send a moderated message
✓ service_role STILL cannot post as a non-participant
```

### Distress is not misconduct

Self-harm signals set `crisis` and raise a `safety_flag` — they do **not** flag
or block the message. Someone writing "I want to die" needs a counsellor, not a
content violation. This is deliberate and tested:

```
✓ self-harm is NOT treated as a violation (message still delivered)
✓ crisis verdict raises a safety_flag but still delivers the message
```

Moderation also **fails closed onto the keyword screen** if the model is
unreachable — a send is never silently unmoderated.

⚠️ The crisis protocol itself (who is alerted, how fast, what they do) still
needs a **licensed clinician** to define. The plumbing is ready; the clinical
response is not a thing to improvise.

### Money only moves on a verified callback

`mpesa-stk-push` grants nothing. Only `mpesa-callback` → `activate_subscription()`
does, and only after:

1. the URL's shared secret matches (constant-time compare),
2. the `CheckoutRequestID` maps to a **pending payment we created**,
3. `record_payment_event()` confirms it's not a replay — Daraja retries, and a
   double-activation would hand out a free month.

No card number, CVV or PIN ever touches this app: STK push means the member
approves on their own phone.

**Additionally recommended:** Safaricom does not sign callbacks, so restrict the
`mpesa-callback` endpoint to Safaricom's published callback IP ranges at the
network edge. The shared secret is a first line of defence, not the only one.

### After deploying `moderate-message`

The client prefers the function and falls back to the `send_message` RPC when it
404s. Once the function is live, close the bypass:

```sql
revoke execute on function public.send_message(uuid, text) from authenticated;
```

Until you run that, a crafted client could call the RPC directly and get the
weaker keyword screen. It isn't done automatically because it would break any
project that hasn't deployed the functions.

## Not built

Notification fan-out (FCM push / Africa's Talking SMS / email). `notifications`
rows are already queued in the database by `book_session`, `answer_question` and
`activate_subscription`; a scheduled function to drain that queue is the
remaining piece.
