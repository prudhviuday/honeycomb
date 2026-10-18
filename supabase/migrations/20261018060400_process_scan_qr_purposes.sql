-- Make the existing transactional scan processor aware of universal QR purpose.
-- QR codes still resolve by code_hash so old raw codes remain compatible.

create or replace function public.process_scan(p_campaign_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_qr record;
  v_source record;
  v_campaign_user record;
  v_scan_id uuid;
  v_points integer := 10;
  v_source_name text := 'QR Code';
  v_source_type text := 'generic';
  v_location_id uuid;
  v_total_scans integer;
  v_mission record;
  v_progress integer;
  v_was_completed boolean;
  v_target integer;
  v_reward integer;
  v_mission_bonus integer := 0;
  v_final_points integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if v_code = '' then
    return jsonb_build_object('success', false, 'message', 'Please enter a QR code.',
      'pointsAwarded', 0, 'sourceName', '', 'sourceType', '', 'isNew', false, 'campaignId', p_campaign_id);
  end if;

  if not exists (select 1 from campaigns where id = p_campaign_id and active = true) then
    return jsonb_build_object('success', false, 'message', 'This campaign is not active.',
      'pointsAwarded', 0, 'sourceName', '', 'sourceType', '', 'isNew', false, 'campaignId', p_campaign_id);
  end if;

  select *
  into v_campaign_user
  from campaign_users
  where campaign_id = p_campaign_id and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Please join the campaign before scanning.',
      'pointsAwarded', 0, 'sourceName', '', 'sourceType', '', 'isNew', false, 'campaignId', p_campaign_id);
  end if;

  select *
  into v_qr
  from qr_codes
  where campaign_id = p_campaign_id
    and (public_code = v_code or code_hash = md5(v_code))
    and is_active = true
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Invalid QR code. Please check and try again.',
      'pointsAwarded', 0, 'sourceName', '', 'sourceType', '', 'isNew', false, 'campaignId', p_campaign_id);
  end if;

  if v_qr.starts_at is not null and v_qr.starts_at > now() then
    return jsonb_build_object('success', false, 'message', 'This QR code is not active yet.',
      'pointsAwarded', 0, 'sourceName', '', 'sourceType', '', 'isNew', false, 'campaignId', p_campaign_id);
  end if;

  if v_qr.expires_at is not null and v_qr.expires_at < now() then
    return jsonb_build_object('success', false, 'message', 'This QR code has expired.',
      'pointsAwarded', 0, 'sourceName', '', 'sourceType', '', 'isNew', false, 'campaignId', p_campaign_id);
  end if;

  if v_qr.max_uses is not null and v_qr.use_count >= v_qr.max_uses then
    return jsonb_build_object('success', false, 'message', 'This QR code has reached its usage limit.',
      'pointsAwarded', 0, 'sourceName', '', 'sourceType', '', 'isNew', false, 'campaignId', p_campaign_id);
  end if;

  if exists (
    select 1 from scans
    where campaign_id = p_campaign_id and user_id = v_user_id and qr_id = v_qr.id
  ) then
    return jsonb_build_object('success', false, 'message', 'You already scanned this QR code.',
      'pointsAwarded', 0, 'sourceName', '', 'sourceType', '', 'isNew', false, 'campaignId', p_campaign_id);
  end if;

  if v_qr.interaction_source_id is not null then
    select *
    into v_source
    from interaction_sources
    where id = v_qr.interaction_source_id
      and campaign_id = p_campaign_id
      and is_active = true;

    if found then
      v_source_name := coalesce(v_source.name, v_source_name);
      v_source_type := coalesce(v_source.source_type, v_source_type);
      v_location_id := v_source.location_id;
      v_points := coalesce(v_source.points, 10);
    end if;
  end if;

  insert into scans (
    campaign_id, user_id, qr_id, interaction_source_id, location_id, status
  )
  values (
    p_campaign_id, v_user_id, v_qr.id, v_qr.interaction_source_id,
    v_location_id, 'accepted'
  )
  returning id into v_scan_id;

  -- Friend-invite scans are attributed to the inviter, but never to self-referrals.
  if coalesce(v_qr.purpose, 'general') = 'friend_invite'
     and v_qr.inviter_user_id is not null
     and v_qr.inviter_user_id <> v_user_id
     and v_qr.referral_code is not null
     and not exists (
       select 1 from referrals
       where campaign_id = p_campaign_id
         and referred_user_id = v_user_id
         and referral_code = v_qr.referral_code
     ) then
    insert into referrals(campaign_id, referrer_user_id, referred_user_id, referral_code, status)
    values (p_campaign_id, v_qr.inviter_user_id, v_user_id, v_qr.referral_code, 'registered');
  end if;

  insert into point_transactions (
    campaign_id, user_id, amount, source_type, source_id, description
  )
  values (
    p_campaign_id, v_user_id, v_points, 'scan', v_scan_id, 'Scanned: ' || v_source_name
  );

  update qr_codes
  set use_count = coalesce(use_count, 0) + 1
  where id = v_qr.id;

  select count(*)
  into v_total_scans
  from scans
  where campaign_id = p_campaign_id and user_id = v_user_id;

  -- General scan-count missions do not double-count the designated hunt mission.
  for v_mission in
    select *
    from missions
    where campaign_id = p_campaign_id
      and is_active = true
      and mission_type = 'scan_count'
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at >= now())
      and not (
        coalesce(v_qr.purpose, 'general') = 'hunt_location'
        and id = v_qr.hunt_id
      )
  loop
    v_progress := 0;
    v_was_completed := false;

    select progress, completed
    into v_progress, v_was_completed
    from mission_progress
    where mission_id = v_mission.id and user_id = v_user_id
    for update;

    v_target := greatest(1, coalesce(v_mission.target_value, 1));
    v_reward := greatest(0, coalesce(v_mission.reward_points, 0));
    v_progress := least(v_total_scans, v_target);

    if not found then
      insert into mission_progress (mission_id, user_id, progress, completed, completed_at)
      values (v_mission.id, v_user_id, v_progress, v_progress >= v_target,
        case when v_progress >= v_target then now() else null end);

      if v_progress >= v_target then
        v_mission_bonus := v_mission_bonus + v_reward;
        insert into point_transactions(campaign_id, user_id, amount, source_type, source_id, description)
        values (p_campaign_id, v_user_id, v_reward, 'mission', v_mission.id,
          'Mission completed: ' || v_mission.name);
      end if;
    elsif not coalesce(v_was_completed, false) and v_progress >= v_target then
      update mission_progress
      set progress = v_progress, completed = true, completed_at = now()
      where mission_id = v_mission.id and user_id = v_user_id;

      v_mission_bonus := v_mission_bonus + v_reward;
      insert into point_transactions(campaign_id, user_id, amount, source_type, source_id, description)
      values (p_campaign_id, v_user_id, v_reward, 'mission', v_mission.id,
        'Mission completed: ' || v_mission.name);
    else
      update mission_progress
      set progress = greatest(progress, v_progress)
      where mission_id = v_mission.id and user_id = v_user_id;
    end if;
  end loop;

  -- A hunt-location QR advances only its explicitly associated mission.
  if coalesce(v_qr.purpose, 'general') = 'hunt_location' and v_qr.hunt_id is not null then
    select *
    into v_mission
    from missions
    where id = v_qr.hunt_id
      and campaign_id = p_campaign_id
      and is_active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at >= now());

    if found then
      v_progress := 0;
      v_was_completed := false;
      select progress, completed
      into v_progress, v_was_completed
      from mission_progress
      where mission_id = v_mission.id and user_id = v_user_id
      for update;

      v_target := greatest(1, coalesce(v_mission.target_value, 1));
      v_reward := greatest(0, coalesce(v_mission.reward_points, 0));

      if not found then
        v_progress := least(1, v_target);
        insert into mission_progress(mission_id, user_id, progress, completed, completed_at)
        values (v_mission.id, v_user_id, v_progress, v_progress >= v_target,
          case when v_progress >= v_target then now() else null end);
        if v_progress >= v_target then
          v_mission_bonus := v_mission_bonus + v_reward;
          insert into point_transactions(campaign_id, user_id, amount, source_type, source_id, description)
          values (p_campaign_id, v_user_id, v_reward, 'mission', v_mission.id,
            'Hunt completed: ' || v_mission.name);
        end if;
      elsif not coalesce(v_was_completed, false) then
        v_progress := least(coalesce(v_progress, 0) + 1, v_target);
        update mission_progress
        set progress = v_progress,
            completed = v_progress >= v_target,
            completed_at = case when v_progress >= v_target then coalesce(completed_at, now()) else null end
        where mission_id = v_mission.id and user_id = v_user_id;
        if v_progress >= v_target then
          v_mission_bonus := v_mission_bonus + v_reward;
          insert into point_transactions(campaign_id, user_id, amount, source_type, source_id, description)
          values (p_campaign_id, v_user_id, v_reward, 'mission', v_mission.id,
            'Hunt completed: ' || v_mission.name);
        end if;
      end if;
    end if;
  end if;

  v_final_points := coalesce(v_campaign_user.points_balance, 0) + v_points + v_mission_bonus;
  update campaign_users
  set points_balance = v_final_points, last_activity_at = now()
  where id = v_campaign_user.id;

  insert into activity_events (
    campaign_id, user_id, event_type, entity_type, entity_id, metadata,
    location_id, interaction_source_id, event_key, origin
  )
  values (
    p_campaign_id, v_user_id, 'scan', 'qr_code', v_qr.id,
    jsonb_build_object(
      'source_name', v_source_name,
      'source_type', v_source_type,
      'purpose', coalesce(v_qr.purpose, 'general'),
      'qr_type', v_qr.qr_type,
      'points', v_points,
      'qr_id', v_qr.id,
      'hunt_id', v_qr.hunt_id,
      'venue_id', v_qr.venue_id,
      'inviter_user_id', v_qr.inviter_user_id
    ),
    v_location_id,
    v_qr.interaction_source_id,
    'scan:' || v_scan_id::text,
    'app'
  );

  return jsonb_build_object(
    'success', true,
    'message', 'You earned ' || v_points || ' points from ' || v_source_name || '!',
    'pointsAwarded', v_points + v_mission_bonus,
    'sourceName', v_source_name,
    'sourceType', v_source_type,
    'isNew', true,
    'campaignId', p_campaign_id,
    'purpose', coalesce(v_qr.purpose, 'general'),
    'huntId', v_qr.hunt_id
  );
end;
$function$;
