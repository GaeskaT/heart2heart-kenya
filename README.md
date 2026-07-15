# Heart2Heart Kenya 💚

> *Healing first. Healthy relationships next.*

A counsellor-guided relationship app for healthy dating and marriage. Unlike a
conventional dating app, Heart2Heart is for adults who have completed counselling
and are emotionally ready to build intentional, respectful relationships.

This repo is a **core-journey prototype** — a fully working, offline, single-page
web app (no backend, no build step). All state is saved in the browser's
`localStorage`.

## Run it

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

## What's stubbed (navigable placeholders)

Presented as real, browsable screens describing what's inside, marked as roadmap:
Stage 4 Marriage Preparation, Couple Space, Community Groups, Events, Wellness
Tools, Counsellor Support, and Premium.

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
