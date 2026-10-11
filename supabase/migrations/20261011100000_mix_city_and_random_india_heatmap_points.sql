-- Simulate a more realistic nationwide activity footprint:
-- 250 points around major cities and 250 random mainland/India-region locations.
-- Re-running replaces the same campaign's synthetic set; it never adds more rows.
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

  WITH cities(city_index, latitude, longitude) AS (
    VALUES
      (0, 28.6139::numeric, 77.2090::numeric), -- Delhi
      (1, 19.0760::numeric, 72.8777::numeric), -- Mumbai
      (2, 22.5726::numeric, 88.3639::numeric), -- Kolkata
      (3, 12.9716::numeric, 77.5946::numeric), -- Bengaluru
      (4, 17.3850::numeric, 78.4867::numeric), -- Hyderabad
      (5, 13.0827::numeric, 80.2707::numeric), -- Chennai
      (6, 23.0225::numeric, 72.5714::numeric), -- Ahmedabad
      (7, 18.5204::numeric, 73.8567::numeric), -- Pune
      (8, 26.9124::numeric, 75.7873::numeric), -- Jaipur
      (9, 26.8467::numeric, 80.9462::numeric), -- Lucknow
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
      (22, 9.9312::numeric, 76.2673::numeric), -- Kochi
      (23, 8.5241::numeric, 76.9366::numeric), -- Thiruvananthapuram
      (24, 16.5062::numeric, 80.6480::numeric), -- Vijayawada
      (25, 17.6868::numeric, 83.2185::numeric), -- Visakhapatnam
      (26, 21.1458::numeric, 79.0882::numeric), -- Nagpur
      (27, 21.1702::numeric, 72.8311::numeric), -- Surat
      (28, 25.3176::numeric, 82.9739::numeric), -- Varanasi
      (29, 27.1767::numeric, 78.0081::numeric) -- Agra
  ),
  city_generated AS (
    SELECT gs AS point_number,
           city.latitude + (random() - 0.5) * 0.14 AS latitude,
           city.longitude + (random() - 0.5) * 0.16 AS longitude
    FROM generate_series(1, 250) AS gs
    JOIN cities AS city
      ON city.city_index = ((gs - 1) % 30)
  ),
  -- Approximate mainland and north-eastern India outline, used only to keep
  -- random demo coordinates on land and away from most neighbouring countries.
  outline(seq, longitude, latitude) AS (
    VALUES
      (1,68.10::numeric,23.70::numeric),
      (2,69.20,22.50),(3,70.20,21.50),(4,72.00,20.00),
      (5,73.20,17.00),(6,74.10,14.00),(7,75.00,11.00),
      (8,77.00,8.00),(9,79.00,8.50),(10,81.00,11.50),
      (11,83.00,14.50),(12,85.00,18.00),(13,87.00,20.00),
      (14,89.20,21.50),(15,91.50,22.00),(16,92.50,24.00),
      (17,94.50,26.00),(18,96.20,28.50),(19,94.00,29.20),
      (20,92.20,27.50),(21,90.00,28.10),(22,88.00,27.80),
      (23,86.00,28.50),(24,83.00,29.50),(25,80.00,30.50),
      (26,78.00,32.00),(27,76.00,34.50),(28,74.00,35.50),
      (29,72.00,34.00),(30,70.00,31.00),(31,69.00,28.00),
      (32,68.00,26.00),(33,68.10,23.70)
  ),
  edges AS (
    SELECT longitude AS x1, latitude AS y1,
           lead(longitude) OVER (ORDER BY seq) AS x2,
           lead(latitude) OVER (ORDER BY seq) AS y2
    FROM outline
  ),
  candidates AS (
    SELECT gs AS candidate_number,
           68.0 + random() * 29.0 AS longitude,
           6.5 + random() * 31.0 AS latitude
    FROM generate_series(1, 12000) AS gs
  ),
  crossing_counts AS (
    SELECT c.candidate_number, c.longitude, c.latitude,
           count(*) FILTER (
             WHERE ((e.y1 > c.latitude) <> (e.y2 > c.latitude))
               AND c.longitude < e.x1
                 + (e.x2 - e.x1) * (c.latitude - e.y1)
                   / NULLIF(e.y2 - e.y1, 0)
           ) AS crossings
    FROM candidates AS c
    CROSS JOIN edges AS e
    WHERE e.x2 IS NOT NULL AND e.y2 IS NOT NULL
    GROUP BY c.candidate_number, c.longitude, c.latitude
  ),
  random_generated AS (
    SELECT (250 + row_number() OVER (ORDER BY candidate_number))::integer AS point_number,
           latitude,
           longitude
    FROM crossing_counts
    WHERE crossings % 2 = 1
    ORDER BY candidate_number
    LIMIT 250
  ),
  generated AS (
    SELECT point_number, latitude, longitude FROM city_generated
    UNION ALL
    SELECT point_number, latitude, longitude FROM random_generated
  )
  INSERT INTO public.heatmap_test_points
    (campaign_id, point_number, latitude, longitude, created_by, generated_at)
  SELECT p_campaign_id, point_number,
         round(latitude::numeric, 6), round(longitude::numeric, 6),
         v_user_id, now()
  FROM generated
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
