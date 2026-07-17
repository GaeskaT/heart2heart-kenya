/* ============================================================================
   Shared HTTP / auth helpers for the Edge Functions.
   ============================================================================ */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const preflight = () => new Response("ok", { headers: corsHeaders });

/**
 * Resolves the CALLER from their JWT. Never trust a user id sent in the body —
 * this is what stops one member acting as another.
 */
export async function requireUser(req: Request): Promise<{ id: string; client: SupabaseClient }> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new HttpError(401, "missing bearer token");

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) throw new HttpError(401, "invalid session");
  return { id: data.user.id, client };
}

/**
 * Service-role client. Bypasses RLS — only ever construct this AFTER the
 * caller's identity and permission have been established.
 */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function handleError(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error("[edge] unhandled:", e);
  // Don't leak internals to the client.
  return json({ error: "internal error" }, 500);
}
