import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
export type ConfigurableTask = {
  id: string; campaign_id: string; name: string; is_active: boolean;
  starts_at: string | null; ends_at: string | null; progress_event_type_id: number | null;
  verification_action: string; verification_config: Record<string, unknown> | null;
};
export type VerifiedTaskEvidence = { entityType: string; entityId: string; idempotencyKey: string; metadata?: Record<string, unknown> };
export type TaskVerificationContext = { admin: SupabaseClient; userId: string; task: ConfigurableTask };
export type TaskVerificationResult = { verified: boolean; status?: number; message: string; evidence?: VerifiedTaskEvidence };
export type TaskVerifier = (context: TaskVerificationContext) => Promise<TaskVerificationResult>;
export type TaskVerifierDefinition = {
  key: string; label: string; description: string; uiComponents: string[];
  requiredEventTypeCode?: string; verify: TaskVerifier;
};
