CREATE OR REPLACE FUNCTION public.resolve_public_qr(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_qr record;
begin
  if coalesce(trim(p_code), '') = '' then
    return jsonb_build_object('success', false, 'message', 'QR code is missing.');
  end if;

  select
    q.id as qr_id,
    q.campaign_id,
    q.purpose,
    q.qr_type,
    q.venue_id,
    q.inviter_user_id,
    q.referral_code,
    q.hunt_id,
    s.name as source_name,
    s.source_type,
    s.location_id,
    c.name as campaign_name,
    c.media_url,
    c.active as campaign_active,
    m.title as movie_title,
    m.poster_url,
    m.trailer_url,
    m.active as movie_active,
    coalesce(v.name, l.name, s.name, c.name) as display_source
  into v_qr
  from public.qr_codes q
  join public.campaigns c on c.id = q.campaign_id
  left join public.movies m on m.id = c.movie_id
  left join public.interaction_sources s
    on s.id = q.interaction_source_id and s.campaign_id = q.campaign_id
  left join public.locations l on l.id = s.location_id
  left join public.venues v on v.id = q.venue_id
  where (
      q.public_code = upper(trim(p_code))
      or q.short_code = upper(trim(p_code))
      or q.code_hash = md5(upper(trim(p_code)))
    )
    and q.is_active = true
    and (q.starts_at is null or q.starts_at <= now())
    and (q.expires_at is null or q.expires_at >= now())
    and (q.max_uses is null or q.use_count < q.max_uses)
    and c.active = true
    and c.movie_id is not null
    and m.id is not null
    and m.active = true
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'message', 'This movie promotion QR is invalid, inactive or expired.');
  end if;

  return jsonb_build_object(
    'success', true,
    'qrCodeId', v_qr.qr_id,
    'campaignId', v_qr.campaign_id,
    'campaignName', v_qr.campaign_name,
    'campaignMediaUrl', v_qr.media_url,
    'movieTitle', coalesce(v_qr.movie_title, v_qr.campaign_name),
    'posterUrl', v_qr.poster_url,
    'trailerUrl', v_qr.trailer_url,
    'purpose', v_qr.purpose,
    'qrType', v_qr.qr_type,
    'sourceName', v_qr.display_source,
    'sourceType', v_qr.source_type,
    'locationId', v_qr.location_id,
    'venueId', v_qr.venue_id,
    'inviterUserId', v_qr.inviter_user_id,
    'referralCode', case when v_qr.purpose = 'friend_invite' then v_qr.referral_code else null end,
    'huntId', v_qr.hunt_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_qr_landing_event(p_code text, p_event_type text, p_visitor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_qr record;
  v_user_id uuid := auth.uid();
begin
  if p_event_type not in ('page_view', 'signup_started', 'signup_completed', 'campaign_joined') then
    raise exception 'Unsupported QR landing event.';
  end if;
  if p_visitor_id is null then
    raise exception 'A session visitor id is required.';
  end if;
  if p_event_type in ('signup_completed', 'campaign_joined') and v_user_id is null then
    raise exception 'Authentication is required to record signup completion.';
  end if;

  select q.id, q.campaign_id, q.purpose, q.inviter_user_id, q.referral_code
  into v_qr
  from public.qr_codes q
  join public.campaigns c on c.id = q.campaign_id and c.active = true
  join public.movies m on m.id = c.movie_id and m.active = true
  where (
      q.public_code = upper(trim(p_code))
      or q.short_code = upper(trim(p_code))
      or q.code_hash = md5(upper(trim(p_code)))
    )
    and q.is_active = true
    and (q.starts_at is null or q.starts_at <= now())
    and (q.expires_at is null or q.expires_at >= now())
    and (q.max_uses is null or q.use_count < q.max_uses)
  limit 1;

  if not found then
    return false;
  end if;

  insert into public.qr_landing_events(qr_id, campaign_id, user_id, visitor_id, event_type)
  values (v_qr.id, v_qr.campaign_id, v_user_id, p_visitor_id, p_event_type)
  on conflict (qr_id, visitor_id, event_type)
  do update set user_id = coalesce(excluded.user_id, public.qr_landing_events.user_id);

  if p_event_type in ('signup_completed', 'campaign_joined')
     and v_user_id is not null
     and v_qr.purpose = 'friend_invite'
     and v_qr.inviter_user_id is not null
     and v_qr.inviter_user_id <> v_user_id
     and v_qr.referral_code is not null
     and not exists (
       select 1 from public.referrals
       where campaign_id = v_qr.campaign_id
         and referred_user_id = v_user_id
         and referral_code = v_qr.referral_code
     ) then
    insert into public.referrals(campaign_id, referrer_user_id, referred_user_id, referral_code, status)
    values (v_qr.campaign_id, v_qr.inviter_user_id, v_user_id, v_qr.referral_code, 'registered');
  end if;

  return true;
end;
$function$;