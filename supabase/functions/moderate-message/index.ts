/* ============================================================================
   moderate-message — send a message through a REAL moderation model.

   Flow:
     client (user JWT) -> this function
       1. resolve the sender from their JWT (never from the body)
       2. run the message through the moderation model
       3. insert via send_message_moderated() as service_role, which STILL
          enforces participation + blocking in the database

   The Edge Function is trusted for the verdict only. It is never trusted for
   who the sender is, or for whether they're allowed in that conversation.

   Secrets: OPENAI_API_KEY (optional — falls back to the keyword screen)
   Deploy:  supabase functions deploy moderate-message
   ============================================================================ */
import { json, preflight, requireUser, serviceClient, handleError, HttpError } from "../_shared/http.ts";
import { moderate } from "../_shared/moderation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  try {
    if (req.method !== "POST") throw new HttpError(405, "POST only");

    const { id: sender } = await requireUser(req);

    const { conversation_id, body } = await req.json().catch(() => ({}));
    if (!conversation_id || typeof body !== "string") {
      throw new HttpError(400, "conversation_id and body are required");
    }
    const text = body.trim();
    if (!text) throw new HttpError(400, "empty message");
    if (text.length > 4000) throw new HttpError(400, "message too long");

    const verdict = await moderate(text, Deno.env.get("OPENAI_API_KEY"));

    const svc = serviceClient();
    const { data, error } = await svc.rpc("send_message_moderated", {
      p_conversation: conversation_id,
      p_sender: sender,
      p_body: text,
      p_status: verdict.status,
      p_categories: verdict.categories,
      p_model: verdict.model,
      p_crisis: verdict.crisis,
    });

    if (error) {
      // These come from our own guards, so they're safe to surface verbatim.
      if (/not a participant|blocked|conversation_not_found/i.test(error.message)) {
        throw new HttpError(403, error.message);
      }
      throw error;
    }

    return json(data);
  } catch (e) {
    return handleError(e);
  }
});
