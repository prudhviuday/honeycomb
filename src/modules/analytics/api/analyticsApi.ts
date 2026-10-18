import { supabase } from "@/infrastructure/supabase/client";
import type { CampaignAnalytics } from "../types";

/**
 * The single activity-writing entry point for every Honeycomb feature.
 * Feature modules describe the event; Analytics owns persistence and the
 * common event shape. Never insert into activity_events from feature code.
 */
export interface RegisterActivityInput {
  eventType: string;
  description?: string;
  campaignId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  sourceModule?: string;
  metadata?: Record<string, unknown>;
}

export interface RegisterActivityResult {
  recorded: boolean;
  reason?: "not_authenticated" | "write_failed" | "not_tracked";
}

/**
 * Stable compact event IDs mirrored by public.activity_event_types.
 * Only business-important events are included. Navigation noise is ignored.
 */
const EVENT_TYPE_IDS: Record<string, number> = {
  account_created: 1,
  user_signed_in: 2,
  profile_updated: 3,
  movie_campaign_opened: 4,
  campaign_joined: 5,
  qr_scan_succeeded: 6,
  qr_scan_rejected: 7,
  qr_scan_failed: 8,
  reward_claim_succeeded: 9,
  reward_claim_failed: 10,
  lucky_draw_entered: 11,
  mission_completed: 12,
  hunt_started: 13,
  hunt_completed: 14,
  mission_started: 15,
  task_started: 16,
  task_completed: 17,
  location_visited: 18,
  reward_unlocked: 19,
  reward_claimed: 20,
  reward_redeemed: 21,
  share_completed: 22,
  scan: 23,
  reward_claim: 24,
  mission_complete: 26,
  qr_scanned: 27,
  referral_signup_completed: 30,
  referral_reward_awarded: 31,
};

const EVENT_ALIASES: Record<string, string> = {
  qr_scan_success: "qr_scan_succeeded",
  qr_scan_error: "qr_scan_failed",
  qr_scan_failure: "qr_scan_failed",
  qr_scanned: "qr_scanned",
  task_completed: "task_completed",
  campaign_join: "campaign_joined",
  reward_claim_success: "reward_claim_succeeded",
  reward_claim_error: "reward_claim_failed",
};

export async function registerActivity(
  input: RegisterActivityInput,
): Promise<RegisterActivityResult> {
  const normalized = input.eventType
    .trim()
    .toLowerCase()
    .replace(/[\\s-]+/g, "_");
  const eventCode = EVENT_ALIASES[normalized] ?? normalized;
  const eventTypeId = EVENT_TYPE_IDS[eventCode];

  // Deliberately ignore low-value UI events and unknown event names.
  if (!eventTypeId) {
    return { recorded: false, reason: "not_tracked" };
  }

  try {
    // Use the authenticated session identity, never a user ID supplied by a feature.
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData.session?.user.id;
    if (!userId) return { recorded: false, reason: "not_authenticated" };

    const metadata = {
      ...(input.metadata ?? {}),
      ...(input.description ? { description: input.description } : {}),
      source_module: input.sourceModule?.trim() || "honeycomb",
    };

    const { error } = await supabase.from("activity_events").insert({
      campaign_id: input.campaignId ?? null,
      user_id: userId,
      event_type_id: eventTypeId,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata,
      origin: "client",
    });

    if (error) throw error;
    return { recorded: true };
  } catch (error) {
    // Activity collection must not break the user action being recorded.
    console.warn("[Analytics] Activity recording failed:", error);
    return { recorded: false, reason: "write_failed" };
  }
}

/** Backwards-compatible API for older modules; new code should use registerActivity. */
export async function logActivity(
  campaignId: string,
  _userId: string,
  eventType: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await registerActivity({ campaignId, eventType, metadata });
}

export {
  getActivityEvents,
  getLeaderboard,
  getMyLeaderboardPosition,
} from "@/application/api/legacyApi";

export async function getAnalyticsCampaignIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from("analytics_members")
    .select("campaign_id");
  if (error) throw error;
  return (data ?? []).map((row) => row.campaign_id);
}

export async function getCampaignAnalytics(
  campaignId: string,
  from: string,
  to: string,
  locationId?: string,
): Promise<CampaignAnalytics> {
  const { data, error } = await supabase.rpc("get_campaign_analytics", {
    p_campaign_id: campaignId,
    p_from: from,
    p_to: to,
    p_location_id: locationId || null,
  });
  if (error) throw error;
  if (!data?.summary || !Array.isArray(data.locations)) {
    throw new Error("Invalid analytics response");
  }
  return data as CampaignAnalytics;
}
