-- Rakesh: location attribution and campaign intelligence.
-- Additive migration; apply after the existing campaign/location migrations.
BEGIN;
CREATE TABLE IF NOT EXISTS public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  latitude numeric(10,7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(10,7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY venues_read_active ON public.venues FOR SELECT TO anon, authenticated USING (is_active);
GRANT SELECT ON public.venues TO anon, authenticated;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS locations_venue_idx ON public.locations(venue_id);

-- Managed by service-role tooling only; ordinary users cannot enroll themselves.
CREATE TABLE public.analytics_members (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, user_id)
);
ALTER TABLE public.analytics_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_members_read_own ON public.analytics_members FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
GRANT SELECT ON public.analytics_members TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.analytics_members FROM anon, authenticated;
GRANT ALL ON public.analytics_members TO service_role;

ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interaction_source_id uuid REFERENCES public.interaction_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_key text,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'client';
CREATE UNIQUE INDEX activity_events_event_key_idx ON public.activity_events(event_key) WHERE event_key IS NOT NULL;
CREATE INDEX activity_events_analytics_idx ON public.activity_events(campaign_id, created_at, event_type) WHERE origin IN ('domain', 'server');
CREATE INDEX activity_events_location_idx ON public.activity_events(location_id, created_at);

-- Prevent client writes from claiming trusted provenance, regardless of older RLS policies.
CREATE FUNCTION public.protect_event_provenance() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'UPDATE' AND OLD.origin <> 'client' THEN
      RAISE EXCEPTION 'Domain events are immutable';
    END IF;
    NEW.origin := 'client';
    NEW.event_key := NULL;
    NEW.created_at := now();
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER activity_events_provenance BEFORE INSERT OR UPDATE ON public.activity_events
FOR EACH ROW EXECUTE FUNCTION public.protect_event_provenance();

-- Integration contract for trusted backend workflows. Never callable by a browser.
CREATE FUNCTION public.record_campaign_event(
  p_campaign_id uuid, p_user_id uuid, p_event_type text, p_event_key text,
  p_location_id uuid DEFAULT NULL, p_source_id uuid DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now()
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_location uuid := p_location_id;
BEGIN
  IF p_event_type NOT IN ('QR_SCANNED','CAMPAIGN_JOINED','HUNT_STARTED','HUNT_COMPLETED','TASK_STARTED','TASK_COMPLETED','LOCATION_VISITED','REWARD_UNLOCKED','REWARD_CLAIMED','REWARD_REDEEMED','SHARE_COMPLETED') THEN
    RAISE EXCEPTION 'Unsupported campaign event';
  END IF;
  IF p_event_key IS NULL OR length(p_event_key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Event key required'; END IF;
  IF p_occurred_at IS NULL OR p_occurred_at > now() + interval '1 minute' THEN RAISE EXCEPTION 'Invalid event time'; END IF;
  IF p_source_id IS NOT NULL THEN
    SELECT s.location_id INTO v_location FROM public.interaction_sources s WHERE s.id=p_source_id AND s.campaign_id=p_campaign_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Source does not belong to campaign'; END IF;
    IF p_location_id IS NOT NULL AND p_location_id IS DISTINCT FROM v_location THEN RAISE EXCEPTION 'Location/source mismatch'; END IF;
  END IF;
  IF v_location IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.id=v_location AND l.campaign_id=p_campaign_id) THEN
    RAISE EXCEPTION 'Location does not belong to campaign';
  END IF;
  INSERT INTO public.activity_events(campaign_id,user_id,event_type,entity_type,location_id,interaction_source_id,event_key,origin,created_at)
  VALUES(p_campaign_id,p_user_id,p_event_type,'campaign',v_location,p_source_id,p_campaign_id::text || ':' || p_event_key,'server',p_occurred_at)
  ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.record_campaign_event(uuid,uuid,text,text,uuid,uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_campaign_event(uuid,uuid,text,text,uuid,uuid,timestamptz) TO service_role;

-- Capture existing domain records without changing other owners' business rules.
-- to_jsonb supports both repo and deployed timestamp/QR column names.
CREATE FUNCTION public.capture_campaign_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r jsonb := to_jsonb(NEW); v_campaign uuid; v_source uuid; v_location uuid; v_type text := TG_ARGV[0]; v_time timestamptz;
BEGIN
  IF TG_TABLE_NAME='mission_progress' AND NOT coalesce((r->>'completed')::boolean,false) THEN RETURN NEW; END IF;
  v_campaign := (r->>'campaign_id')::uuid;
  IF v_campaign IS NULL AND TG_TABLE_NAME='mission_progress' THEN
    SELECT m.campaign_id INTO v_campaign FROM public.missions m WHERE m.id=(r->>'mission_id')::uuid;
  END IF;
  IF v_campaign IS NULL THEN RETURN NEW; END IF;
  v_source := (r->>'interaction_source_id')::uuid;
  IF v_source IS NOT NULL THEN
    SELECT s.location_id INTO v_location FROM public.interaction_sources s WHERE s.id=v_source AND s.campaign_id=v_campaign;
    IF NOT FOUND THEN v_source := NULL; END IF;
  END IF;
  v_time := coalesce((r->>'completed_at')::timestamptz,(r->>'scanned_at')::timestamptz,(r->>'joined_at')::timestamptz,(r->>'created_at')::timestamptz,now());
  INSERT INTO public.activity_events(campaign_id,user_id,event_type,entity_type,entity_id,location_id,interaction_source_id,event_key,origin,created_at)
  VALUES(v_campaign,(r->>'user_id')::uuid,v_type,TG_TABLE_NAME,(r->>'id')::uuid,v_location,v_source,TG_TABLE_NAME || ':' || (r->>'id') || ':' || v_type,'domain',v_time)
  ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER intelligence_scan AFTER INSERT ON public.scans FOR EACH ROW EXECUTE FUNCTION public.capture_campaign_activity('QR_SCANNED');
CREATE TRIGGER intelligence_join AFTER INSERT ON public.campaign_users FOR EACH ROW EXECUTE FUNCTION public.capture_campaign_activity('CAMPAIGN_JOINED');
CREATE TRIGGER intelligence_task AFTER INSERT OR UPDATE ON public.mission_progress FOR EACH ROW EXECUTE FUNCTION public.capture_campaign_activity('TASK_COMPLETED');
CREATE TRIGGER intelligence_claim AFTER INSERT ON public.reward_claims FOR EACH ROW EXECUTE FUNCTION public.capture_campaign_activity('REWARD_CLAIMED');

CREATE FUNCTION public.get_campaign_analytics(p_campaign_id uuid, p_from timestamptz, p_to timestamptz, p_location_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.analytics_members WHERE campaign_id=p_campaign_id AND user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Campaign analytics access required' USING ERRCODE='42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to-p_from > interval '366 days' THEN RAISE EXCEPTION 'Choose a date range of up to 366 days'; END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.locations WHERE id=p_location_id AND campaign_id=p_campaign_id) THEN RAISE EXCEPTION 'Location does not belong to campaign'; END IF;
  WITH events AS (
    -- Trusted events from the intelligence pipeline.
    SELECT e.id, e.campaign_id, e.user_id, e.event_type, e.created_at, e.location_id
    FROM public.activity_events e
    WHERE e.campaign_id=p_campaign_id AND e.created_at >= p_from AND e.created_at < p_to
      AND e.origin IN ('domain','server')
      AND (p_location_id IS NULL OR e.location_id=p_location_id)
    UNION ALL
    -- Accepted scans are authoritative in this app's existing schema. Include
    -- them even when the event-capture trigger was not installed at scan time.
    -- Avoid counting a scan twice if its trusted event was already captured.
    SELECT s.id, s.campaign_id, s.user_id, 'QR_SCANNED'::text, s.scanned_at, s.location_id
    FROM public.scans s
    WHERE s.campaign_id=p_campaign_id AND s.status='accepted'
      AND s.scanned_at >= p_from AND s.scanned_at < p_to
      AND (p_location_id IS NULL OR s.location_id=p_location_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.activity_events e
        WHERE e.campaign_id=s.campaign_id
          AND e.origin IN ('domain','server')
          AND e.event_type='QR_SCANNED'
          AND (e.entity_id=s.id OR e.event_key=('scans:' || s.id::text || ':QR_SCANNED'))
      )
  ), users AS (
    SELECT user_id, count(DISTINCT (created_at AT TIME ZONE 'Asia/Kolkata')::date) AS active_days,
      bool_or(event_type='TASK_COMPLETED') AS engaged FROM events GROUP BY user_id
  ), metrics AS (
    SELECT count(*) AS interactions, count(DISTINCT user_id) AS unique_users,
      count(*) FILTER (WHERE event_type='QR_SCANNED') AS scans,
      count(*) FILTER (WHERE event_type='CAMPAIGN_JOINED') AS campaign_joins,
      count(*) FILTER (WHERE event_type='HUNT_STARTED') AS hunt_starts,
      count(*) FILTER (WHERE event_type='HUNT_COMPLETED') AS hunt_completions,
      count(*) FILTER (WHERE event_type='TASK_COMPLETED') AS task_completions,
      count(*) FILTER (WHERE event_type='REWARD_CLAIMED') AS reward_claims,
      count(*) FILTER (WHERE event_type='SHARE_COMPLETED') AS shares,
      (SELECT count(*) FROM users WHERE active_days > 1) AS repeat_users,
      coalesce(round(100.0 * (SELECT count(*) FROM users WHERE engaged) / nullif(count(DISTINCT user_id),0),1),0) AS engagement_rate
    FROM events
  ), location_metrics AS (
    SELECT l.id, l.venue_id, l.name, l.latitude, l.longitude,
      count(e.id) AS interactions, count(DISTINCT e.user_id) AS unique_users,
      count(e.id) FILTER (WHERE e.event_type='QR_SCANNED') AS scans,
      count(e.id) FILTER (WHERE e.event_type='TASK_COMPLETED') AS task_completions,
      count(e.id) FILTER (WHERE e.event_type='REWARD_CLAIMED') AS reward_claims,
      coalesce(round(100.0 * count(DISTINCT e.user_id) FILTER (WHERE e.event_type='TASK_COMPLETED') / nullif(count(DISTINCT e.user_id),0),1),0) AS engagement_rate
    FROM public.locations l LEFT JOIN events e ON e.location_id=l.id
    WHERE l.campaign_id=p_campaign_id AND (p_location_id IS NULL OR l.id=p_location_id)
    GROUP BY l.id
  ), daily AS (
    SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, count(*) AS interactions, count(DISTINCT user_id) AS unique_users FROM events GROUP BY 1
  ), funnel AS (
    SELECT event_type, count(*) AS events, count(DISTINCT user_id) AS users FROM events GROUP BY event_type
  )
  SELECT jsonb_build_object('summary',(SELECT to_jsonb(m) FROM metrics m),
    'locations',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.interactions DESC,l.name) FROM location_metrics l),'[]'::jsonb),
    'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day) FROM daily d),'[]'::jsonb),
    'funnel',coalesce((SELECT jsonb_agg(to_jsonb(f)) FROM funnel f),'[]'::jsonb),
    'unattributed_interactions',(SELECT count(*) FROM events WHERE location_id IS NULL),
    'tracking_started_at',(SELECT min(t.started_at) FROM (
      SELECT created_at AS started_at FROM public.activity_events WHERE campaign_id=p_campaign_id AND origin IN ('domain','server')
      UNION ALL SELECT scanned_at AS started_at FROM public.scans WHERE campaign_id=p_campaign_id AND status='accepted'
    ) t))
  INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.get_campaign_analytics(uuid,timestamptz,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_analytics(uuid,timestamptz,timestamptz,uuid) TO authenticated;

-- Stop moving every historical campaign position whenever a person moves.
CREATE OR REPLACE FUNCTION public.record_user_location(p_latitude numeric,p_longitude numeric,p_accuracy_m numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_latitude IS NULL OR p_longitude IS NULL OR NOT (p_latitude BETWEEN -90 AND 90) OR NOT (p_longitude BETWEEN -180 AND 180)
    OR (p_accuracy_m IS NOT NULL AND NOT (p_accuracy_m BETWEEN 0 AND 100000)) THEN RAISE EXCEPTION 'Invalid location'; END IF;
  INSERT INTO public.user_locations(user_id,latitude,longitude,accuracy_m,last_seen_at,updated_at)
  VALUES(auth.uid(),p_latitude,p_longitude,p_accuracy_m,now(),now())
  ON CONFLICT(user_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,last_seen_at=now(),updated_at=now();
END; $$;
-- Public map: venue activity only, never users' home/current GPS positions.
CREATE OR REPLACE FUNCTION public.get_location_heatmap(p_campaign_id uuid DEFAULT NULL)
RETURNS TABLE(latitude numeric,longitude numeric,weight bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT l.latitude,l.longitude,count(e.id)::bigint
  FROM public.locations l JOIN public.activity_events e ON e.location_id=l.id AND e.campaign_id=l.campaign_id
  WHERE p_campaign_id IS NOT NULL AND l.campaign_id=p_campaign_id AND l.is_active
    AND e.origin IN ('domain','server') AND e.created_at >= now()-interval '30 days'
  GROUP BY l.id,l.latitude,l.longitude;
$$;
REVOKE ALL ON FUNCTION public.get_location_heatmap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_location_heatmap(uuid) TO authenticated;
-- Service-only rollups; producer requests use the range-filtered authorized RPC.
CREATE VIEW public.campaign_analytics WITH (security_invoker=true) AS
SELECT campaign_id,count(*) AS interactions,count(DISTINCT user_id) AS unique_users,
 count(*) FILTER (WHERE event_type='QR_SCANNED') AS scans,
 count(*) FILTER (WHERE event_type='TASK_COMPLETED') AS task_completions,
 count(*) FILTER (WHERE event_type='REWARD_CLAIMED') AS reward_claims
FROM public.activity_events WHERE origin IN ('domain','server') GROUP BY campaign_id;
CREATE VIEW public.location_analytics WITH (security_invoker=true) AS
SELECT campaign_id,location_id,count(*) AS interactions,count(DISTINCT user_id) AS unique_users
FROM public.activity_events WHERE origin IN ('domain','server') AND location_id IS NOT NULL GROUP BY campaign_id,location_id;
CREATE VIEW public.venue_analytics WITH (security_invoker=true) AS
SELECT e.campaign_id,l.venue_id,count(*) AS interactions,count(DISTINCT e.user_id) AS unique_users
FROM public.activity_events e JOIN public.locations l ON l.id=e.location_id AND l.campaign_id=e.campaign_id
WHERE e.origin IN ('domain','server') AND l.venue_id IS NOT NULL GROUP BY e.campaign_id,l.venue_id;
REVOKE ALL ON public.campaign_analytics,public.location_analytics,public.venue_analytics FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.campaign_analytics,public.location_analytics,public.venue_analytics TO service_role;

-- Campaign position records represent a recent observation at interaction time.
-- Do not refresh timestamps on old GPS fixes or attach browser page views.
CREATE OR REPLACE FUNCTION public.sync_campaign_location_from_scan()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  INSERT INTO public.user_campaign_locations(campaign_id,user_id,latitude,longitude,accuracy_m,last_seen_at,updated_at)
  SELECT NEW.campaign_id,NEW.user_id,u.latitude,u.longitude,u.accuracy_m,u.last_seen_at,now()
  FROM public.user_locations u WHERE u.user_id=NEW.user_id AND u.last_seen_at >= now()-interval '5 minutes'
    AND u.accuracy_m BETWEEN 0 AND 200
  ON CONFLICT(campaign_id,user_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,last_seen_at=excluded.last_seen_at,updated_at=now();
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.sync_campaign_location_from_activity_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.campaign_id IS NOT NULL AND NEW.origin IN ('domain','server') THEN
    INSERT INTO public.user_campaign_locations(campaign_id,user_id,latitude,longitude,accuracy_m,last_seen_at,updated_at)
    SELECT NEW.campaign_id,NEW.user_id,u.latitude,u.longitude,u.accuracy_m,u.last_seen_at,now()
    FROM public.user_locations u WHERE u.user_id=NEW.user_id AND u.last_seen_at >= now()-interval '5 minutes'
      AND u.accuracy_m BETWEEN 0 AND 200
    ON CONFLICT(campaign_id,user_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,last_seen_at=excluded.last_seen_at,updated_at=now();
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.get_nearby_campaign_locations(p_latitude double precision,p_longitude double precision,p_radius_km double precision DEFAULT 5)
RETURNS TABLE(id uuid,campaign_id uuid,name text,distance_km double precision)
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF p_latitude IS NULL OR p_longitude IS NULL OR NOT (p_latitude BETWEEN -90 AND 90) OR NOT (p_longitude BETWEEN -180 AND 180)
    OR p_radius_km IS NULL OR NOT (p_radius_km > 0 AND p_radius_km <= 100) THEN RAISE EXCEPTION 'Invalid nearby search'; END IF;
  RETURN QUERY
    SELECT q.id,q.campaign_id,q.name,q.distance_km FROM (
      SELECT l.id,l.campaign_id,l.name,6371.0 * acos(least(1.0,greatest(-1.0,
        sin(radians(p_latitude))*sin(radians(l.latitude::double precision)) +
        cos(radians(p_latitude))*cos(radians(l.latitude::double precision))*cos(radians(l.longitude::double precision-p_longitude))))) AS distance_km
      FROM public.locations l JOIN public.campaigns c ON c.id=l.campaign_id WHERE l.is_active AND c.active
    ) q WHERE q.distance_km <= p_radius_km ORDER BY q.distance_km,q.id LIMIT 50;
END; $$;
REVOKE ALL ON FUNCTION public.get_nearby_campaign_locations(double precision,double precision,double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_campaign_locations(double precision,double precision,double precision) TO authenticated;

COMMIT;
