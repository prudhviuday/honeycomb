-- Restore the public map heatmap from accepted, geolocated scan activity.
-- Aggregate coordinates to three decimal places (~100 m) rather than exposing
-- exact scan coordinates. Trusted non-scan location events remain included.
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
  all_points AS (
    SELECT latitude, longitude, weight FROM scan_points
    UNION ALL
    SELECT latitude, longitude, weight FROM trusted_location_events
  )
  SELECT p.latitude, p.longitude, sum(p.weight)::bigint AS weight
  FROM all_points AS p
  GROUP BY p.latitude, p.longitude
  ORDER BY sum(p.weight) DESC;
$function$;

-- Keep the existing intended access model: heatmap is available to signed-in
-- users only; anonymous clients cannot call the SECURITY DEFINER function.
REVOKE ALL ON FUNCTION public.get_location_heatmap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_location_heatmap(uuid) TO authenticated;
