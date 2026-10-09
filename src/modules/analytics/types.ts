export type { ActivityEvent } from "@/modules/shared/types";
export type AnalyticsMetric =
  | "scans"
  | "unique_users"
  | "task_completions"
  | "reward_claims"
  | "interactions"
  | "engagement_rate";
export interface AnalyticsSummary {
  interactions: number;
  unique_users: number;
  scans: number;
  campaign_joins: number;
  hunt_starts: number;
  hunt_completions: number;
  task_completions: number;
  reward_claims: number;
  shares: number;
  repeat_users: number;
  engagement_rate: number;
}
export interface LocationAnalytics {
  id: string;
  venue_id: string | null;
  name: string;
  latitude: number;
  longitude: number;
  interactions: number;
  unique_users: number;
  scans: number;
  task_completions: number;
  reward_claims: number;
  engagement_rate: number;
}
export interface CampaignAnalytics {
  summary: AnalyticsSummary;
  locations: LocationAnalytics[];
  daily: { day: string; interactions: number; unique_users: number }[];
  funnel: { event_type: string; events: number; users: number }[];
  unattributed_interactions: number;
  tracking_started_at: string | null;
}
