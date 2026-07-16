# Supabase backend

This folder holds the database layer for Heart2Heart Kenya. Migrations apply in
order (`0001`, then `0002`, …).

- **Phase 0 — Foundations** (`0001`): auth-linked profiles, counsellor invites,
  the readiness assessment + private Wellness Score, consent capture, member
  verification, and an audit log.
- **Phase 1 — Core loop** (`0002`): server-side matching, interest + mutual
  consent, conversations & moderated messaging, reporting / blocking, and
  crisis-safety hooks. See [Phase 1](#phase-1--core-loop-0002) below.
- **Phase 2 — Counselling** (`0003`): counsellor accounts & dashboard,
  availability + bookings, video rooms, confidential Q&A, clinical notes and
  notifications. Also **tightens Phase 0's profile access**. See
  [Phase 2](#phase-2--counselling-0003) below.
- **Phase 3 — Monetisation & community** (`0004`): plans, subscriptions and
  M-Pesa / card payments (webhook-reconciled), premium entitlements, webinars,
  moderated community groups, events + RSVP. Also **hardens function grants
  across all phases**. See [Phase 3](#phase-3--monetisation--community-0004).

See [`../docs/backend-scope.md`](../docs/backend-scope.md) for the full backend
plan and later phases.

- **`0005`** — fixes the admin/counsellor bootstrap, which silently did nothing
  on every project before it. See [Bootstrap the first admin](#bootstrap-the-first-admin).

> **Status: verified.** All migrations apply cleanly and their security policies
> are proven by an automated suite — **53 assertions, 0 failures** — which runs
> the real migrations against an embedded Postgres and impersonates member /
> counsellor / admin / anon sessions. See [`tests/`](tests/):
>
> ```bash
> cd supabase/tests && npm install && npm test   # offline, 53 assertions
> node live-smoke.mjs                            # against a hosted project, 28
> ```
>
> Not yet covered: provider webhooks (M-Pesa/card) and the Edge Functions for
> real moderation, video tokens and notification fan-out.

## What it creates

| Object | Purpose |
|---|---|
| `profiles` | One row per auth user; auto-created on sign-up. Holds the onboarding profile + `role` and `verified`. |
| `counsellor_invites` | Invite codes issued by counsellors; redeemed via `redeem_invite()`. |
| `verifications` | Member verification records (document refs are hidden from clients). |
| `readiness_assessments` | Stage 1 answers + dimension scores; `overall` is the Wellness Score. |
| `consents` | Immutable code-of-conduct + data-processing consent records. |
| `audit_log` | Written only by definer functions / service role; readable by admins. |
| helpers | `auth_role()`, `is_admin()`, `is_staff()`, `redeem_invite()`, sign-up + guard triggers. |

## Prerequisites

1. Create a Supabase project.
2. In **Authentication → Providers**, enable **Email** (and optionally phone OTP).

## Apply

**Option A — Supabase CLI (recommended)**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — SQL editor**

Paste `migrations/0001_phase0_foundations.sql` into the dashboard SQL editor and run it.

## Bootstrap the first admin

Members cannot assign roles to themselves — the schema blocks it. So the first
admin has to be promoted from the **SQL editor**, which runs without a JWT and
is therefore trusted:

```sql
update public.profiles set role = 'admin'
  where id = (select id from auth.users where email = 'you@example.com');

insert into public.counsellor_invites (code, issued_by)
  values ('H2H-KE-2026', (select id from auth.users where email = 'you@example.com'));
```

Onboarding a counsellor works the same way (there is deliberately no self-serve
path — `counsellors` has no INSERT policy):

```sql
update public.profiles set role = 'counsellor' where id = '<user-uuid>';
insert into public.counsellors (id, title, specialties)
  values ('<user-uuid>', 'Clinical Psychologist', array['Trauma']);
```

> ⚠️ This needs migration **`0005`**. Before it, `protect_profile_columns()`
> clamped `role` whenever `is_admin()` was false — and since `auth.uid()` is
> NULL in the SQL editor, the statements above reported success while silently
> reverting. No admin or counsellor could ever be created. `0005` restricts the
> clamp to real end-user requests. Members are still blocked from
> self-promotion, and both properties are asserted in [`tests/`](tests/).

## Access model (RLS summary)

(As tightened by `0003` — see Phase 2.)

| Table | Member | Counsellor | Moderator | Admin |
|---|---|---|---|---|
| profiles | read/update **own** | read **own clients only** | read all | read/update all |
| counsellor_invites | redeem via RPC | read own-issued, create | — | read/update all |
| verifications | read/create **own** (no doc fields) | — | — | full + review |
| readiness_assessments | read/create **own** | read **own clients only** | — | read all |
| consents | read/create **own** (immutable) | — | — | read all |
| audit_log | — | — | — | read |

Key safeguards:
- `role` and `verified` on `profiles` can only be changed by an admin (enforced
  by a `BEFORE UPDATE` trigger, so a member can't escalate privileges even with a
  crafted request).
- The `is_admin()` / `is_staff()` helpers are `SECURITY DEFINER` and owned by the
  migration role, so they **bypass RLS on `profiles`** and avoid policy recursion.
- Verification `document_ref` / `provider_ref` are revoked from the `authenticated`
  role at the column level — clients never see raw verification data.
- A **counsellor is not a superuser**: they can only read a member who is
  actually their client (`is_my_client()` — has a booking or an assigned
  question with them). Moderators keep wider read access because they must
  review reports.

## How the front-end maps onto this

The current prototype's onboarding maps almost 1:1:

| Prototype step (localStorage) | Phase 0 backend call |
|---|---|
| Enter invite code | `supabase.rpc('redeem_invite', { invite_code })` |
| Sign up | `supabase.auth.signUp(...)` → profile auto-created |
| Build profile | `update profiles set … where id = auth.uid()` |
| Relationship Readiness | `insert into readiness_assessments (…)` |
| Wellness Score | `readiness_assessments.overall` |
| Code of conduct | `insert into consents (…)` |

Wire these behind the existing state helpers (`load/save`) so the UI barely
changes — see the "Migrating the prototype" section of the backend scope.

## Phase 1 — Core loop (`0002`)

The matching + messaging heart of the app, all enforced server-side.

| Object | Purpose |
|---|---|
| `interests` | One side expressing interest; unique per (from, to). |
| `connections` | A mutually-consented pair (ordered `user_a < user_b`). |
| `conversations` | One per connected pair; created on mutual consent. |
| `messages` | Moderated before delivery (`moderation_status`). |
| `moderation_events` | Audit of automated / human moderation decisions. |
| `blocks`, `reports` | Blocking and reporting for safety. |
| `safety_flags` | Crisis-safety queue (self-harm / abuse signals), staff-only. |

**Write API (SECURITY DEFINER RPCs — the client never writes these tables directly):**

| RPC | Does |
|---|---|
| `get_matches(match_limit)` | Server-scored, curated matches. Returns **only safe display fields** — members never get blanket read on `profiles`. |
| `member_card(target)` | One member's card, only if you have an interest/connection with them. |
| `express_interest(target)` | Records interest; **auto-connects** if the other side already expressed interest. |
| `respond_to_interest(id, accept)` | Accept (→ connect + open conversation) or decline. |
| `send_message(conversation_id, body)` | Participant check → moderation → insert; raises a `safety_flag` on crisis signals. |
| `block_user` / `unblock_user` / `report_user` | Safety actions (block ends the connection). |

**Key design points**

- **Consent is server-enforced:** a conversation exists only after mutual
  interest; messaging checks participation and blocks on every send.
- **Matching is server-authoritative:** scoring (`match_score`, mirroring the
  client algorithm) runs in the database; the client can't see uninvited profiles.
- **Moderation:** `moderate_text()` / `crisis_signal()` are a first-pass keyword
  screen (matching the prototype). Replace with an **Edge Function calling a real
  model** (OpenAI Moderation / Google Perspective) before insert, and route
  crisis flags to an on-call counsellor. **Define the crisis protocol with a
  licensed clinician.**
- **Realtime:** `messages`, `interests` and `connections` are added to the
  `supabase_realtime` publication so the client can subscribe (see
  `Backend.subscribeMessages`).

The matching client methods are wired in `../backend.js` (`getMatches`,
`expressInterest`, `sendMessage`, `subscribeMessages`, …), ready to back the
existing matches/chat UI when Supabase is configured.

## Phase 2 — Counselling (`0003`)

Professional support, plus the counsellor's own workspace.

| Object | Purpose |
|---|---|
| `counsellors` | Directory info (title, specialties, bio). Browsable by members. |
| `availability_slots` | Bookable windows published by a counsellor. |
| `bookings` | Member ↔ counsellor sessions (type, format, time, `video_room`). |
| `questions` / `question_replies` | Confidential Q&A with the counselling team. |
| `session_notes` | Clinical notes — **counsellor + admin only, never the member**. |
| `notifications` / `push_tokens` | In-app queue + device tokens for fan-out. |

**Write API (RPCs):**

| RPC | Does |
|---|---|
| `open_slots(counsellor)` | Free slots in the next 30 days. |
| `book_session(slot, type, format)` | **Atomically claims** the slot (no double-booking), sizes the session, mints a `video_room` for video, notifies both sides. |
| `cancel_booking(id)` | Member or counsellor; frees the slot and notifies the other party. |
| `ask_question(body)` | Confidential question — also runs the **crisis-safety detector**. |
| `answer_question(id, body)` | Counsellor/admin only; assigns + notifies the member. |
| `counsellor_clients()` | Dashboard: the counsellor's clients, last session, open questions. |
| `mark_notification_read(id)` | Own notifications only. |

**Key design points**

- **Least privilege for counsellors.** This migration *narrows* Phase 0: a
  counsellor can only read profiles/readiness of their **own clients**
  (`is_my_client()`), not the whole member base. Unassigned questions stay
  visible to any active counsellor so the team can triage.
- **Clinical notes are invisible to members** by design — the most restricted
  table in the schema. Confirm retention/disclosure rules with a licensed
  clinician and against the Kenya DPA before launch.
- **No double-booking:** `book_session` claims the slot with a conditional
  `UPDATE … WHERE booked = false`, so concurrent requests can't both win.
- **Video:** `bookings.video_room` stores a room id only. Short-lived provider
  tokens (Daily.co / Twilio) must be minted by an **Edge Function** that checks
  the caller is that booking's member or counsellor — never in SQL, and never
  with the API secret shipped to the client.
- **Notifications** are queued in-DB; an Edge Function fans out to FCM (push),
  Africa's Talking (SMS) and email.

Client methods are in `../backend.js` (`listCounsellors`, `openSlots`,
`bookSession`, `cancelBooking`, `askQuestion`, `listNotifications`,
`counsellorClients`, …).

## Phase 3 — Monetisation & community (`0004`)

| Object | Purpose |
|---|---|
| `plans` | Free / Premium / Premium+ (seeded to match the app). Admin-editable. |
| `subscriptions` | One active row per member; drives entitlement. |
| `payments` | Payment **intents + outcomes** — references only, never credentials. |
| `payment_events` | Raw verified webhook payloads, idempotent. **service_role only.** |
| `webinars` / `webinar_registrations` | Live sessions, optionally premium-only, with capacity. |
| `community_groups` / `community_memberships` / `community_posts` | Moderated discussion. |
| `events` / `event_rsvps` | Gatherings with capacity + automatic waitlist. |

### Payments — how money actually moves

**No card numbers, CVVs, PINs or M-Pesa credentials are ever stored here or
handled by the client.** The flow is deliberately narrow:

1. Client calls `create_payment_intent(plan, provider)` → a **pending** payment row.
2. An **Edge Function** calls M-Pesa **Daraja STK push** (member approves on their
   own handset) or opens a provider-**hosted** card checkout.
3. The provider calls back → the Edge Function **verifies** it, records a
   `payment_events` row (idempotency key = e.g. `CheckoutRequestID`), then calls
   `activate_subscription()`.
4. `activate_subscription()` is **granted to `service_role` only** — a member
   cannot grant themselves premium, and a client-reported "payment success" is
   never trusted. It's also idempotent, since providers retry callbacks.

Entitlement is read via `has_premium()`, used to gate e.g. premium-only webinars.

### Community & events

- `post_to_group()` runs the **same moderation + crisis screen** as private
  messaging, so a distress signal in a group post also raises a `safety_flag`.
- Posts are visible to **group members only**; blocked posts are hidden from
  everyone but the author and staff. `report_post()` feeds the Phase 1 reports
  queue; `moderate_post()` lets staff hide content.
- `rsvp_event()` **auto-waitlists** once capacity is reached.

### Hardening (applies to phases 0–3)

Postgres grants `EXECUTE` on new functions to `PUBLIC` **by default** — which
meant the `anon` role could call our RPCs. Section 9 of `0004` revokes execute
from `public, anon` across every function in `public`, then re-grants only the
member-callable surface to `authenticated` (and `activate_subscription` to
`service_role`). Add any new function to that grant list, or it will be
unreachable from the client.

## Not yet built

Couple Space (shared journal/goals/budget) is the remaining feature area — see
the scope doc's Phase 4.
