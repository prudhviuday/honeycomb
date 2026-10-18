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
  reason?: "not_authenticated" | "write_failed";
}

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;

export async function registerActivity(
  input: RegisterActivityInput,
): Promise<RegisterActivityResult> {
  const eventType = input.eventType
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!EVENT_TYPE_PATTERN.test(eventType)) {
    console.warn("[Analytics] Ignoring invalid activity event type.");
    return { recorded: false, reason: "write_failed" };
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
      event_type: eventType,
      entity_type: input.entityType ?? "",
      entity_id: input.entityId ?? null,
      metadata,
    });

    if (error) throw error;
    return { recorded: true };
  } catch (error) {
    // Activity collection must not break the user action being recorded.
    console.warn("[Analytics] Activity recording failed:", error);
    return { recorded: false, reason: "write_failed" };
  }
}

/**
 * Record public QR funnel events (including visitors who have not signed up).
 * The database RPC owns anonymous visitor attribution and landing-event storage.
 */
export async function registerQrLandingActivity(
  code: string,
  eventType: "page_view" | "signup_started" | "signup_completed" | "campaign_joined",
  visitorId: string,
): Promise<void> {
  const normalizedCode = code.trim();
  if (!normalizedCode || !visitorId.trim()) return;
  try {
    const { error } = await supabase.rpc("record_qr_landing_event", {
      p_code: normalizedCode,
      p_event_type: eventType,
      p_visitor_id: visitorId,
    });
    if (error) throw error;
  } catch (error) {
    console.warn("[Analytics] Public QR funnel event recording failed:", error);
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
