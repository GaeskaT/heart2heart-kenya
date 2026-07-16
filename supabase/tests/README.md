# Schema & RLS tests

Runs the **real** migrations (`../migrations/*.sql`) against an embedded
Postgres and then asserts the security policies actually hold — by
impersonating member / counsellor / admin / anonymous sessions.

No Docker, no Supabase account, no local Postgres install: it uses
[PGlite](https://github.com/electric-sql/pglite) (Postgres compiled to WASM).

```bash
cd supabase/tests
npm install
npm test
```

Expected: **52 passed, 0 failed** across 4 migrations.

## Live smoke test (against a real project)

`npm test` needs no network. To additionally verify a **hosted** Supabase
project (auth flows, the signup trigger, real RLS):

```bash
node live-smoke.mjs
```

Expected: **28 passed, 0 failed**.

It resolves credentials in this order:

1. `SUPABASE_URL` / `SUPABASE_ANON_KEY` env vars
2. `local-project.json` (**gitignored**) —
   `{ "url": "https://<ref>.supabase.co", "anonKey": "<anon or publishable key>" }`
3. `../../supabase-config.js` — only if the app itself has been wired to a project

The shipped `supabase-config.js` is deliberately **left blank** so the public
demo stays on `localStorage` (instant, no signup, no real user data). Keep your
project details in `local-project.json`.

Only the **anon / publishable** key is ever needed. Never put the
`service_role` key or database password in either file.

Note: it creates two throwaway accounts per run (`*@h2h-test.local`), so the
project accumulates test users. Clean them out via Authentication → Users.

## What it proves

| Area | Asserted |
|---|---|
| Profile privacy | a member cannot read another member's profile, cannot enumerate the member base, cannot escalate their own `role`, cannot self-`verify` |
| Anonymous access | `anon` cannot read profiles/messages or call `get_matches`, `express_interest`, `activate_subscription` |
| Matching | server-scored; excludes self, **excludes staff**, ranks a well-matched member above a poor one |
| Consent | interest is `sent` until reciprocated → then `connected`; **no conversation exists before mutual consent**; uninvolved members can't see it |
| Messaging | participants only; abusive text is `flagged`; crisis language raises a `safety_flag`; non-participants can neither send nor read |
| Blocking | ends the connection, prevents messaging, removes them from matches |
| Counsellor scope | cannot read a non-client's profile/readiness; **can** after that member books them; still can't read unrelated members |
| Clinical notes | the member they're written about **cannot read them** |
| Billing | a member **cannot grant themselves premium**; entitlement only via the service-role webhook path; can't see others' payments |
| Community | can't post without joining; non-members can't read posts |
| Events | RSVP past capacity is waitlisted |
| Bookings | a slot cannot be double-booked |

## How impersonation works

`supabase-shim.sql` recreates just enough of Supabase to run the migrations
unmodified on plain Postgres: the `auth` schema, `auth.users`, `auth.uid()`
(reading the `sub` claim out of `request.jwt.claims`, exactly as Supabase does),
the `anon` / `authenticated` / `service_role` roles, and the `supabase_realtime`
publication.

Tests then switch identity with:

```sql
select set_config('request.jwt.claims', '{"sub":"<user-uuid>"}', false);
set role authenticated;
```

so RLS is evaluated for real, as that user.

## Fidelity caveats

- The only line altered from the shipped migrations is
  `create extension if not exists pgcrypto` — PGlite doesn't bundle pgcrypto,
  and `gen_random_uuid()` is core in Postgres 13+, so it's a no-op difference.
- The shim's roles approximate Supabase's. Table/function grants and RLS are
  exercised faithfully; Supabase's GoTrue auth flows are not (they're the
  client's concern, covered by `../../backend.js`).

## Bugs this suite has already caught

1. **`send_message` was entirely broken** — `RETURNS TABLE (id, moderation_status)`
   made those OUT names PL/pgSQL variables that collided with the same-named
   columns, so every column reference was ambiguous at runtime.
2. **Staff appeared in the dating pool** — `get_matches` didn't filter on
   `role = 'member'`.
3. **Members couldn't read any messages** — the Phase 3 hardening revoked
   `EXECUTE` from `PUBLIC` on all functions, and the re-grant list missed
   `is_conv_participant`, which the `messages` policy calls.

Add a case here for any new policy or RPC — especially anything that grants
access or spends money.
