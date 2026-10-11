-- Regenerate the 500 isolated heatmap test points across India instead of concentrating them in Tamil Nadu.
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
    SELECT 1 FROM public.campaigns AS c WHERE c.id = p_campaign_id
  ) THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = '22023';
  END IF;

  -- 30 major cities across India's north, south, east, west and central regions.
  -- About 16-17 points are generated around each city, with small random offsets.
  WITH cities(city_index, latitude, longitude) AS (
    VALUES
      (0,  28.6139::numeric, 77.2090::numeric), -- Delhi
      (1,  19.0760::numeric, 72.8777::numeric), -- Mumbai
      (2,  22.5726::numeric, 88.3639::numeric), -- Kolkata
      (3,  12.9716::numeric, 77.5946::numeric), -- Bengaluru
      (4,  17.3850::numeric, 78.4867::numeric), -- Hyderabad
      (5,  13.0827::numeric, 80.2707::numeric), -- Chennai
      (6,  23.0225::numeric, 72.5714::numeric), -- Ahmedabad
      (7,  18.5204::numeric, 73.8567::numeric), -- Pune
      (8,  26.9124::numeric, 75.7873::numeric), -- Jaipur
      (9,  26.8467::numeric, 80.9462::numeric), -- Lucknow
      (10, 23.2599::numeric, 77.4126::numeric), -- Bhopal
      (11, 22.7196::numeric, 75.8577::numeric), -- Indore
      (12, 25.5941::numeric, 85.1376::numeric), -- Patna
      (13, 26.1445::numeric, 91.7362::numeric), -- Guwahati
      (14, 20.2961::numeric, 85.8245::numeric), -- Bhubaneswar
      (15, 23.3441::numeric, 85.3096::numeric), -- Ranchi
      (16, 21.2514::numeric, 81.6296::numeric), -- Raipur
      (17, 30.7333::numeric, 76.7794::numeric), -- Chandigarh
      (18, 30.3165::numeric, 78.0322::numeric), -- Dehradun
      (19, 34.0837::numeric, 74.7973::numeric), -- Srinagar
      (20, 32.7266::numeric, 74.8570::numeric), -- Jammu
      (21, 31.1048::numeric, 77.1734::numeric), -- Shimla
      (22,  9.9312::numeric, 76.2673::numeric), -- Kochi
      (23,  8.5241::numeric, 76.9366::numeric), -- Thiruvananthapuram
      (24, 16.5062::numeric, 80.6480::numeric), -- Vijayawada
      (25, 17.6868::numeric, 83.2185::numeric), -- Visakhapatnam
      (26, 21.1458::numeric, 79.0882::numeric), -- Nagpur
      (27, 21.1702::numeric, 72.8311::numeric), -- Surat
      (28, 25.3176::numeric, 82.9739::numeric), -- Varanasi
      (29, 27.1767::numeric, 78.0081::numeric)  -- Agra
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
    round((city.latitude + (g.r_lat - 0.5) * 0.16)::numeric, 6),
    round((city.longitude + (g.r_lng - 0.5) * 0.16)::numeric, 6),
    v_user_id,
    now()
  FROM generated AS g
  JOIN cities AS city
    ON city.city_index = ((g.point_number - 1) % 30)
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
