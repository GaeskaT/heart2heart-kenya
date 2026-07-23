# Heart2Heart Kenya 💚

> *Healing first. Healthy relationships next.*

A counsellor-guided relationship app for healthy dating and marriage. Unlike a
conventional dating app, Heart2Heart is for adults who are emotionally ready to
build intentional, respectful relationships. Counselling is offered and encouraged
throughout the journey, but is **not** a requirement to join or to be matched.

This repo is a **front-end prototype** — a fully working, offline, single-page web
app (no backend, no build step). All state is saved in the browser's
`localStorage`.

## 📱 Live demo

**[https://gaeskat.github.io/heart2heart-kenya/](https://gaeskat.github.io/heart2heart-kenya/)**

Works on any phone or desktop browser — no sign-in needed. Best experienced at
phone width. Auto-updates on every push to `main`. Reset anytime from
**You → Reset demo**.

**Installable (PWA):** open the link on your phone and use *Add to Home Screen*
(or the in-app **Install app** button on Chrome/Android) to run it full-screen
like a native app. It works offline once loaded, via a service worker
(`sw.js`) + web manifest. Icons are generated dependency-free by
`tools/build-icons.mjs`.

## Run it locally

Any static file server works. For example:

```bash
python -m http.server 5566
# then open http://127.0.0.1:5566
```

Or just open `index.html` directly in a browser.

Best viewed at phone width (the layout is mobile-first; on desktop it renders in a
centered phone frame).

## Optional: connect a real backend (Supabase)

The app runs fully offline on `localStorage` by default. To switch onboarding to
**real Supabase Auth + database** (Phase 0):

1. Apply the schema in [`supabase/`](supabase/) to a Supabase project.
2. Enable Email auth in the Supabase dashboard.
3. Paste your project **URL** and **anon/public** key into
   [`supabase-config.js`](supabase-config.js).

That's it — the app auto-detects the config and wires sign-up / log-in, the
profile, the readiness assessment and consent to Supabase. (Registration is open,
so no invite code is required.) The membership subscription is a simulated,
client-side gate and is not persisted server-side in this prototype.
With the config blank it stays in local-only mode (nothing external is loaded).
The `anon` key is safe to commit; **never** put the `service_role` key here.

## What's built (real, working logic)

The four stages of the member journey are implemented end to end:

1. **Open registration** — no invitation code and no counselling attendance
   required. Anyone confirms a short eligibility check (18+, emotionally ready,
   seeking a healthy relationship) and can register to explore. Browsing is free;
   **using** any feature requires an active membership (see below).
2. **Stage 1 · Healthy Self** — a 6-dimension **Relationship Readiness** assessment
   (emotional wellness, communication, conflict resolution, values, life goals,
   expectations) that computes a private **Relationship Wellness Score**, plus a
   community **Code of Conduct** agreement.
3. **Stage 2 · Meet with Purpose** — a **compatibility matcher** that scores each
   candidate on shared values, relationship intention, faith, family goals, mutual
   age fit and location, then surfaces a *limited* set of carefully selected matches
   (no endless swiping) with transparent "why you match" reasons.
4. **Stage 3 · Guided Dating** — weekly reflection prompts, relationship exercises,
   and **mutual-consent messaging**: no anonymous chat — a conversation only opens
   after *both* people express interest. Includes report/block and a lightweight
   AI-moderation guard on abusive language.

### Membership (access model)

Registration is **open and free** — anyone can create a profile and *browse* the
whole app (Home and Profile show every feature). *Using* a feature — Matches,
Messages, the Learning Academy, Wellness Tools, Couple Space, Marriage Prep,
Community, Events and Counsellor Support — requires an **active membership
package**. Both packages **recur monthly**:

| Package | Price / month | Matches | Counselling | Webinars | Groups |
|---------|---------------|---------|-------------|----------|--------|
| **Basic**   | KES 2,500 | up to 5   | 1 free session  | up to 5   | 1 group |
| **Premium** | KES 3,500 | unlimited | 2 free sessions | unlimited | unlimited |

Both include the full Learning Academy and Wellness Tools. A central router gate
shows a feature-aware paywall on any locked route (with both packages to choose
from); the Membership screen lets you switch package or cancel. Package **limits
are enforced** in-app — reaching a Basic cap surfaces an upgrade-to-Premium
prompt. ("One group membership" spans both Support Groups and Community Groups
combined.) **Prototype — no payment is ever taken.** Crisis and safety helplines
stay reachable from the paywall, always free.

### Learning Academy (fully built)

10 courses / 35 lessons of real, readable content — course detail pages, a
lesson reader (intro → sections → key takeaways → reflection prompt), completion
tracking, per-course and overall progress bars, a "continue learning" resume
card, and a course-complete celebration. Progress persists in `localStorage` and
rolls up onto the Home and Learn screens.

### Wellness Tools (fully built)

A private wellness hub with real, interactive tools, all persisted in
`localStorage`:

- **Mood tracker** — daily emoji check-in with an optional note, a rolling
  7-day mood trend chart, and a daily streak.
- **Guided breathing** — an animated breathing orb with three patterns (box,
  4-7-8, slow & soft) that expands and contracts through timed phases.
- **Gratitude journal** — add and browse dated entries.
- **Daily affirmations** — a rotating affirmation you can shuffle and favourite.
- **Prayer & meditation prompts** — faith-inclusive reflection prompts.
- **Wellness check-in** — a short self-review that responds with a compassionate
  summary and, on low scores, gently offers a route to counsellor support.

Today's mood surfaces on the Home screen.

### Counsellor Support (fully built)

Professional support throughout the journey, all persisted in `localStorage`:

- **Book a session** — choose session type (refresher, individual, couples,
  quick call), a counsellor, a format (**video / phone / in person**), a day and
  a time; upcoming sessions show on the hub and Home, with cancel and a
  **Join video call** action for video bookings.
- **Ask a question** — a confidential thread to the counselling team that
  acknowledges each question (a counsellor follows up).
- **Webinars** — register / cancel for live counsellor-led sessions.
- **Support groups** — join / leave moderated groups by life season.
- **Resources** — a small library that deep-links into Academy courses, plus
  info cards (including Kenya crisis/safety helplines and when to seek help).

### Couple Space, Marriage Prep, Community, Events & Premium (fully built)

The remaining areas are now real, interactive features, all persisted:

- **Couple Space** — unlocks when you commit with a connected match (or a demo
  partner). Inside: a **shared journal**, **couple goals**, a **date planner**
  (with suggestions), a **budget planner** (income/expense/balance), a **weekly
  relationship check-in**, and computed **anniversary milestones**.
- **Marriage Preparation** — a Stage 4 pathway of 7 guided conversations
  (finances, conflict, family, parenting, intimacy, legal, wedding) with a
  detail view and progress tracking.
- **Community Groups** — 6 moderated discussion groups by life season; join /
  leave and post to a group feed (with seeded discussion).
- **Events** — mixers, seminars, workshops, a retreat and a service day, each
  with date, location, price and RSVP.
- **Premium** — Free / Premium / Premium+ tiers with a feature comparison and a
  simulated upgrade flow (**prototype — no payment is ever taken**).

Every feature's state surfaces on the Profile "Your journey" rows.

## Everything is built

All stages and feature clusters from the concept are now implemented as working,
persisted features. This is a front-end prototype: matching, verification,
counsellor accounts and payments are simulated, with no backend.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell + bottom tab bar |
| `style.css`  | Design system (warm, calm, trustworthy; mobile-first) |
| `data.js`    | Seed data: candidate pool, readiness questions, counties, content |
| `lessons.js` | Learning Academy: 10 courses / 35 lessons of content |
| `app.js`     | SPA engine: hash router, state, compatibility matcher, all screens |

## Try the flow

1. **Get started → tick the boxes** — no invitation code needed; anyone can join.
2. Build a profile, then complete the **Relationship Readiness** assessment.
3. Agree to the code of conduct and see your **Wellness Score**. A quick
   **onboarding tour** runs the first time you reach Home (replay it anytime from
   **You → App tour**). Browse freely — Home and Profile show every feature.
4. Tap any feature (e.g. **Matches** or **Learn**) to hit the membership paywall,
   then choose **Basic** or **Premium** (simulated — no payment is taken) to unlock
   the app. Switch package or cancel from **You → Membership**.
5. Open someone and **Express interest** — they'll accept and the chat unlocks.
   Someone will also have expressed interest in *you*.
6. Chat, then try the **⋯** menu to report/block, or send a rude message to see
   moderation kick in.

Reset anytime from **You → Reset demo**.

---

*Prototype scope, per the product brief: the core member journey built for real,
with the wider feature set stubbed for a later release.*
