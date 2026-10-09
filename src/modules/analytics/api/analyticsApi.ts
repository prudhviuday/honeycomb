import { supabase } from '@/lib/supabase';
import type { ActivityEvent } from '@/modules/analytics/types';

/** Fetch recent activity for a campaign, optionally limited to one user. */
export async function getActivityEvents(
  campaignId: string,
  userId?: string,
): Promise<ActivityEvent[]> {
  let query = supabase
    .from('activity_events')
    .select('id, campaign_id, user_id, event_type, entity_type, entity_id, metadata, created_at, location_id, interaction_source_id, event_key, origin')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ActivityEvent[];
import { supabase } from "@/infrastructure/supabase/client";
import type { CampaignAnalytics } from "../types";
export {
  getActivityEvents,
  getLeaderboard,
  getMyLeaderboardPosition,
} from "@/application/api/legacyApi";
export { logActivity } from "@/modules/shared/api";

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
  if (!data?.summary || !Array.isArray(data.locations))
    throw new Error("Invalid analytics response");
  return data as CampaignAnalytics;
}
