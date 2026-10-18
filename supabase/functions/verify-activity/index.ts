import { jsonResponse, requireUser } from "../_shared/auth.ts";
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
  try { ctx = await requireUser(req); }
  catch { return respond({ error: "A valid signed-in session is required." }, 401); }

  // Reject known oversized requests early, then enforce the same limit while
  // streaming so a missing Content-Length cannot bypass the cap.
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 8_192) {
    return respond({ error: "Request body is too large." }, 413);
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return respond({ error: "Content-Type must be application/json." }, 415);
  }

  if (!req.body) return respond({ error: "Request body is required." }, 400);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 8_192) {
        await reader.cancel();
        return respond({ error: "Request body is too large." }, 413);
      }
      chunks.push(value);
    }
  } catch {
    return respond({ error: "Request body could not be read." }, 400);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return respond({ error: "Request body must be valid JSON." }, 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return respond({ error: "Request body must be a JSON object." }, 400);
  }
  const body = parsed as Record<string, unknown>;

  if (body.action === "resolve_qr") {
    if (typeof body.code !== "string") return respond({ error: "code is required." }, 400);
    try {
      const qr = await resolveActiveQr(ctx.admin, body.code);
      if (!qr) return respond({ valid: false, message: "QR is invalid, inactive, expired, or exhausted." });
      return respond({ valid: true, qr: {
        id: qr.id, campaignId: qr.campaign_id, purpose: qr.purpose, qrType: qr.qr_type,
        venueId: qr.venue_id, huntId: qr.hunt_id, displayName: qr.display_name,
      }});
    } catch (error) {
      console.error("QR verification failed", error);
      return respond({ error: "QR verification is temporarily unavailable." }, 500);
    }
  }

  // Fail closed: a browser-supplied "completed" flag is never evidence.
  return respond({
    error: "Unsupported or not-yet-enabled verification action.",
    supportedActions: ["resolve_qr"],
    note: "Reward-bearing scans still use the existing transactional process_scan flow. Trailer, quiz, VR and referral actions need trusted evidence sources before activation.",
  }, 400);
});
