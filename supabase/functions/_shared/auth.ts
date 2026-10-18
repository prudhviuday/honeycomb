import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.49.1";

export type AuthContext = { admin: SupabaseClient; user: User };

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function requireUser(req: Request): Promise<AuthContext> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Server auth configuration is missing.");
  const match = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("A valid bearer token is required.");

  // Server-only client. Never expose the service-role key to browser code.
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.getUser(match[1]);
  if (error || !data.user) throw new Error("Authentication failed.");
  return { admin, user: data.user };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
