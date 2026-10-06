REVOKE EXECUTE ON FUNCTION public.get_location_heatmap(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_location_heatmap(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_location_heatmap(uuid) TO authenticated;
CREATE INDEX IF NOT EXISTS idx_user_campaign_locations_user ON public.user_campaign_locations(user_id);
