-- Repair producer analytics against the current scan-backed campaign data.
-- This is intentionally limited to the analytics RPC; it does not alter data or permissions.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_campaign_analytics(p_campaign_id uuid, p_from timestamptz, p_to timestamptz, p_location_id uuid DEFAULT NULL)
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
COMMIT;
