import { producerHandler } from "../_shared/producer.ts";
import { createUserClient } from "../_shared/supabase.ts";
Deno.serve(producerHandler("funnel", createUserClient));
