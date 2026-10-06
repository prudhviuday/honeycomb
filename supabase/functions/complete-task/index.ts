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
    const taskId = body?.task_id;

    if (!taskId || typeof taskId !== "string") {
      return Response.json({ error: "task_id is required" }, { status: 400, headers: corsHeaders });
    }

    /*
     * SERVER-SIDE ENTRY POINT.
     *
     * Do NOT put task eligibility/proof validation in React.
     * When the task schema is finalized, this function should call a
     * PostgreSQL function such as complete_task(task_id, user_id, proof)
     * that performs the complete atomic validation and write.
     *
     * We intentionally do not insert a task-completion row here yet because
     * the current schema does not expose a dedicated task-completion table/RPC.
     */
    return Response.json(
      {
        success: false,
        code: "NOT_IMPLEMENTED",
        message: "Task completion server logic is not configured yet.",
        user_id: user.id,
        task_id: taskId,
      },
      { status: 501, headers: corsHeaders },
    );
  } catch (error) {
    console.error("complete-task:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: corsHeaders },
    );
  }
});
