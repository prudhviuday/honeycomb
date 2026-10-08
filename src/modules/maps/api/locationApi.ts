import { supabase } from "@/infrastructure/supabase/client";
export { recordUserLocation, getLocationHeatmap } from "@/modules/shared/api";
export type { HeatmapPoint } from "@/modules/shared/api";
export interface NearbyLocation {
  id: string;
  campaign_id: string;
  name: string;
  distance_km: number;
}
export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
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
export async function getVenues(): Promise<Venue[]> {
  const { data, error } = await supabase
    .from("venues")
    .select("id,name,address,city,latitude,longitude,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}
