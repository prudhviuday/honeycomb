-- Persistent user location + campaign-specific heatmap data.
CREATE TABLE IF NOT EXISTS public.user_locations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  accuracy_m numeric(10,2),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_locations_latitude_check CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT user_locations_longitude_check CHECK (longitude BETWEEN -180 AND 180)
);
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_locations_select_own" ON public.user_locations;
CREATE POLICY "user_locations_select_own" ON public.user_locations FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "user_locations_insert_own" ON public.user_locations;
CREATE POLICY "user_locations_insert_own" ON public.user_locations FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "user_locations_update_own" ON public.user_locations;
CREATE POLICY "user_locations_update_own" ON public.user_locations FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.user_campaign_locations (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  accuracy_m numeric(10,2),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id),
  CONSTRAINT user_campaign_locations_latitude_check CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT user_campaign_locations_longitude_check CHECK (longitude BETWEEN -180 AND 180)
);
ALTER TABLE public.user_campaign_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_campaign_locations_select_own" ON public.user_campaign_locations;
CREATE POLICY "user_campaign_locations_select_own" ON public.user_campaign_locations FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "user_campaign_locations_insert_own" ON public.user_campaign_locations;
CREATE POLICY "user_campaign_locations_insert_own" ON public.user_campaign_locations FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "user_campaign_locations_update_own" ON public.user_campaign_locations;
CREATE POLICY "user_campaign_locations_update_own" ON public.user_campaign_locations FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_user_campaign_locations_campaign ON public.user_campaign_locations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_user_campaign_locations_user ON public.user_campaign_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_last_seen ON public.user_locations(last_seen_at);

CREATE OR REPLACE FUNCTION public.record_user_location(p_latitude numeric, p_longitude numeric, p_accuracy_m numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE v_user_id uuid := (select auth.uid());
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_latitude IS NULL OR p_longitude IS NULL OR p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180 THEN RAISE EXCEPTION 'Invalid coordinates'; END IF;
  INSERT INTO public.user_locations (user_id, latitude, longitude, accuracy_m, last_seen_at, updated_at)
  VALUES (v_user_id, p_latitude, p_longitude, p_accuracy_m, now(), now())
  ON CONFLICT (user_id) DO UPDATE SET latitude=excluded.latitude, longitude=excluded.longitude, accuracy_m=excluded.accuracy_m, last_seen_at=now(), updated_at=now();
  INSERT INTO public.user_campaign_locations (campaign_id, user_id, latitude, longitude, accuracy_m, last_seen_at, updated_at)
  SELECT DISTINCT s.campaign_id, v_user_id, p_latitude, p_longitude, p_accuracy_m, now(), now()
  FROM public.scans s WHERE s.user_id=v_user_id
  ON CONFLICT (campaign_id,user_id) DO UPDATE SET latitude=excluded.latitude, longitude=excluded.longitude, accuracy_m=excluded.accuracy_m, last_seen_at=now(), updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.record_user_location(numeric,numeric,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_user_location(numeric,numeric,numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_user_location(numeric,numeric,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_campaign_location_from_scan()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_campaign_locations (campaign_id,user_id,latitude,longitude,accuracy_m,last_seen_at,updated_at)
  SELECT NEW.campaign_id,NEW.user_id,ul.latitude,ul.longitude,ul.accuracy_m,now(),now()
  FROM public.user_locations ul WHERE ul.user_id=NEW.user_id
  ON CONFLICT (campaign_id,user_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,last_seen_at=now(),updated_at=now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS scans_sync_campaign_location ON public.scans;
CREATE TRIGGER scans_sync_campaign_location AFTER INSERT ON public.scans FOR EACH ROW EXECUTE FUNCTION public.sync_campaign_location_from_scan();

CREATE OR REPLACE FUNCTION public.get_location_heatmap(p_campaign_id uuid DEFAULT NULL)
RETURNS TABLE(latitude numeric, longitude numeric, weight bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT round(source.latitude,3), round(source.longitude,3), count(*)::bigint
  FROM (
    SELECT ul.latitude,ul.longitude FROM public.user_locations ul WHERE p_campaign_id IS NULL
    UNION ALL
    SELECT ucl.latitude,ucl.longitude FROM public.user_campaign_locations ucl WHERE p_campaign_id IS NOT NULL AND ucl.campaign_id=p_campaign_id
  ) source
  GROUP BY round(source.latitude,3),round(source.longitude,3)
  ORDER BY count(*) DESC;
$$;
REVOKE ALL ON FUNCTION public.get_location_heatmap(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_location_heatmap(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_location_heatmap(uuid) TO authenticated;
