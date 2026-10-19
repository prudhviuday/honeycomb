import { jsonResponse, isUuid, requireUser } from "../_shared/auth.ts";
import { getTaskVerificationCatalog, getTaskVerifier } from "../_shared/verification/task-registry.ts";
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
function respond(body: unknown, status = 200): Response {
  const base = jsonResponse(body, status), headers = new Headers(base.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(base.body, { status: base.status, headers });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  let ctx;
  try { ctx = await requireUser(req); }
  catch (error) { return respond({ error: error instanceof Error ? error.message : "Authentication failed." }, 401); }
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return respond({ error: "Content-Type must be application/json." }, 415);
  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 8192) return respond({ error: "Request body is too large." }, 413);
  let raw: string;
  try { raw = await req.text(); } catch { return respond({ error: "Request body could not be read." }, 400); }
  if (new TextEncoder().encode(raw).byteLength > 8192) return respond({ error: "Request body is too large." }, 413);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return respond({ error: "Request body must be a JSON object." }, 400);
    body = parsed as Record<string, unknown>;
  } catch { return respond({ error: "Request body must be valid JSON." }, 400); }
  if (body.action === "catalog") return respond({ ...getTaskVerificationCatalog(), success: true });
  if (!isUuid(body.task_id)) return respond({ error: "A valid task_id is required." }, 400);
  try {
    const { data: task, error: taskError } = await ctx.admin.from("missions")
      .select("id,campaign_id,name,is_active,starts_at,ends_at,progress_event_type_id,verification_action,verification_config")
      .eq("id", body.task_id).maybeSingle();
    if (taskError) throw new Error("Task configuration could not be loaded.");
    if (!task) return respond({ error: "Task not found." }, 404);
    if (task.is_active !== true) return respond({ error: "This task is paused." }, 409);
    const now = Date.now();
    if (task.starts_at && Date.parse(task.starts_at) > now) return respond({ error: "This task has not started yet." }, 409);
    if (task.ends_at && Date.parse(task.ends_at) < now) return respond({ error: "This task has ended." }, 409);
    const { data: campaign, error: campaignError } = await ctx.admin.from("campaigns").select("id,active").eq("id", task.campaign_id).maybeSingle();
    if (campaignError) throw new Error("Campaign eligibility could not be checked.");
    if (!campaign || campaign.active !== true) return respond({ error: "The campaign is not active." }, 409);
    const { data: member, error: memberError } = await ctx.admin.from("campaign_users").select("id,status")
      .eq("campaign_id", task.campaign_id).eq("user_id", ctx.user.id).maybeSingle();
    if (memberError) throw new Error("Campaign membership could not be checked.");
    if (!member || member.status !== "active") return respond({ error: "Join this campaign before completing its tasks." }, 403);
    const action = typeof task.verification_action === "string" ? task.verification_action : "event_progress";
    const verifier = getTaskVerifier(action);
    if (!verifier) return respond({
      error: action === "event_progress" ? "This task advances from trusted events and cannot be manually completed." : "This verification method is not registered on the server.",
      verification_action: action, supportedMethods: getTaskVerificationCatalog().methods.map(m => m.key),
    }, 409);
    if (task.progress_event_type_id == null) return respond({ error: "Assign an activity category in HoneyBadgerAdmin first." }, 409);
    const verified = await verifier.verify({
      admin: ctx.admin, userId: ctx.user.id,
      task: { id: task.id, campaign_id: task.campaign_id, name: task.name, is_active: task.is_active,
        starts_at: task.starts_at ?? null, ends_at: task.ends_at ?? null,
        progress_event_type_id: task.progress_event_type_id, verification_action: action,
        verification_config: task.verification_config && typeof task.verification_config === "object" ? task.verification_config as Record<string, unknown> : {} },
    });
    if (!verified.verified || !verified.evidence) return respond({ error: verified.message, verified: false }, verified.status ?? 400);
    const { data: eventType, error: eventTypeError } = await ctx.admin.from("activity_event_types")
      .select("id,code").eq("id", task.progress_event_type_id).maybeSingle();
    if (eventTypeError) throw new Error("Task activity category could not be checked.");
    if (!eventType) return respond({ error: "The task's activity category no longer exists." }, 409);
    if (verifier.requiredEventTypeCode && eventType.code !== verifier.requiredEventTypeCode) {
      return respond({ error: "This verifier requires activity category '" + verifier.requiredEventTypeCode + "'." }, 409);
    }
    const eventKey = "task-verification:" + task.id + ":" + ctx.user.id + ":" + verified.evidence.idempotencyKey;
    const { data: result, error: rpcError } = await ctx.admin.rpc("record_verified_task_activity", {
      p_mission_id: task.id, p_user_id: ctx.user.id, p_event_type_id: Number(eventType.id),
      p_event_key: eventKey, p_entity_type: verified.evidence.entityType, p_entity_id: verified.evidence.entityId,
      p_metadata: { ...(verified.evidence.metadata ?? {}), verification_action: action },
    });
    if (rpcError) {
      console.error("Verified task activity RPC failed", { code: rpcError.code, message: rpcError.message });
      throw new Error("Verified evidence could not be recorded. Confirm the required migrations are applied.");
    }
    return respond({ success: result?.success === true, verified: true, duplicate: result?.duplicate === true,
      activityNumber: result?.activityNumber ?? null, progress: result?.progress ?? null, completed: result?.completed ?? false,
      tasksCompleted: result?.tasksCompleted ?? [],
      message: result?.duplicate ? "This evidence has already been used." : result?.completed ? "Task completed and reward processed." : "Task evidence verified and progress updated." });
  } catch (error) {
    console.error("complete-task failed", { userId: ctx.user.id, error: error instanceof Error ? error.message : "Unknown error" });
    return respond({ error: error instanceof Error ? error.message : "Task verification is temporarily unavailable." }, 500);
  }
});
