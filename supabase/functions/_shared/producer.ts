import { corsHeaders } from "./cors.ts";
import type { createUserClient } from "./supabase.ts";

type View = "films" | "overview" | "map" | "venues" | "funnel";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const metrics = ["scans", "unique_users", "task_completions", "reward_claims", "interactions"];
function fail(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status, headers: corsHeaders });
}
export function producerHandler(view: View, makeClient: typeof createUserClient) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Use POST", 405);
    if (!req.headers.get("Authorization")) return fail("UNAUTHORIZED", "Sign in to continue", 401);
    try {
      const client = makeClient(req);
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) return fail("UNAUTHORIZED", "Sign in to continue", 401);
      let body;
      try { body = await req.json(); } catch { return fail("VALIDATION_ERROR", "Send a JSON body", 400); }
      if (!body || typeof body !== "object") return fail("VALIDATION_ERROR", "Send a JSON object", 400);
      if (view === "films") {
        const { data, error } = await client.rpc("blueprint_campaigns");
        if (error) return fail("REPORT_UNAVAILABLE", "Campaign list could not be loaded", 503);
        return Response.json({ data }, { headers: corsHeaders });
      }
      const start = Date.parse(body.from), end = Date.parse(body.to);
      if (!uuid.test(body.campaign_id) || !Number.isFinite(start) || !Number.isFinite(end)
        || end <= start || end - start > 366 * 86400000) {
        return fail("VALIDATION_ERROR", "Choose a campaign and a date range of up to 366 days", 400);
      }
      if (view === "map" && !metrics.includes(body.metric ?? "scans")) return fail("VALIDATION_ERROR", "Unsupported map metric", 400);
      const { data, error } = await client.rpc("blueprint_report", {
        p_campaign_id: body.campaign_id, p_from: new Date(start).toISOString(), p_to: new Date(end).toISOString(),
      });
      if (error) return error.code === "42501"
        ? fail("FORBIDDEN", "Campaign analytics access required", 403)
        : fail("REPORT_UNAVAILABLE", "Analytics could not be loaded", 503);
      let result = data;
      if (view === "venues") result = { venues: data.venues, privacy_minimum: 10 };
      if (view === "funnel") result = { stages: data.funnel, exposure: null, privacy_minimum: 10, sequential_cohort: false };
      if (view === "map") {
        const metric = body.metric ?? "scans";
        result = { metric, privacy_minimum: 10, points: data.venues
          .filter((v: Record<string, unknown>) => v.lat != null && v.lng != null && v[metric] != null)
          .map((v: Record<string, unknown>) => ({ venue_id: v.id, name: v.name, lat: v.lat, lng: v.lng, value: v[metric] })) };
      }
      return Response.json({ data: result }, { headers: corsHeaders });
    } catch {
      return fail("REPORT_UNAVAILABLE", "Analytics could not be loaded", 503);
    }
  };
}
