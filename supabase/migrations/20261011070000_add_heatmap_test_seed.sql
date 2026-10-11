-- Isolated synthetic points for map/heatmap testing.
-- These rows never enter scans, activity_events, reward calculations, or producer KPIs.
BEGIN;

CREATE TABLE IF NOT EXISTS public.heatmap_test_points (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  point_number integer NOT NULL CHECK (point_number BETWEEN 1 AND 500),
  latitude numeric(10,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(10,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, point_number)
);

ALTER TABLE public.heatmap_test_points ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.heatmap_test_points FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.heatmap_test_points TO service_role;
CREATE INDEX IF NOT EXISTS idx_heatmap_test_points_campaign_generated
  ON public.heatmap_test_points (campaign_id, generated_at DESC);

-- Exactly 500 points per campaign; subsequent clicks regenerate that campaign's
-- synthetic set rather than continually accumulating fake points.
CREATE OR REPLACE FUNCTION public.seed_heatmap_test_points(p_campaign_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (select auth.uid());
  v_rows integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'Select a campaign first' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.analytics_members AS am
    WHERE am.campaign_id = p_campaign_id
      AND am.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Heatmap test seeding requires analytics membership for this campaign'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns AS c WHERE c.id = p_campaign_id
  ) THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = '22023';
  END IF;

  WITH cities(city_index, latitude, longitude) AS (
    VALUES
      (0, 11.0168::numeric, 76.9558::numeric), -- Coimbatore
      (1,  9.9252::numeric, 78.1198::numeric), -- Madurai
      (2, 10.7905::numeric, 78.7047::numeric), -- Tiruchirappalli
      (3, 11.6643::numeric, 78.1460::numeric), -- Salem
      (4, 11.3410::numeric, 77.7172::numeric), -- Erode
      (5, 12.9165::numeric, 79.1325::numeric), -- Vellore
      (6, 10.7870::numeric, 79.1378::numeric), -- Thanjavur
      (7,  8.7139::numeric, 77.7567::numeric), -- Tirunelveli
      (8, 11.1085::numeric, 77.3411::numeric), -- Tiruppur
      (9, 11.4102::numeric, 76.6950::numeric)  -- Ooty
  ),
  generated AS (
    SELECT gs AS point_number,
           random() AS r_lat,
           random() AS r_lng
    FROM generate_series(1, 500) AS gs
  )
  INSERT INTO public.heatmap_test_points
    (campaign_id, point_number, latitude, longitude, created_by, generated_at)
  SELECT
    p_campaign_id,
    g.point_number,
    round((
      CASE WHEN g.point_number <= 350
        THEN 12.87 + g.r_lat * 0.34
        ELSE city.latitude + (g.r_lat - 0.5) * 0.12
      END
    )::numeric, 6),
    round((
      CASE WHEN g.point_number <= 350
        THEN 80.05 + g.r_lng * 0.42
        ELSE city.longitude + (g.r_lng - 0.5) * 0.14
      END
    )::numeric, 6),
    v_user_id,
    now()
  FROM generated AS g
  LEFT JOIN cities AS city
    ON city.city_index = ((g.point_number - 351) % 10)
   AND g.point_number > 350
  ON CONFLICT (campaign_id, point_number) DO UPDATE
    SET latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        created_by = EXCLUDED.created_by,
        generated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_heatmap_test_points(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_heatmap_test_points(uuid) TO authenticated;

-- Keep the established production aggregation, adding synthetic points only to
-- the map response of analytics members. Other users never see this test layer.
CREATE OR REPLACE FUNCTION public.get_location_heatmap(
  p_campaign_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(latitude numeric, longitude numeric, weight bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH scan_points AS (
    SELECT
      round(s.latitude::numeric, 3) AS latitude,
      round(s.longitude::numeric, 3) AS longitude,
      count(*)::bigint AS weight
    FROM public.scans AS s
    WHERE s.status = 'accepted'
      AND s.scanned_at >= now() - interval '30 days'
      AND s.latitude BETWEEN -90 AND 90
      AND s.longitude BETWEEN -180 AND 180
      AND (p_campaign_id IS NULL OR s.campaign_id = p_campaign_id)
    GROUP BY 1, 2
  ),
  trusted_location_events AS (
    SELECT
      round(l.latitude::numeric, 3) AS latitude,
      round(l.longitude::numeric, 3) AS longitude,
      count(e.id)::bigint AS weight
    FROM public.locations AS l
    JOIN public.activity_events AS e
      ON e.location_id = l.id
     AND e.campaign_id = l.campaign_id
    WHERE l.is_active
      AND e.origin IN ('domain', 'server')
      AND upper(e.event_type) NOT IN ('QR_SCANNED', 'SCAN')
      AND e.created_at >= now() - interval '30 days'
      AND (p_campaign_id IS NULL OR e.campaign_id = p_campaign_id)
    GROUP BY 1, 2
  ),
  synthetic_test_points AS (
    SELECT
      round(tp.latitude::numeric, 3) AS latitude,
      round(tp.longitude::numeric, 3) AS longitude,
      count(*)::bigint AS weight
    FROM public.heatmap_test_points AS tp
    WHERE tp.generated_at >= now() - interval '30 days'
      AND (p_campaign_id IS NULL OR tp.campaign_id = p_campaign_id)
      AND EXISTS (
        SELECT 1
        FROM public.analytics_members AS am
        WHERE am.campaign_id = tp.campaign_id
          AND am.user_id = (select auth.uid())
      )
    GROUP BY 1, 2
  ),
  all_points AS (
    SELECT latitude, longitude, weight FROM scan_points
    UNION ALL
    SELECT latitude, longitude, weight FROM trusted_location_events
    UNION ALL
    SELECT latitude, longitude, weight FROM synthetic_test_points
  )
  SELECT p.latitude, p.longitude, sum(p.weight)::bigint AS weight
  FROM all_points AS p
  GROUP BY p.latitude, p.longitude
  ORDER BY sum(p.weight) DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_location_heatmap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_location_heatmap(uuid) TO authenticated;

COMMIT;
