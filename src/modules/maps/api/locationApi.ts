export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  weight: number;
}

export async function recordUserLocation(latitude: number, longitude: number, accuracy?: number): Promise<void> {
  const { supabase } = await import('@/infrastructure/supabase/client');
  const { error } = await supabase.rpc('record_user_location', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy_m: accuracy ?? null,
  });
  if (error) throw error;
}

export async function getLocationHeatmap(campaignId?: string | null): Promise<HeatmapPoint[]> {
  const { supabase } = await import('@/infrastructure/supabase/client');
  const { data, error } = await supabase.rpc('get_location_heatmap', { p_campaign_id: campaignId ?? null });
  if (error) throw error;
  return (data ?? []).map((row: { latitude: number | string; longitude: number | string; weight: number | string }) => ({
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    weight: Number(row.weight),
  }));
}
