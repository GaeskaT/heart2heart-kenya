# Supabase backend — Phase 0 (Foundations)

This folder holds the database layer for Heart2Heart Kenya. Phase 0 covers
**auth-linked profiles, counsellor invites, the readiness assessment + private
Wellness Score, consent capture, member verification, and an audit log** — all
protected by Row-Level Security.

See [`../docs/backend-scope.md`](../docs/backend-scope.md) for the full backend
plan and later phases.

> Status: the migration is written and reviewed but has **not** been run against
> a live project yet. Apply it to a fresh Supabase project to validate.

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

Roles can't be self-assigned (the schema blocks it). After you sign up once,
promote yourself from the SQL editor (runs as service role):

```sql
update public.profiles set role = 'admin'
  where id = (select id from auth.users where email = 'you@example.com');

insert into public.counsellor_invites (code, issued_by)
  values ('H2H-KE-2026', (select id from auth.users where email = 'you@example.com'));
```

## Access model (RLS summary)

| Table | Member | Counsellor / Staff | Admin |
|---|---|---|---|
| profiles | read/update **own** | read all | read/update all |
| counsellor_invites | redeem via RPC | read own-issued, create | read/update all |
| verifications | read/create **own** (no doc fields) | — | full + review |
| readiness_assessments | read/create **own** | — | read all |
| consents | read/create **own** (immutable) | — | read all |
| audit_log | — | — | read |

Key safeguards:
- `role` and `verified` on `profiles` can only be changed by an admin (enforced
  by a `BEFORE UPDATE` trigger, so a member can't escalate privileges even with a
  crafted request).
- The `is_admin()` / `is_staff()` helpers are `SECURITY DEFINER` and owned by the
  migration role, so they **bypass RLS on `profiles`** and avoid policy recursion.
- Verification `document_ref` / `provider_ref` are revoked from the `authenticated`
  role at the column level — clients never see raw verification data.

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

## Not in Phase 0

Matching, consent messaging + moderation, counselling/bookings/video, payments,
couple space, community, events, and the counsellor dashboard come in later
phases (see the scope doc). This phase is the secure foundation everything else
builds on.
