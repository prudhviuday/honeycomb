export {
  recordUserLocation,
  getLocationHeatmap,
} from '@/modules/shared/api';

export type { HeatmapPoint } from '@/modules/shared/api';

import { supabase } from "@/infrastructure/supabase/client";

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
