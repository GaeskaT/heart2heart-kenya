/* ============================================================================
   Video session helpers (pure — unit-tested from Node).
   ============================================================================ */

/**
 * When may someone join a session room?
 * Open from 10 minutes before the appointment until 30 minutes after it should
 * have ended — so a token can't be minted for an arbitrary past or future
 * booking, and a session that overruns slightly still works.
 */
export function joinWindow(
  scheduledAt: Date, durationMins: number, now: Date,
): "early" | "open" | "over" {
  const opens = scheduledAt.getTime() - 10 * 60_000;
  const closes = scheduledAt.getTime() + (durationMins + 30) * 60_000;
  const t = now.getTime();
  if (t < opens) return "early";
  if (t > closes) return "over";
  return "open";
}
