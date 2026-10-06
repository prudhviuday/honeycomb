import { corsHeaders } from "../_shared/cors.ts";
import { createUserClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
    }

    const supabase = createUserClient(req);
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json({ error: "Authentication required" }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const scanCode = body?.scan_code;

    if (!scanCode || typeof scanCode !== "string") {
      return Response.json({ error: "scan_code is required" }, { status: 400, headers: corsHeaders });
    }

    // process_scan is already the protected database operation.
    const { data, error } = await supabase.rpc("process_scan", {
      p_code: scanCode.trim(),
    });

    if (error) throw error;

    return Response.json(
      { success: data?.success === true, result: data },
      { status: data?.success === false ? 400 : 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error("process-qr-scan:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: corsHeaders },
    );
  }
});
