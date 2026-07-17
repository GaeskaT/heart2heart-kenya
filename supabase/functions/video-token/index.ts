/* ============================================================================
   video-token — mint a short-lived token for a counselling video session.

   The Daily.co API key NEVER reaches the client. This function checks that the
   caller is genuinely the booking's member or counsellor, then mints a token
   scoped to that room and expiring shortly after the session.

   Flow:
     client (user JWT) -> this function
       1. resolve the caller from their JWT
       2. booking_for_video() confirms they're on that booking (member OR
          counsellor) and that it's a video session
       3. refuse outside a sensible window around the appointment
       4. create the room if needed, mint a token, return it

   Secrets: DAILY_API_KEY
   Deploy:  supabase functions deploy video-token
   ============================================================================ */
import { json, preflight, requireUser, serviceClient, handleError, HttpError } from "../_shared/http.ts";
import { joinWindow } from "../_shared/video.ts";

const DAILY = "https://api.daily.co/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  try {
    if (req.method !== "POST") throw new HttpError(405, "POST only");

    const apiKey = Deno.env.get("DAILY_API_KEY");
    if (!apiKey) throw new HttpError(500, "DAILY_API_KEY is not configured");

    const { id: userId } = await requireUser(req);
    const { booking_id } = await req.json().catch(() => ({}));
    if (!booking_id) throw new HttpError(400, "booking_id is required");

    const svc = serviceClient();
    const { data: rows, error } = await svc.rpc("booking_for_video", {
      p_booking: booking_id, p_user: userId,
    });
    if (error) throw error;
    const booking = rows?.[0];
    // Same 404 whether it doesn't exist or isn't theirs — don't leak which.
    if (!booking) throw new HttpError(404, "booking not found");
    if (booking.status !== "scheduled") throw new HttpError(409, `session is ${booking.status}`);
    if (!booking.video_room) throw new HttpError(409, "no room on this booking");

    const when = joinWindow(new Date(booking.scheduled_at), booking.duration_mins ?? 50, new Date());
    if (when === "early") throw new HttpError(425, "the session room opens 10 minutes before your appointment");
    if (when === "over") throw new HttpError(410, "this session has ended");

    const H = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    const room = booking.video_room;

    // Idempotent: create the room only if it isn't there yet.
    const probe = await fetch(`${DAILY}/rooms/${room}`, { headers: H });
    if (probe.status === 404) {
      const exp = Math.floor(new Date(booking.scheduled_at).getTime() / 1000) + (booking.duration_mins + 60) * 60;
      const made = await fetch(`${DAILY}/rooms`, {
        method: "POST", headers: H,
        body: JSON.stringify({
          name: room,
          privacy: "private",              // token required to join
          properties: { exp, eject_at_room_exp: true, enable_chat: false },
        }),
      });
      if (!made.ok) throw new Error(`daily room create failed: ${made.status} ${await made.text()}`);
    } else if (!probe.ok) {
      throw new Error(`daily room lookup failed: ${probe.status}`);
    }

    const tokenRes = await fetch(`${DAILY}/meeting-tokens`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        properties: {
          room_name: room,
          user_id: userId,
          exp: Math.floor(Date.now() / 1000) + 60 * 60,   // short-lived
          is_owner: false,
        },
      }),
    });
    if (!tokenRes.ok) throw new Error(`daily token failed: ${tokenRes.status} ${await tokenRes.text()}`);
    const { token } = await tokenRes.json();

    return json({ room, token, url: `https://${Deno.env.get("DAILY_DOMAIN") ?? "your-domain.daily.co"}/${room}?t=${token}` });
  } catch (e) {
    return handleError(e);
  }
});
