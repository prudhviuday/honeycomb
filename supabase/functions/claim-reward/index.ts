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
    const rewardId = body?.reward_id;

    if (!rewardId || typeof rewardId !== "string") {
      return Response.json({ error: "reward_id is required" }, { status: 400, headers: corsHeaders });
    }

    // IMPORTANT: the authoritative eligibility/claim decision remains in PostgreSQL.
    // The browser cannot bypass this by changing its own JavaScript.
    const { data, error } = await supabase.rpc("claim_reward", {
      p_reward_id: rewardId,
    });

    if (error) throw error;

    if (!data?.success) {
      return Response.json(
        { success: false, message: data?.message ?? "Reward could not be claimed." },
        { status: 400, headers: corsHeaders },
      );
    }

    return Response.json(
      { success: true, claim: data.claim },
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error("claim-reward:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: corsHeaders },
    );
  }
});
