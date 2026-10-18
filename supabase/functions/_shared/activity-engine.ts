import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

export type TrustedActivity = {
  campaignId: string;
  userId: string;
  eventTypeId: number;
  eventKey: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export type ActivityEngineResult = {
  success: boolean;
  duplicate?: boolean;
  activityNumber?: number | null;
  tasksCompleted?: Array<{ missionId: string; missionName: string; rewardPoints: number }>;
  [key: string]: unknown;
};

/**
 * Call only after a feature-specific verifier checks evidence from trusted
 * server-side records. Never map a client-supplied event type directly here.
 * The database RPC must remain unavailable to anon/authenticated roles.
 */
export async function recordTrustedActivity(
  admin: SupabaseClient,
  activity: TrustedActivity,
): Promise<ActivityEngineResult> {
  const { data, error } = await admin.rpc("record_trusted_activity_and_progress", {
    p_campaign_id: activity.campaignId,
    p_user_id: activity.userId,
    p_event_type_id: activity.eventTypeId,
    p_event_key: activity.eventKey,
    p_entity_type: activity.entityType ?? null,
    p_entity_id: activity.entityId ?? null,
    p_metadata: activity.metadata ?? {},
  });
  if (error) {
    console.error("Trusted activity RPC failed", { code: error.code, message: error.message });
    throw new Error("Activity could not be recorded. Confirm the activity-engine migration is applied.");
  }
  return data as ActivityEngineResult;
}
