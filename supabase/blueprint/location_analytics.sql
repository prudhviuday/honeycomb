-- Staged upgrade: see README.md. Requires the NEW core/QR schema, not legacy.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='role')
    OR to_regclass('public.campaign_members') IS NULL
    OR to_regclass('public.enrollments') IS NULL
    OR to_regclass('public.hunt_progress') IS NULL THEN
    RAISE EXCEPTION 'Blueprint core schema must be installed before analytics';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  address text, city text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'other' CHECK (type IN ('mall','college','cafe','theatre','other')),
  ADD COLUMN IF NOT EXISTS lat numeric CHECK (lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS lng numeric CHECK (lng BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
-- No new SELECT grant on venues: legacy rows may contain private contacts.
CREATE TABLE public.campaign_venues (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
  venue_id uuid NOT NULL REFERENCES public.venues(id),
  installed_on date, notes text, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id,venue_id)
);
ALTER TABLE public.campaign_venues ENABLE ROW LEVEL SECURITY;

CREATE TYPE public.analytics_event_type AS ENUM (
  'QR_SCANNED','USER_REGISTERED','HUNT_STARTED','TASK_STARTED','TASK_COMPLETED',
  'LOCATION_VISITED','REWARD_UNLOCKED','REWARD_CLAIMED','REWARD_REDEEMED',
  'SHARE_COMPLETED','REFERRAL_JOINED','BADGE_EARNED'
);
CREATE TABLE public.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type public.analytics_event_type NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
  venue_id uuid REFERENCES public.venues(id),
  qr_id uuid REFERENCES public.qr_codes(id),
  task_id uuid REFERENCES public.tasks(id),
  reward_id uuid REFERENCES public.rewards(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  event_key text NOT NULL CHECK (length(event_key) BETWEEN 1 AND 200),
  UNIQUE (campaign_id,event_key),
  FOREIGN KEY (campaign_id,venue_id) REFERENCES public.campaign_venues(campaign_id,venue_id)
);
CREATE INDEX events_reporting ON public.events(campaign_id,created_at,event_type);
CREATE INDEX events_venue_reporting ON public.events(campaign_id,venue_id,created_at);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- NULL venue means campaign total. A nullable column cannot form a primary key.
-- Separate partial unique indexes enforce one campaign/venue/day in both cases.
CREATE TABLE public.campaign_daily_stats (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
  venue_id uuid REFERENCES public.venues(id), stat_date date NOT NULL,
  scans bigint NOT NULL, unique_users bigint NOT NULL, new_users bigint NOT NULL,
  hunt_starts bigint NOT NULL, hunt_completions bigint NOT NULL,
  reward_claims bigint NOT NULL, shares bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX stats_campaign_day ON public.campaign_daily_stats(campaign_id,stat_date) WHERE venue_id IS NULL;
CREATE UNIQUE INDEX stats_venue_day ON public.campaign_daily_stats(campaign_id,venue_id,stat_date) WHERE venue_id IS NOT NULL;
ALTER TABLE public.campaign_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.hype_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id), snapshot_date date NOT NULL,
  score int NOT NULL CHECK (score BETWEEN 0 AND 100), components jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_id,snapshot_date)
);
ALTER TABLE public.hype_snapshots ENABLE ROW LEVEL SECURITY;
-- Targets must be set deliberately; no invented campaign goals or scores.
CREATE TABLE public.hype_config (
  campaign_id uuid PRIMARY KEY REFERENCES public.campaigns(id),
  targets jsonb NOT NULL, weights jsonb NOT NULL DEFAULT '{"S":0.25,"G":0.15,"C":0.20,"R":0.15,"H":0.15,"W":0.10}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hype_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.events,public.campaign_daily_stats,public.hype_snapshots,public.hype_config,public.campaign_venues FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.events,public.campaign_daily_stats,public.hype_snapshots,public.hype_config,public.campaign_venues TO service_role;
GRANT INSERT,UPDATE,DELETE ON public.hype_config,public.campaign_venues TO service_role;

CREATE FUNCTION public.blueprint_can_report(p_campaign uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (
    p.role::text='admin' OR (p.role::text='producer' AND EXISTS (
      SELECT 1 FROM public.campaign_members m WHERE m.campaign_id=p_campaign
        AND m.profile_id=p.id AND m.member_role::text IN ('producer','viewer')
    ))
  ));
$$;
REVOKE ALL ON FUNCTION public.blueprint_can_report(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.blueprint_log_event(
  p_campaign_id uuid,p_profile_id uuid,p_event_type public.analytics_event_type,p_event_key text,
  p_venue_id uuid DEFAULT NULL,p_qr_id uuid DEFAULT NULL,p_task_id uuid DEFAULT NULL,
  p_reward_id uuid DEFAULT NULL,p_metadata jsonb DEFAULT '{}'::jsonb,
  p_created_at timestamptz DEFAULT now()
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id bigint; v_venue uuid:=p_venue_id; v_existing public.events;
BEGIN
  IF p_created_at IS NULL OR p_created_at > now()+interval '1 minute' THEN RAISE EXCEPTION 'Invalid event timestamp'; END IF;
  IF p_event_key IS NULL OR length(p_event_key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Event key required'; END IF;
  IF p_qr_id IS NOT NULL THEN
    SELECT venue_id INTO v_venue FROM public.qr_codes WHERE id=p_qr_id AND campaign_id=p_campaign_id;
    IF NOT FOUND OR (p_venue_id IS NOT NULL AND p_venue_id IS DISTINCT FROM v_venue) THEN RAISE EXCEPTION 'QR/campaign/venue mismatch'; END IF;
  END IF;
  IF p_task_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tasks t JOIN public.hunts h ON h.id=t.hunt_id WHERE t.id=p_task_id AND h.campaign_id=p_campaign_id
  ) THEN RAISE EXCEPTION 'Task/campaign mismatch'; END IF;
  IF p_reward_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.rewards WHERE id=p_reward_id AND campaign_id=p_campaign_id) THEN RAISE EXCEPTION 'Reward/campaign mismatch'; END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata)<>'object'
    OR p_metadata - ARRAY['is_valid','source'] <> '{}'::jsonb THEN RAISE EXCEPTION 'Unsupported metadata; do not log personal data'; END IF;
  IF p_event_type='QR_SCANNED' AND (p_qr_id IS NULL OR jsonb_typeof(p_metadata->'is_valid') IS DISTINCT FROM 'boolean'
    OR coalesce(p_metadata->>'source','') NOT IN ('scan','direct_link')) THEN RAISE EXCEPTION 'Scan validity and source required'; END IF;
  INSERT INTO public.events(event_type,profile_id,campaign_id,venue_id,qr_id,task_id,reward_id,metadata,created_at,event_key)
  VALUES(p_event_type,p_profile_id,p_campaign_id,v_venue,p_qr_id,p_task_id,p_reward_id,p_metadata,p_created_at,p_event_key)
  ON CONFLICT(campaign_id,event_key) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT * INTO v_existing FROM public.events WHERE campaign_id=p_campaign_id AND event_key=p_event_key;
    IF v_existing.event_type IS DISTINCT FROM p_event_type OR v_existing.profile_id IS DISTINCT FROM p_profile_id
      OR v_existing.venue_id IS DISTINCT FROM v_venue OR v_existing.qr_id IS DISTINCT FROM p_qr_id
      OR v_existing.task_id IS DISTINCT FROM p_task_id OR v_existing.reward_id IS DISTINCT FROM p_reward_id
      OR v_existing.metadata IS DISTINCT FROM p_metadata THEN RAISE EXCEPTION 'Event key reused for a different operation'; END IF;
    v_id:=v_existing.id;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.blueprint_log_event(uuid,uuid,public.analytics_event_type,text,uuid,uuid,uuid,uuid,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.blueprint_log_event(uuid,uuid,public.analytics_event_type,text,uuid,uuid,uuid,uuid,jsonb,timestamptz) TO service_role;

-- A value is hidden if it describes 1..9 identified people (including denominators).
CREATE FUNCTION public.blueprint_private_count(p_count bigint,p_people bigint) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE WHEN p_count=0 THEN 0 WHEN p_people>=10 THEN p_count ELSE NULL END $$;
REVOKE ALL ON FUNCTION public.blueprint_private_count(bigint,bigint) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.blueprint_campaigns() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'movie_id',c.movie_id,'movie_title',m.title) ORDER BY c.name),'[]'::jsonb)
 FROM public.campaigns c JOIN public.movies m ON m.id=c.movie_id WHERE public.blueprint_can_report(c.id);
$$;
REVOKE ALL ON FUNCTION public.blueprint_campaigns() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.blueprint_campaigns() TO authenticated;

-- Read models never return profile IDs, scan coordinates, contact details or metadata.
-- All distinct counts are computed over the requested interval, never summed daily.
CREATE FUNCTION public.blueprint_report(p_campaign_id uuid,p_from timestamptz,p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.blueprint_can_report(p_campaign_id) THEN RAISE EXCEPTION 'Campaign analytics access required' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_to-p_from>interval '366 days' THEN RAISE EXCEPTION 'Invalid reporting range' USING ERRCODE='22023'; END IF;
 WITH e AS (
   SELECT * FROM public.events WHERE campaign_id=p_campaign_id AND created_at>=p_from AND created_at<p_to
     AND (event_type<>'QR_SCANNED' OR (metadata->>'is_valid'='true' AND metadata->>'source'='scan'))
 ), people AS (
   SELECT profile_id,count(DISTINCT (created_at AT TIME ZONE 'Asia/Kolkata')::date) days,
     bool_or(event_type='QR_SCANNED') scanned,bool_or(event_type='TASK_COMPLETED') completed
   FROM e WHERE profile_id IS NOT NULL GROUP BY profile_id
 ), completed AS (
   SELECT hp.profile_id FROM public.hunt_progress hp JOIN public.hunts h ON h.id=hp.hunt_id
   WHERE h.campaign_id=p_campaign_id AND hp.status::text='completed' AND hp.completed_at>=p_from AND hp.completed_at<p_to
 ), metrics AS (
   SELECT jsonb_build_object(
     'interactions',public.blueprint_private_count(count(*),count(DISTINCT profile_id)),
     'unique_users',public.blueprint_private_count(count(DISTINCT profile_id),count(DISTINCT profile_id)),
     'scans',public.blueprint_private_count(count(*) FILTER(WHERE event_type='QR_SCANNED'),count(DISTINCT profile_id) FILTER(WHERE event_type='QR_SCANNED')),
     'hunt_starts',public.blueprint_private_count(count(*) FILTER(WHERE event_type='HUNT_STARTED'),count(DISTINCT profile_id) FILTER(WHERE event_type='HUNT_STARTED')),
     'task_completions',public.blueprint_private_count(count(*) FILTER(WHERE event_type='TASK_COMPLETED'),count(DISTINCT profile_id) FILTER(WHERE event_type='TASK_COMPLETED')),
     'reward_claims',public.blueprint_private_count(count(*) FILTER(WHERE event_type='REWARD_CLAIMED'),count(DISTINCT profile_id) FILTER(WHERE event_type='REWARD_CLAIMED')),
     'shares',public.blueprint_private_count(count(*) FILTER(WHERE event_type='SHARE_COMPLETED'),count(DISTINCT profile_id) FILTER(WHERE event_type='SHARE_COMPLETED'))
   ) value FROM e
 ), stages AS (
   SELECT event_type,public.blueprint_private_count(count(*),count(DISTINCT profile_id)) events,
     public.blueprint_private_count(count(DISTINCT profile_id),count(DISTINCT profile_id)) users FROM e GROUP BY event_type
 ), venue_metrics AS (
   SELECT v.id,v.name,v.city,v.type,v.lat,v.lng,
     public.blueprint_private_count(count(e.id),count(DISTINCT e.profile_id)) interactions,
     public.blueprint_private_count(count(DISTINCT e.profile_id),count(DISTINCT e.profile_id)) unique_users,
     public.blueprint_private_count(count(e.id) FILTER(WHERE e.event_type='QR_SCANNED'),count(DISTINCT e.profile_id) FILTER(WHERE e.event_type='QR_SCANNED')) scans,
     public.blueprint_private_count(count(e.id) FILTER(WHERE e.event_type='TASK_COMPLETED'),count(DISTINCT e.profile_id) FILTER(WHERE e.event_type='TASK_COMPLETED')) task_completions,
     public.blueprint_private_count(count(e.id) FILTER(WHERE e.event_type='REWARD_CLAIMED'),count(DISTINCT e.profile_id) FILTER(WHERE e.event_type='REWARD_CLAIMED')) reward_claims
   FROM public.campaign_venues cv JOIN public.venues v ON v.id=cv.venue_id LEFT JOIN e ON e.venue_id=v.id
   WHERE cv.campaign_id=p_campaign_id GROUP BY v.id
 ), venue_completions AS (
   SELECT n.first_venue_id venue_id,public.blueprint_private_count(count(*),count(DISTINCT hp.profile_id)) hunt_completions
   FROM public.hunt_progress hp JOIN public.hunts h ON h.id=hp.hunt_id
   JOIN public.enrollments n ON n.profile_id=hp.profile_id AND n.campaign_id=h.campaign_id
   WHERE h.campaign_id=p_campaign_id AND hp.status::text='completed' AND hp.completed_at>=p_from AND hp.completed_at<p_to
   GROUP BY n.first_venue_id
 ), venue_report AS (
   SELECT v.*,CASE WHEN c.venue_id IS NULL THEN 0 ELSE c.hunt_completions END hunt_completions,
     CASE WHEN v.scans>0 THEN round(100.0*(CASE WHEN c.venue_id IS NULL THEN 0 ELSE c.hunt_completions END)/v.scans,1) ELSE NULL END conversion_rate
   FROM venue_metrics v LEFT JOIN venue_completions c ON c.venue_id=v.id
 ), daily AS (
   SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
     public.blueprint_private_count(count(*),count(DISTINCT profile_id)) interactions,
     public.blueprint_private_count(count(DISTINCT profile_id),count(DISTINCT profile_id)) unique_users FROM e GROUP BY 1
 ), totals AS (
   SELECT public.blueprint_private_count(count(*),count(DISTINCT profile_id)) total_users
   FROM public.enrollments WHERE campaign_id=p_campaign_id AND joined_at<p_to
 ), engagement AS (
   SELECT CASE WHEN count(*) FILTER(WHERE scanned)>=10 AND count(*) FILTER(WHERE scanned AND completed)>=10
     THEN round(100.0*count(*) FILTER(WHERE scanned AND completed)/count(*) FILTER(WHERE scanned),1)
     WHEN count(*) FILTER(WHERE scanned AND completed)=0 THEN 0 ELSE NULL END rate,
     public.blueprint_private_count(count(*) FILTER(WHERE days>=2),count(*) FILTER(WHERE days>=2)) repeats FROM people
 )
 SELECT jsonb_build_object('schema_version',2,'privacy_minimum',10,
   'summary',(SELECT value FROM metrics)||jsonb_build_object('total_users',(SELECT total_users FROM totals),
     'hunt_completions',(SELECT public.blueprint_private_count(count(*),count(DISTINCT profile_id)) FROM completed),
     'engagement_rate',(SELECT rate FROM engagement),'repeat_users',(SELECT repeats FROM engagement)),
   'venues',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.name) FROM venue_report v),'[]'::jsonb),
   'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day) FROM daily d),'[]'::jsonb),
   'funnel',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM stages s),'[]'::jsonb)||jsonb_build_array(
     jsonb_build_object('event_type','HUNT_COMPLETED','events',(SELECT public.blueprint_private_count(count(*),count(DISTINCT profile_id)) FROM completed),
       'users',(SELECT public.blueprint_private_count(count(DISTINCT profile_id),count(DISTINCT profile_id)) FROM completed))),
   'exposure',NULL,
   'hype',(SELECT jsonb_build_object('score',s.score,'snapshot_date',s.snapshot_date)
     FROM public.hype_snapshots s WHERE s.campaign_id=p_campaign_id
       AND s.snapshot_date >= (p_from AT TIME ZONE 'Asia/Kolkata')::date
       AND (s.snapshot_date+1)::timestamp AT TIME ZONE 'Asia/Kolkata' <= p_to
     ORDER BY s.snapshot_date DESC LIMIT 1)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.blueprint_report(uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.blueprint_report(uuid,timestamptz,timestamptz) TO authenticated;

-- Recompute complete days so retries, late events and erasure are reflected.
-- Serialized per campaign; campaign totals and venue buckets cannot race.
CREATE FUNCTION public.blueprint_compute_stats(p_campaign uuid,p_from date,p_through date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_from IS NULL OR p_through IS NULL OR p_through<p_from OR p_through-p_from>366 THEN RAISE EXCEPTION 'Invalid stats range'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_campaign::text));
 DELETE FROM public.campaign_daily_stats WHERE campaign_id=p_campaign AND stat_date BETWEEN p_from AND p_through;
 INSERT INTO public.campaign_daily_stats(campaign_id,venue_id,stat_date,scans,unique_users,new_users,hunt_starts,hunt_completions,reward_claims,shares)
 WITH days AS (SELECT generate_series(p_from::timestamp,p_through::timestamp,interval '1 day')::date AS day),
 buckets AS (SELECT NULL::uuid venue_id UNION ALL SELECT venue_id FROM public.campaign_venues WHERE campaign_id=p_campaign),
 e AS (SELECT * FROM public.events WHERE campaign_id=p_campaign AND (event_type<>'QR_SCANNED' OR (metadata->>'is_valid'='true' AND metadata->>'source'='scan')))
 SELECT p_campaign,b.venue_id,d.day,count(e.id) FILTER(WHERE event_type='QR_SCANNED'),count(DISTINCT e.profile_id),
   count(e.id) FILTER(WHERE event_type='USER_REGISTERED'),count(e.id) FILTER(WHERE event_type='HUNT_STARTED'),
   (SELECT count(*) FROM public.hunt_progress hp JOIN public.hunts h ON h.id=hp.hunt_id
    WHERE h.campaign_id=p_campaign AND hp.status::text='completed' AND (hp.completed_at AT TIME ZONE 'Asia/Kolkata')::date=d.day
      AND (b.venue_id IS NULL OR EXISTS(SELECT 1 FROM public.enrollments n WHERE n.campaign_id=p_campaign AND n.profile_id=hp.profile_id AND n.first_venue_id=b.venue_id))),
   count(e.id) FILTER(WHERE event_type='REWARD_CLAIMED'),count(e.id) FILTER(WHERE event_type='SHARE_COMPLETED')
 FROM days d CROSS JOIN buckets b LEFT JOIN e ON (e.created_at AT TIME ZONE 'Asia/Kolkata')::date=d.day AND (b.venue_id IS NULL OR e.venue_id=b.venue_id)
 GROUP BY b.venue_id,d.day;
END $$;
REVOKE ALL ON FUNCTION public.blueprint_compute_stats(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.blueprint_compute_stats(uuid,date,date) TO service_role;

CREATE FUNCTION public.blueprint_compute_hype(p_campaign uuid,p_day date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.hype_config; signals jsonb; parts jsonb:='{}'; k text;
 target numeric; weight numeric; weights_total numeric:=0; score_total numeric:=0;
 users_now bigint; users_before bigint; scans bigint; starts bigint; completions bigint;
BEGIN
 IF p_day IS NULL OR p_day >= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'Use a completed reporting day'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_campaign::text));
 DELETE FROM public.hype_snapshots WHERE campaign_id=p_campaign AND snapshot_date=p_day;
 SELECT * INTO cfg FROM public.hype_config WHERE campaign_id=p_campaign;
 IF NOT FOUND THEN RETURN; END IF;
 IF jsonb_typeof(cfg.targets)<>'object' OR jsonb_typeof(cfg.weights)<>'object'
   OR cfg.targets-ARRAY['S','G','C','R','H','W']<>'{}'::jsonb OR cfg.weights-ARRAY['S','G','C','R','H','W']<>'{}'::jsonb THEN RAISE EXCEPTION 'Invalid hype configuration'; END IF;
 FOREACH k IN ARRAY ARRAY['S','G','C','R','H','W'] LOOP
   IF jsonb_typeof(cfg.targets->k) IS DISTINCT FROM 'number' OR jsonb_typeof(cfg.weights->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Six numeric targets and weights required'; END IF;
   target:=(cfg.targets->>k)::numeric; weight:=(cfg.weights->>k)::numeric;
   IF target<=0 OR weight<0 OR weight>1 THEN RAISE EXCEPTION 'Targets must be positive; weights must be 0..1'; END IF;
   weights_total:=weights_total+weight;
 END LOOP;
 IF abs(weights_total-1)>0.000001 THEN RAISE EXCEPTION 'Hype weights must sum to one'; END IF;
 WITH e AS (
   SELECT *, (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day FROM public.events
   WHERE campaign_id=p_campaign AND created_at >= (p_day-13)::timestamp AT TIME ZONE 'Asia/Kolkata'
     AND created_at < (p_day+1)::timestamp AT TIME ZONE 'Asia/Kolkata'
     AND (event_type<>'QR_SCANNED' OR (metadata->>'is_valid'='true' AND metadata->>'source'='scan'))
 ) SELECT count(DISTINCT profile_id) FILTER(WHERE day>=p_day-6),count(DISTINCT profile_id) FILTER(WHERE day<p_day-6),
   count(*) FILTER(WHERE day>=p_day-6 AND event_type='QR_SCANNED'),count(*) FILTER(WHERE day>=p_day-6 AND event_type='HUNT_STARTED')
 INTO users_now,users_before,scans,starts FROM e;
 -- Suppress the score itself for small cohorts or an unavailable growth baseline.
 IF users_now<10 OR users_before<10 THEN RETURN; END IF;
 SELECT count(*) INTO completions FROM public.hunt_progress hp JOIN public.hunts h ON h.id=hp.hunt_id
 WHERE h.campaign_id=p_campaign AND hp.status::text='completed'
   AND hp.completed_at >= (p_day-6)::timestamp AT TIME ZONE 'Asia/Kolkata'
   AND hp.completed_at < (p_day+1)::timestamp AT TIME ZONE 'Asia/Kolkata';
 WITH e AS (
   SELECT *, (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day FROM public.events
   WHERE campaign_id=p_campaign AND created_at >= (p_day-6)::timestamp AT TIME ZONE 'Asia/Kolkata'
     AND created_at < (p_day+1)::timestamp AT TIME ZONE 'Asia/Kolkata'
     AND (event_type<>'QR_SCANNED' OR (metadata->>'is_valid'='true' AND metadata->>'source'='scan'))
 ), repeaters AS (SELECT profile_id FROM e WHERE profile_id IS NOT NULL GROUP BY profile_id HAVING count(DISTINCT day)>=2)
 SELECT jsonb_build_object(
   'S',count(*) FILTER(WHERE day=p_day AND event_type='QR_SCANNED'),
   'G',coalesce(count(*) FILTER(WHERE event_type='USER_REGISTERED')::numeric/nullif(scans,0),0),
   'C',coalesce(completions::numeric/nullif(starts,0),0),
   'R',(SELECT count(*) FROM repeaters)::numeric/users_now,
   'H',count(*) FILTER(WHERE event_type IN ('SHARE_COMPLETED','REFERRAL_JOINED'))::numeric/users_now,
   'W',(users_now-users_before)::numeric/users_before) INTO signals FROM e;
 FOREACH k IN ARRAY ARRAY['S','G','C','R','H','W'] LOOP
   target:=least(1,greatest(0,(signals->>k)::numeric/(cfg.targets->>k)::numeric));
   parts:=parts||jsonb_build_object(k,target);
   score_total:=score_total+target*(cfg.weights->>k)::numeric;
 END LOOP;
 INSERT INTO public.hype_snapshots(campaign_id,snapshot_date,score,components)
 VALUES(p_campaign,p_day,round(100*score_total),jsonb_build_object('normalized',parts,'targets',cfg.targets,'weights',cfg.weights,'window_days',7));
END $$;
REVOKE ALL ON FUNCTION public.blueprint_compute_hype(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.blueprint_compute_hype(uuid,date) TO service_role;
COMMIT;
