/* ============================================================================
   Moderation + crisis detection.

   Replaces the first-pass keyword screen in the database (moderate_text() /
   crisis_signal()) with a real model, run BEFORE a message is delivered.

   Design note: this is a safety-critical path in an app used by people who are
   often healing from hard experiences. Two deliberate choices:

   1) FAIL CLOSED on crisis signals. If the model is unreachable we fall back to
      the keyword screen rather than assuming a message is fine.
   2) Crisis detection is SEPARATE from abuse moderation. A member writing "I
      want to die" is not misbehaving — that message should still reach their
      match, but it must raise a safety flag for the counselling team. Treating
      distress as a policy violation would be actively harmful.
   ============================================================================ */

export type ModerationStatus = "approved" | "flagged" | "blocked";

export interface Verdict {
  status: ModerationStatus;
  categories: Record<string, unknown>;
  model: string;
  crisis: string | null;      // 'self_harm' | null
}

/* ---------------------------------------------------------------------------
   Pure helpers (unit-tested from Node)
   --------------------------------------------------------------------------- */

/** Keyword fallback — mirrors the SQL in 0002 so behaviour matches when the model is down. */
export function keywordScreen(body: string): ModerationStatus {
  return /\b(stupid|idiot|hate you|shut up)\b/i.test(body) ? "flagged" : "approved";
}

/** Crisis screen — mirrors crisis_signal() in 0002. */
export function keywordCrisis(body: string): string | null {
  return /\b(kill myself|end it all|suicide|want to die|self.?harm)\b/i.test(body) ? "self_harm" : null;
}

/**
 * Maps an OpenAI moderation result to our status.
 *
 * self-harm categories are intentionally NOT treated as a violation: they set
 * `crisis` instead, so the message is delivered AND the counselling team is
 * alerted. Only genuinely harmful-to-others content is blocked/flagged.
 */
export function verdictFromOpenAI(result: any, model = "omni-moderation-latest"): Verdict {
  const cats: Record<string, boolean> = result?.categories ?? {};
  const scores: Record<string, number> = result?.category_scores ?? {};

  const selfHarm = !!(cats["self-harm"] || cats["self-harm/intent"] || cats["self-harm/instructions"]);
  const crisis = selfHarm ? "self_harm" : null;

  // Severe, targeted harm -> block outright (hidden from the recipient).
  const severe = !!(cats["harassment/threatening"] || cats["violence/graphic"] || cats["sexual/minors"]);
  // Lesser violations -> flagged: held for review, visible to sender + staff.
  const lesser = !!(cats["harassment"] || cats["hate"] || cats["hate/threatening"] || cats["violence"] || cats["sexual"]);

  const status: ModerationStatus = severe ? "blocked" : lesser ? "flagged" : "approved";

  return {
    status,
    categories: { source: "openai", categories: cats, scores, self_harm: selfHarm },
    model,
    crisis,
  };
}

/* ---------------------------------------------------------------------------
   Model call
   --------------------------------------------------------------------------- */

/**
 * Moderates one message. Never throws: on any model/network failure it falls
 * back to the keyword screen so a send is never silently unmoderated.
 */
export async function moderate(body: string, apiKey: string | undefined): Promise<Verdict> {
  const fallback = (why: string): Verdict => ({
    status: keywordScreen(body),
    categories: { source: "keyword-fallback", reason: why },
    model: "keyword-v1",
    crisis: keywordCrisis(body),
  });

  if (!apiKey) return fallback("no OPENAI_API_KEY configured");

  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: body }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return fallback(`openai ${res.status}`);
    const j = await res.json();
    const result = j?.results?.[0];
    if (!result) return fallback("openai returned no result");

    const v = verdictFromOpenAI(result);
    // Belt and braces: the keyword crisis screen also runs, so a phrasing the
    // model misses still raises a flag.
    if (!v.crisis) v.crisis = keywordCrisis(body);
    return v;
  } catch (e) {
    return fallback(`openai error: ${(e as Error).message}`);
  }
}
