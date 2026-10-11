export {
  recordUserLocation,
  getLocationHeatmap,
} from '@/modules/shared/api';

export type { HeatmapPoint } from '@/modules/shared/api';

import { supabase } from "@/infrastructure/supabase/client";

export async function canSeedHeatmapTestPoints(campaignId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("analytics_members")
    .select("campaign_id")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function seedHeatmapTestPoints(campaignId: string): Promise<number> {
  const { data, error } = await supabase.rpc("seed_heatmap_test_points", {
    p_campaign_id: campaignId,
  });

  if (error) throw error;
  return Number(data ?? 0);
}

export interface NearbyLocation {
  id: string;
  campaign_id: string;
  name: string;
  distance_km: number;
}

export async function getNearbyCampaignLocations(
  latitude: number,
  longitude: number,
): Promise<NearbyLocation[]> {
  const { data, error } = await supabase.rpc("get_nearby_campaign_locations", {
    p_latitude: latitude,
    p_longitude: longitude,
    p_radius_km: 5,
  });
  if (error) throw error;
  return data ?? [];
}
