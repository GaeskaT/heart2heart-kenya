# Heart2Heart Kenya 💚

> *Healing first. Healthy relationships next.*

A counsellor-guided relationship app for healthy dating and marriage. Unlike a
conventional dating app, Heart2Heart is for adults who have completed counselling
and are emotionally ready to build intentional, respectful relationships.

This repo is a **front-end prototype** — a fully working, offline, single-page web
app (no backend, no build step). All state is saved in the browser's
`localStorage`.

## 📱 Live demo

**[https://gaeskat.github.io/heart2heart-kenya/](https://gaeskat.github.io/heart2heart-kenya/)**

Works on any phone or desktop browser — no sign-in needed. Best experienced at
phone width. Auto-updates on every push to `main`. Reset anytime from
**You → Reset demo**.

## Run it locally

Any static file server works. For example:

```bash
python -m http.server 5566
# then open http://127.0.0.1:5566
```

Or just open `index.html` directly in a browser.

Best viewed at phone width (the layout is mobile-first; on desktop it renders in a
centered phone frame).

## What's built (real, working logic)

The four stages of the member journey are implemented end to end:

1. **Invitation & eligibility** — counsellor invite code + eligibility confirmation.
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

1. **Get started → enter any code** (e.g. `H2H-KE-2026`) and tick the boxes.
2. Build a profile, then complete the **Relationship Readiness** assessment.
3. Agree to the code of conduct and see your **Wellness Score**.
4. On **Matches**, open someone and **Express interest** — they'll accept and the
   chat unlocks. Someone will also have expressed interest in *you*.
5. Chat, then try the **⋯** menu to report/block, or send a rude message to see
   moderation kick in.

Reset anytime from **You → Reset demo**.

---

*Prototype scope, per the product brief: the core member journey built for real,
with the wider feature set stubbed for a later release.*
