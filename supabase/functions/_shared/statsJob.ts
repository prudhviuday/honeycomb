interface JobClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: unknown }>;
}
// Scheduler invokes this with a service-role token held in server secrets only.
export function statsJobHandler(key: string | undefined, client: JobClient, now = () => new Date()) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return Response.json({ error: { code: "METHOD_NOT_ALLOWED" } }, { status: 405 });
    const supplied = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!key || !supplied) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
    const [a,b] = await Promise.all([digest(key),digest(supplied)]);
    let difference = 0;
    for (let i=0;i<a.length;i++) difference |= a[i]^b[i];
    if (difference) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    let body;
    try { body=await req.json(); } catch { return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 }); }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body?.campaign_id)) {
      return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    }
    const dayMs=86400000;
    const today=Math.floor((now().getTime()+19800000)/dayMs)*dayMs;
    const through=new Date(today-dayMs).toISOString().slice(0,10);
    const from=new Date(today-14*dayMs).toISOString().slice(0,10);
    try {
      const stats=await client.rpc("blueprint_compute_stats", {p_campaign:body.campaign_id,p_from:from,p_through:through});
      if (stats.error) throw new Error("Stats failed");
      // Recalculate late-arrival windows too; all writes are idempotent.
      for (let day=today-14*dayMs;day<today;day+=dayMs) {
        const hype=await client.rpc("blueprint_compute_hype", {p_campaign:body.campaign_id,p_day:new Date(day).toISOString().slice(0,10)});
        if (hype.error) throw new Error("Hype failed");
      }
      return Response.json({data:{campaign_id:body.campaign_id,from,through}});
    } catch {
      return Response.json({error:{code:"JOB_FAILED",message:"Statistics job failed; safe to retry"}},{status:503});
    }
  };
}
