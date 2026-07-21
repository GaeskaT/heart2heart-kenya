# Crisis & Safety Protocol — clinician sign-off framework

> **STATUS: TEMPLATE — NOT YET A VALID PROTOCOL.**
> This document is a *scaffold*. Every item marked **[CLINICIAN TO DEFINE]**,
> **[LEGAL]**, or **[VERIFY]** must be completed and the whole reviewed, edited,
> and **signed off by a licensed mental-health clinician** (registered with the
> Kenya Counsellors & Psychologists Board) before Heart2Heart processes real
> users. The engineering team built the *machinery* the protocol runs on; it did
> **not** and cannot define the clinical decisions here. Do not launch on this
> template alone.

Owner (clinician): ____________________  Board reg. no.: __________
Version: 0 (draft)   Effective date: __________   Review date: __________

---

## 1. Why this exists

Heart2Heart serves people who are often healing from painful experiences. Some
will be in genuine distress, including risk to their own life. This protocol
defines **how the service recognises that and responds** — humanely, quickly,
and within Kenyan law and professional standards. A person in crisis who reaches
out and is not helped is the outcome this document exists to prevent.

## 2. Scope & boundaries — **this must stay explicit to members**

- Heart2Heart **is**: peer connection, guided content, a *Listening Centre*
  (non-clinical listening), and access to booked counselling.
- Heart2Heart **is NOT** an emergency service, a crisis hotline, or a substitute
  for emergency care. It cannot guarantee an immediate human response at any hour.
- Every member-facing crisis surface states this boundary and points to real
  emergency services (implemented — see §11).

**[CLINICIAN TO DEFINE]** any additional scope limits (e.g. minimum age already
enforced at 18; exclusion criteria; conditions the service will not attempt to
support and will instead refer out).

## 3. What the technology already does (so you design on facts, not guesses)

- **Detection.** Free-text a member writes (private messages, confidential
  questions, listening-request notes, community posts) is screened for
  distress/self-harm signals — today by a keyword screen (`crisis_signal()` in
  SQL) and, where the moderation Edge Function is deployed, by a moderation model
  (`_shared/moderation.ts`). Self-harm is treated as **distress, never
  misconduct**: the message is still delivered, and a flag is raised.
- **Flagging.** A signal writes a row to `safety_flags` (`migration 0002`) with a
  severity stamped by `crisis_severity()` (`migration 0011`).
- **Triage queue.** Staff can list, claim, action and resolve flags
  (`safety_queue()`, `claim_safety_flag()`, `record_safety_action()`), with full
  timestamps, outcome, notes, and an escalation flag — all audited. Members
  cannot see or reach any of this (RLS + in-function guards, asserted in tests).
- **Realtime.** A staff dashboard can subscribe to `safety_flags` and receive a
  new flag the instant it lands.
- **Immediate member response.** The moment distress is detected, the member is
  shown emergency numbers + supportive text (see §11).

**Known limits you must account for:**
- Detection is **imperfect** — it misses paraphrase/indirect language (false
  negatives) and over-triggers on figures of speech (false positives).
- There is **no automated risk assessment** — severity is a crude signal→tier
  map, *not* a clinical judgement.
- Detection only sees **text the member writes in-app** — not phone calls,
  voice, or anything outside the app.

## 4. Severity tiers — **[CLINICIAN TO DEFINE]**

Define the tiers and what each means clinically. The current code ships a
placeholder (`self_harm → critical`, else `high`); replace it with your mapping.

| Tier | Clinical meaning | Example indicators |
|---|---|---|
| Critical | _[define — e.g. imminent risk to life]_ | _[define]_ |
| High | _[define]_ | _[define]_ |
| Moderate | _[define]_ | _[define]_ |

## 5. Response pathway per tier — **[CLINICIAN TO DEFINE]**

For each tier, define **who responds, within what time, and doing what.** These
targets drive staffing (§9) and are what the team is accountable to.

| Tier | First responder | Target response time | Required actions | When to escalate |
|---|---|---|---|---|
| Critical | _[role]_ | _[e.g. minutes]_ | _[assess, contact member, safety plan, emergency services if…]_ | _[criteria]_ |
| High | _[role]_ | _[e.g. hours]_ | _[…]_ | _[…]_ |
| Moderate | _[role]_ | _[e.g. next working day]_ | _[…]_ | _[…]_ |

**Contacting the member.** Define how a responder reaches a flagged member and
with what consent. Note: the app stores a callback number only for *listening
requests*; for other sources the responder may have only in-app contact.
**[CLINICIAN + OPS TO DEFINE]**

## 6. Escalation, duty of care & the law — **[CLINICIAN + LEGAL]**

- Criteria and authority for escalating to emergency services or a member's
  named contact. **[CLINICIAN TO DEFINE]**
- Duty-of-care / duty-to-warn obligations and their limits under Kenyan law and
  Board ethics — including when confidentiality may be broken to preserve life,
  and who authorises it. **[LEGAL + CLINICIAN]**
- Handling of risk to others (not only self-harm). **[CLINICIAN TO DEFINE]**

## 7. Emergency & referral resources (Kenya) — **[VERIFY every entry]**

The app currently shows the entries below. **Confirm each number is current and
correct before launch, and add the service's own crisis / on-call line.** A
wrong number in a crisis is dangerous.

- Emergency (police / ambulance): **999 / 112** — [verify]
- Kenya Red Cross support line: **1199** — [verify]
- Befrienders Kenya — confidential emotional support: befrienderskenya.org — [verify current phone]
- Heart2Heart crisis / on-call line: **[ADD]**
- Nearest emergency departments / referral partners: **[ADD, by region]**

## 8. Staffing & on-call model — **[CLINICIAN / OPS TO DEFINE]**

The response times in §5 are only real if someone is available to meet them.
Define: on-call rota, hours of cover, out-of-hours behaviour, responder-to-load
ratio, backup when the first responder is unavailable, and how the on-call
person is alerted (the dashboard subscribes to `safety_flags` in realtime;
push/SMS alerting is not yet built — see §12).

## 9. Consent, confidentiality & data — **[CLINICIAN + LEGAL/DPA]**

- What members are told at onboarding about crisis handling and its limits.
  (Consent is already captured; the wording is yours to approve.)
- Limits of confidentiality (tie to §6).
- Retention of `safety_flags` and response records; who may access them (staff
  only today); alignment with the **Kenya Data Protection Act, 2019** and your
  DPA counsel.

## 10. What the member experiences

Already implemented and yours to approve/reword:
- A persistent **"Struggling right now?"** button on Wellness → emergency numbers
  + the boundary statement + supportive text.
- The same support surfaces **automatically** when distress is detected in a
  message, question, listening note, or a very low wellness check-in.
- The Listening Centre is clearly framed as **listening, not counselling**.

**[CLINICIAN TO DEFINE]** the exact wording of crisis-facing copy and the
supportive message shown, so it is clinically appropriate and non-harmful.

## 11. Records, audit, QA & drills — **[CLINICIAN / OPS TO DEFINE]**

- Every claim/action/resolution is timestamped and written to `audit_log`.
- Define: response-time monitoring, mandatory incident review after any critical
  flag, near-miss review, periodic **drills**, and the cadence of protocol
  review (date at top).

## 12. Responder training & competence — **[CLINICIAN TO DEFINE]**

Who may act on flags, what training/credentials they need (listeners are
explicitly non-clinical and must **hand off** rather than counsel), and how
competence is assured and refreshed.

## 13. Gaps engineering still owes this protocol

- **Alerting:** realtime dashboard subscription exists; **push/SMS/email
  alerting to the on-call responder is not built yet.** Until it is, response
  depends on someone actively watching the dashboard — factor this into §8.
- **Staff dashboard UI:** the triage RPCs exist and are tested, but a
  counsellor-facing dashboard screen is not built into the app yet.
- **Detection quality:** keyword screen today; deploy the moderation Edge
  Function for the model-based screen, and plan ongoing tuning.

## 14. Sign-off

By signing, the clinician confirms every **[CLINICIAN TO DEFINE]** item is
completed, the protocol is clinically sound and lawful in Kenya, and the service
may operate under it.

Clinician: ____________________  Signature: ____________  Date: ________
Board reg. no.: __________
Legal review: ____________________  Date: ________
Operations owner: ____________________  Date: ________
