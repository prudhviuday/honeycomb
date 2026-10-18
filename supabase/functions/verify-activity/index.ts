import { jsonResponse, isUuid, requireUser } from "../_shared/auth.ts";
import { resolveActiveQr } from "../_shared/verification.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200): Response {
  const response = jsonResponse(body, status);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  let ctx;
  try {
    ctx = await requireUser(req);
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : "Authentication failed." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respond({ error: "Request body must be valid JSON." }, 400);
  }

  const action = body.action;
  if (action === "resolve_qr") {
    // This is a lookup/preview only; it does not award points or advance tasks.
    // Actual reward-bearing scans must go through the existing transactional
    // process_scan RPC until it is migrated to the shared task engine.
    if (typeof body.code !== "string") return respond({ error: "code is required." }, 400);
    try {
      const qr = await resolveActiveQr(ctx.admin, body.code);
      if (!qr) return respond({ valid: false, message: "QR is invalid, inactive, expired, or exhausted." });
      return respond({
        valid: true,
        qr: {
          id: qr.id,
          campaignId: qr.campaign_id,
          purpose: qr.purpose,
          qrType: qr.qr_type,
          venueId: qr.venue_id,
          huntId: qr.hunt_id,
          displayName: qr.display_name,
        },
      });
    } catch (error) {
      console.error("QR verification failed", error);
      return respond({ error: "QR verification is temporarily unavailable." }, 500);
    }
  }

  // Deliberately fail closed: do not accept frontend assertions such as
  // {action:"trailer_completed"} as evidence. These actions will be enabled
  // only when backed by server-verifiable playback, quiz, VR or referral records.
  const supportedActions = ["resolve_qr"];
  if (typeof action !== "string" || !supportedActions.includes(action)) {
    return respond({
      error: "Unsupported or not-yet-enabled verification action.",
      supportedActions,
      note: "Client claims alone never qualify a task or grant a reward.",
    }, 400);
  }

  if (!isUuid(ctx.user.id)) return respond({ error: "Authenticated user id is invalid." }, 401);
  return respond({ error: "Unexpected request state." }, 400);
});
