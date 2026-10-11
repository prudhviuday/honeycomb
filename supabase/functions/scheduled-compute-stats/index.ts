import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { statsJobHandler } from "../_shared/statsJob.ts";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const client = createClient(Deno.env.get("SUPABASE_URL")!, key!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(statsJobHandler(key, client));
