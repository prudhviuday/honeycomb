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
  SELECT DISTINCT campaign_id, v_user_id, p_latitude, p_longitude, p_accuracy_m, now(), now()
  FROM (
    SELECT s.campaign_id FROM public.scans s WHERE s.user_id=v_user_id
    UNION
    SELECT e.campaign_id FROM public.activity_events e WHERE e.user_id=v_user_id AND e.campaign_id IS NOT NULL
  ) interacted
  ON CONFLICT (campaign_id,user_id) DO UPDATE SET latitude=excluded.latitude, longitude=excluded.longitude, accuracy_m=excluded.accuracy_m, last_seen_at=now(), updated_at=now();
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_campaign_location_from_activity_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.campaign_id IS NOT NULL THEN
    INSERT INTO public.user_campaign_locations (campaign_id,user_id,latitude,longitude,accuracy_m,last_seen_at,updated_at)
    SELECT NEW.campaign_id,NEW.user_id,ul.latitude,ul.longitude,ul.accuracy_m,now(),now()
    FROM public.user_locations ul WHERE ul.user_id=NEW.user_id
    ON CONFLICT (campaign_id,user_id) DO UPDATE SET latitude=excluded.latitude, longitude=excluded.longitude, accuracy_m=excluded.accuracy_m, last_seen_at=now(), updated_at=now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activity_events_sync_campaign_location ON public.activity_events;
CREATE TRIGGER activity_events_sync_campaign_location
AFTER INSERT ON public.activity_events
FOR EACH ROW EXECUTE FUNCTION public.sync_campaign_location_from_activity_event();
