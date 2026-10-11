CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_scans_heatmap_geom_gist
  ON public.scans USING gist (extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326))
  WHERE status = 'accepted' AND latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_heatmap_geom_gist
  ON public.locations USING gist (extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326))
  WHERE is_active AND latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_heatmap_test_points_geom_gist
  ON public.heatmap_test_points USING gist (
    extensions.ST_SetSRID(extensions.ST_MakePoint(longitude::double precision, latitude::double precision), 4326)
  );