import { jsonResponse, isUuid, requireUser } from "../_shared/auth.ts";
import {
  getActivityVerifier,
  getSupportedVerificationActions,
  runVerification,
} from "../_shared/verification/index.ts";

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
  if (typeof body.action !== "string") {
    return respond({ error: "action is required." }, 400);
  }
  if (!isUuid(ctx.user.id)) return respond({ error: "Authenticated user id is invalid." }, 401);

  const verifier = getActivityVerifier(body.action);
  if (!verifier) {
    return respond({
      error: "Unsupported or not-yet-enabled verification action.",
      supportedActions: getSupportedVerificationActions(),
      note: "Client claims alone never qualify a task or grant a reward.",
    }, 400);
  }

  try {
    const outcome = await runVerification(verifier, {
      admin: ctx.admin,
      userId: ctx.user.id,
      body,
    });
    return respond(outcome.body, outcome.status ?? 200);
  } catch (error) {
    console.error("Activity verification failed", {
      action: body.action,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return respond({ error: "Verification is temporarily unavailable." }, 500);
  }
});
