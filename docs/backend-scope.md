# Heart2Heart Kenya — Backend Scope

Status: **Draft for review** · Owner: Moses · Companion to the front-end prototype in this repo.

This document scopes the backend needed to turn the current front-end prototype
(all data simulated in `localStorage`) into a real, multi-user product. It is
grounded in the features already built and the original concept, and calls out
the Kenya-specific choices (M-Pesa, data-protection law, local vendors).

---

## 1. Guiding principles

This is a **sensitive-domain** app: relationships, mental wellness, counselling,
and confidential disclosures by people who are often healing from hard
experiences. Every backend decision follows from that.

1. **Safety first.** No anonymous contact, enforced mutual consent, moderation
   before harm, fast reporting, and a real crisis-escalation path.
2. **Privacy by default.** Least-privilege access, encryption, strict data
   minimisation, and no selling or profiling of personal data. Compliant with
   the **Kenya Data Protection Act, 2019**.
3. **Confidentiality of counselling.** Counsellor Q&A, session notes and reports
   are treated as protected health-adjacent data with restricted access.
4. **Adults only (18+).** Age is verified; the platform is invitation/approval
   based, not open sign-up.
5. **Trust through verification.** "Verified member" must mean something real.

---

## 2. Recommended architecture

| Concern | Recommendation | Why |
|---|---|---|
| Core platform | **Supabase** (managed Postgres + Auth + Realtime + Storage + Row-Level Security) | Fastest path to a secure multi-user backend; RLS enforces per-row privacy at the database, which fits a confidentiality-critical app. Realtime powers messaging & community feeds. |
| Custom logic | **Edge Functions** (Deno/TypeScript) or a small **Node/NestJS** service | Matching, moderation pipeline, payment webhooks, video-token minting, notification fan-out. |
| Client | Keep the existing SPA; add an **API/data layer** that replaces `localStorage` reads/writes with API calls (localStorage stays as an offline cache). | Minimal rewrite of the UI already built. |
| Hosting | Supabase (managed) + the current static front-end on GitHub Pages / Netlify / Cloudflare Pages | Low ops overhead. |

**Alternative if full control is preferred:** Node/NestJS + PostgreSQL + Prisma,
Redis for presence/queues, hosted on Render/Railway/Fly.io. More work, more
flexibility. Supabase is the recommended default for speed and built-in security
primitives.

---

## 3. Roles & access

| Role | Can do |
|---|---|
| **Member** | Own profile, readiness, matches, consented chats, learning/wellness, bookings, community, own couple space. |
| **Counsellor** | Issue invites, review assigned reports, answer confidential questions, manage availability & bookings, host webinars/groups, view **only** their own clients (not the whole member base). |
| **Moderator** | Review the moderation queue and reports; block/warn. |
| **Admin** | Platform config, content, billing, audit. |

Access is enforced with **Row-Level Security policies** per table, not just in
app code. Every sensitive read/write is also written to an **audit log**.

---

## 4. Data model (core tables)

Grouped by subsystem. `uuid` PKs, `created_at`/`updated_at` on all, soft-delete
where data is user-owned.

**Identity & membership**
- `profiles` — user_id, name, age, gender, county, faith, education, career,
  intention, family_goal, values[], age_min/max, bio, avatar, verified, role.
- `counsellor_invites` — code, issued_by, used_by, status, expires_at.
- `verifications` — user_id, provider_ref, id_doc (storage ref), selfie, liveness
  result, status. (Documents encrypted; access restricted to admins.)
- `readiness_assessments` — user_id, answers(jsonb), dimension_scores(jsonb),
  overall, completed_at.
- `consents` — user_id, policy_version, code_of_conduct, data_processing, at.

**Matching & connection**
- `interests` — from_user, to_user, status (sent/accepted/declined).
- `connections` — user_a, user_b, status (connected/ended).
- `blocks` — blocker, blocked.
- `reports` — reporter, reported, reason, context(jsonb), status, reviewed_by.
- (Match scores are computed server-side on demand or via a nightly job; store
  `match_releases` to control the "few curated matches" cadence.)

**Messaging**
- `conversations` — participant_a, participant_b, unlocked_at (mutual consent).
- `messages` — conversation_id, sender, body, moderation_status, flagged, at.
- `moderation_events` — message_id, model, score, action, reviewer.

**Learning & wellness (private to the user)**
- `lesson_progress` — user_id, lesson_id, completed_at.
- `mood_logs`, `gratitude_entries`, `wellness_checkins`, `affirmation_favourites`.

**Counselling**
- `counsellors` — profile_id, title, specialties[], bio, active.
- `availability_slots` — counsellor_id, start, end, booked.
- `bookings` — user_id, counsellor_id, type, format(video/phone/inperson),
  scheduled_at, status, video_room_id.
- `questions` — user_id, body, status, assigned_counsellor.
- `question_replies` — question_id, counsellor_id, body, at.
- `webinars`, `webinar_registrations`.
- `support_groups`, `support_group_members`.

**Couple Space (scoped to a couple, RLS to the two members)**
- `couples` — user_a, user_b, since, status.
- `couple_journal`, `couple_goals`, `couple_dates`, `couple_budget_items`,
  `couple_checkins`, `marriage_progress` (topic_id, done_at).

**Community, events, billing, notifications**
- `community_groups` (config), `community_memberships`, `community_posts`
  (moderation_status).
- `events`, `event_rsvps`.
- `subscriptions` — user_id, plan, status, provider, current_period_end.
- `payments` — user_id, amount, currency, provider, provider_ref, status.
- `notifications`, `push_tokens`, `audit_log`.

---

## 5. API surface (grouped)

With Supabase, much of CRUD is auto-generated (guarded by RLS); the items below
are the **custom endpoints / RPCs** that need real logic:

- **Auth**: `POST /invites/redeem`, `POST /verify/start`, `POST /verify/callback`.
- **Readiness**: `POST /readiness` (compute & store wellness score).
- **Matching**: `GET /matches` (server-side scoring, respects release cadence),
  `POST /interests`, `POST /interests/:id/respond`.
- **Messaging**: realtime channel + `POST /messages` (runs moderation),
  `POST /reports`, `POST /blocks`.
- **Counselling**: `GET /counsellors/:id/availability`, `POST /bookings`,
  `POST /bookings/:id/cancel`, `POST /bookings/:id/video-token`,
  `POST /questions`, counsellor `POST /questions/:id/reply`.
- **Billing**: `POST /billing/subscribe` (initiates M-Pesa STK push / card),
  `POST /webhooks/mpesa`, `POST /webhooks/stripe`.
- **Notifications**: internal fan-out on key events.

---

## 6. Key subsystems

**Matching engine.** Port the prototype's scoring (values, intention, faith,
family goals, mutual age fit, location) to a server function. Add: a release
cadence (a few matches at a time), exclusion of blocked/reported users, and
recompute on profile change. Keep reasons transparent (already in the UI).

**Consent messaging + moderation.** A conversation unlocks only when both sides
accept interest. Every message runs through an **automated moderation check**
(OpenAI Moderation API or Google Perspective API) before delivery; flagged
content is held and queued for counsellor/moderator review. Reports create a
review task; repeat offenders are auto-restricted.

**Crisis-safety pipeline (critical).** Messages, questions and wellness check-ins
are scanned for self-harm / abuse signals. A positive signal triggers: a gentle
in-app surfacing of Kenyan helplines (already in the app's resources), and a
flagged, prioritised task for the counselling team. Define this protocol with a
licensed clinician before launch.

**Counselling & video.** Availability + booking with double-booking protection;
video sessions via **Daily.co** or **Twilio Video** (server mints short-lived
room tokens). Confidential Q&A routed to an assigned counsellor.

**Payments (Kenya-first).** **M-Pesa Daraja API** (STK push) as the primary
method, plus card via **Flutterwave / Paystack / Stripe**. Subscriptions
reconciled via provider webhooks. **The client never handles raw payment
credentials** — payment is completed on the provider's side (STK prompt on the
member's phone, or a hosted card page).

**Verification.** **Smile Identity** (African ID + liveness) or Jumio to make
"Verified member" real; store only the verification result and an encrypted
reference, not raw documents in the app DB.

**Notifications.** **FCM** (push), **Africa's Talking** (SMS — reminders, useful
where data is patchy), **Resend/SendGrid** (email).

**Content.** Academy lessons and wellness content are largely static — serve as
versioned JSON/CDN or a lightweight `content` table; only *progress* is per-user.

---

## 7. Compliance, privacy & security

- **Kenya Data Protection Act, 2019**: register with the ODPC as a data
  controller/processor; capture explicit **consent** (already modelled in the UI);
  honour data-subject rights (access, correction, deletion, portability); appoint
  a Data Protection Officer if thresholds are met.
- **Sensitive data**: readiness, wellness, counselling notes and Q&A are treated
  as special-category data — encrypted at rest, access-logged, tightly scoped.
- **Encryption**: TLS in transit; at-rest encryption for the DB and any stored
  media; field-level encryption for verification documents.
- **Data residency & retention**: define retention windows; hard-delete on
  account closure; keep counselling records per clinical/legal guidance.
- **Auth hygiene**: strong password policy or passwordless, session expiry,
  optional 2FA for counsellors/admins.
- **Abuse resistance**: rate limiting, invite-only sign-up, verification gate.

---

## 8. Phased roadmap

| Phase | Delivers | Rough effort (1–2 devs) |
|---|---|---|
| **0 — Foundations** ✅ *schema built* | Auth, profiles, invites, readiness + wellness score, consent capture, RLS, verification, audit log. | 3–4 weeks |
| **1 — Core loop** ✅ *schema built* | Server-side matching, interests/consent, realtime messaging, moderation pipeline, reporting/blocking, crisis-safety hooks. | 4–5 weeks |
| **2 — Counselling** ✅ *schema built* | Counsellor accounts & dashboard, availability + bookings, video sessions, confidential Q&A, notifications (push/SMS/email). | 4–5 weeks |
| **3 — Monetisation & community** ✅ *schema built* | Premium subscriptions via M-Pesa + card, webinars, support/community groups with moderation, events + RSVP. | 4–5 weeks |
| **4 — Couples & prep** | Couple Space (shared, RLS-scoped), marriage-prep tracking, richer counsellor dashboard & analytics. | 3–4 weeks |

Rough MVP (Phases 0–1) that makes the app genuinely usable and safe with real
users: **~7–9 weeks**. Full build across all phases: **~5–6 months** with a small
team, plus legal/clinical review time in parallel.

---

## 9. Migrating the prototype

The front-end already isolates its state behind a small set of helpers
(`load/save`, per-feature accessors like `well()`, `couns()`, `cpl()`). Migration
plan:

1. Introduce an **API client** module; keep the same function signatures the UI
   already calls, backed by fetch instead of `localStorage`.
2. Replace direct state mutations with API calls + optimistic UI; keep
   `localStorage` as an offline/read cache.
3. Move the matching and moderation logic server-side (the client keeps only the
   presentation of results/reasons).
4. Add auth/session handling around the existing onboarding flow.

Because the UI, content and flows are already built and validated, the remaining
work is overwhelmingly **backend + wiring**, not redesign.

---

## 10. Decisions to confirm

These few choices shape the build — worth locking before Phase 0:

1. **Platform**: Supabase (recommended) vs. custom Node/Postgres.
2. **Payments**: M-Pesa + which card provider (Flutterwave / Paystack / Stripe)?
3. **Verification vendor**: Smile Identity (Kenya-focused) vs. Jumio vs. manual
   counsellor verification for launch.
4. **Video provider**: Daily.co vs. Twilio Video.
5. **Budget & timeline**, and whether a **licensed counsellor** is available to
   sign off the crisis-safety protocol and counselling data handling.

---

*This scope maps 1:1 to the features in the prototype. Nothing here requires
throwing away front-end work already done.*

---

## 11. Build status

Phases 0–3 exist as reviewed migrations in [`../supabase/migrations/`](../supabase/migrations/)
with matching client methods in `../backend.js`. Phase 0's onboarding is wired
into the UI; Phase 1–3 client methods are ready but the UI still runs on
`localStorage`. Phase 4 (Couple Space) is the remaining feature area.

Payments still need their **Edge Functions** (M-Pesa Daraja STK push + webhook
verification); the database side is done and deliberately refuses to grant
entitlement from anything but a verified server-side callback.

**Validation debt: cleared.** The migrations now run against an embedded
Postgres (PGlite) under an automated suite that impersonates member /
counsellor / admin / anon sessions — **52 assertions, 0 failures**
(`cd supabase/tests && npm install && npm test`). It proves the properties that
actually matter: members can't read each other's profiles or escalate their
role, counsellors see only their own clients, clinical notes are invisible to
the member they describe, a member can't grant themselves premium, and consent
gates messaging.

Running it caught three real bugs that careful reading had missed — a
completely broken `send_message`, staff appearing in the dating pool, and a
hardening regression that blocked all message reads. Any new policy or RPC
should ship with a case in that suite.

Still needs a hosted project: GoTrue auth flows, provider webhooks (M-Pesa /
card), and the Edge Functions for real moderation, video tokens and
notification fan-out.
