-- Remove coordinate rounding from the live heatmap tile RPC.
-- The MapLibre heatmap layer performs kernel-density smoothing; snapping source
-- points into fixed coordinate buckets creates the visible square lattice.
-- Vector tiles already limit each request to the visible map area.
CREATE OR REPLACE FUNCTION public.get_location_heatmap_tile(
  p_z integer,
  p_x integer,
  p_y integer,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tile text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_z IS NULL OR p_x IS NULL OR p_y IS NULL
     OR p_z < 0 OR p_z > 18
     OR p_x < 0 OR p_y < 0
     OR p_x >= (1::bigint << p_z)
     OR p_y >= (1::bigint << p_z) THEN
    RAISE EXCEPTION 'Invalid tile coordinates' USING ERRCODE = '22023';
  END IF;

  IF p_campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.id = p_campaign_id
  ) THEN
    RAISE EXCEPTION 'Unknown campaign' USING ERRCODE = '22023';
  END IF;

  WITH tile AS MATERIALIZED (
    SELECT
      extensions.ST_TileEnvelope(p_z, p_x, p_y) AS bounds,
      extensions.ST_Transform(
        extensions.ST_TileEnvelope(p_z, p_x, p_y, margin => (64.0 / 4096.0)),
        4326
      ) AS query_bounds
  ),
  scan_points AS (
    SELECT s.latitude::double precision AS latitude,
           s.longitude::double precision AS longitude,
           count(*)::bigint AS weight
    FROM public.scans s
    CROSS JOIN tile t
    WHERE s.status = 'accepted'
      AND s.scanned_at >= pg_catalog.now() - interval '30 days'
      AND s.latitude BETWEEN -90 AND 90
      AND s.longitude BETWEEN -180 AND 180
      AND (p_campaign_id IS NULL OR s.campaign_id = p_campaign_id)
      AND extensions.ST_Intersects(
        extensions.ST_SetSRID(extensions.ST_MakePoint(s.longitude, s.latitude), 4326),
        t.query_bounds
      )
    GROUP BY s.latitude, s.longitude
  ),
  trusted_location_events AS (
    SELECT l.latitude::double precision AS latitude,
           l.longitude::double precision AS longitude,
           count(e.id)::bigint AS weight
    FROM public.locations l
    JOIN public.activity_events e
      ON e.location_id = l.id AND e.campaign_id = l.campaign_id
    CROSS JOIN tile t
    WHERE l.is_active
      AND e.origin IN ('domain', 'server')
      AND upper(e.event_type) NOT IN ('QR_SCANNED', 'SCAN')
      AND e.created_at >= pg_catalog.now() - interval '30 days'
      AND (p_campaign_id IS NULL OR e.campaign_id = p_campaign_id)
      AND l.latitude BETWEEN -90 AND 90
      AND l.longitude BETWEEN -180 AND 180
      AND extensions.ST_Intersects(
        extensions.ST_SetSRID(extensions.ST_MakePoint(l.longitude, l.latitude), 4326),
        t.query_bounds
      )
    GROUP BY l.latitude, l.longitude
  ),
  synthetic_test_points AS (
    SELECT tp.latitude::double precision AS latitude,
           tp.longitude::double precision AS longitude,
           count(*)::bigint AS weight
    FROM public.heatmap_test_points tp
    CROSS JOIN tile t
    WHERE tp.generated_at >= pg_catalog.now() - interval '30 days'
      AND (p_campaign_id IS NULL OR tp.campaign_id = p_campaign_id)
      AND (
        tp.created_by = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.analytics_members am
          WHERE am.campaign_id = tp.campaign_id
            AND am.user_id = (SELECT auth.uid())
        )
      )
      AND tp.latitude BETWEEN -90 AND 90
      AND tp.longitude BETWEEN -180 AND 180
      AND extensions.ST_Intersects(
        extensions.ST_SetSRID(
          extensions.ST_MakePoint(tp.longitude::double precision, tp.latitude::double precision),
          4326
        ),
        t.query_bounds
      )
    GROUP BY tp.latitude, tp.longitude
  ),
  all_points AS (
    SELECT latitude, longitude, weight FROM scan_points
    UNION ALL
    SELECT latitude, longitude, weight FROM trusted_location_events
    UNION ALL
    SELECT latitude, longitude, weight FROM synthetic_test_points
  ),
  aggregated AS (
    SELECT latitude, longitude, sum(weight)::bigint AS weight
    FROM all_points
    GROUP BY latitude, longitude
  ),
  mvt_rows AS (
    SELECT
      extensions.ST_AsMVTGeom(
        extensions.ST_Transform(
          extensions.ST_SetSRID(
            extensions.ST_MakePoint(a.longitude, a.latitude),
            4326
          ),
          3857
        ),
        t.bounds,
        4096,
        64,
        true
      ) AS geom,
      a.weight
    FROM aggregated a
    CROSS JOIN tile t
    WHERE extensions.ST_Intersects(
      extensions.ST_SetSRID(extensions.ST_MakePoint(a.longitude, a.latitude), 4326),
      t.query_bounds
    )
  )
  SELECT pg_catalog.encode(
    COALESCE(
      (SELECT extensions.ST_AsMVT(tile_rows, 'heatmap', 4096, 'geom') FROM mvt_rows tile_rows),
      pg_catalog.decode('', 'hex')
    ),
    'base64'
  )
  INTO v_tile;

  RETURN COALESCE(v_tile, '');
END;
$function$;

REVOKE ALL ON FUNCTION public.get_location_heatmap_tile(integer, integer, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_location_heatmap_tile(integer, integer, integer, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_location_heatmap_tile(integer, integer, integer, uuid) TO authenticated;
