import { supabase } from "@/infrastructure/supabase/client";

/** Null means privacy-suppressed or unmeasured, NEVER zero. */
export type PrivateMetric = number | null;
export interface BlueprintCampaign {
  id: string; name: string; movie_id: string; movie_title: string;
}
export interface BlueprintVenue {
  id: string; name: string; city: string | null; type: string;
  lat: number | null; lng: number | null;
  scans: PrivateMetric; unique_users: PrivateMetric;
  task_completions: PrivateMetric; reward_claims: PrivateMetric; interactions: PrivateMetric;
  hunt_completions: PrivateMetric; conversion_rate: PrivateMetric;
}
export interface BlueprintReport {
  schema_version: 2;
  privacy_minimum: 10;
  summary: Record<string, PrivateMetric>;
  venues: BlueprintVenue[];
  daily: { day: string; interactions: PrivateMetric; unique_users: PrivateMetric }[];
  funnel: { event_type: string; events: PrivateMetric; users: PrivateMetric }[];
  exposure: null;
  hype: { score: number; snapshot_date: string } | null;
}
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  if (data?.error || data?.data == null) throw new Error(data?.error?.message ?? "Analytics response unavailable");
  return data.data as T;
}
// Deliberate opt-in by the UI owner after the new schema and functions deploy.
// Never silently fall back to the old analytics_members authorization scheme.
export function getBlueprintCampaigns() {
  return invoke<BlueprintCampaign[]>("producer-films", {});
}
export function getBlueprintReport(campaignId: string, from: string, to: string) {
  return invoke<BlueprintReport>("producer-overview", { campaign_id: campaignId, from, to });
}
