-- Compact activity numbering and configuration-driven task progress.
-- Activity number = one occurrence (31, 32, 33 ...).
-- event_type_id = the compact code for the kind of activity (e.g. referral_friend_qualified).
-- These are deliberately separate: the same activity type can occur many times and in many campaigns.

-- activity_event_types.id is the compact numeric activity code.
-- Do not add a second per-row number: it duplicates the existing event_type_id.
create unique index if not exists activity_events_event_key_uidx
  on public.activity_events (event_key)
  where event_key is not null;

-- Supports the per-user/per-campaign event counts used by task progress.
create index if not exists activity_events_task_progress_idx
  on public.activity_events (campaign_id, user_id, event_type_id, entity_id)
  where origin in ('app', 'server');

create unique index if not exists mission_progress_mission_user_uidx
  on public.mission_progress (mission_id, user_id);

insert into public.activity_event_types (id, code, description, is_important)
values
  (37, 'referral_qr_scanned', 'A friend opened/scanned a campaign referral QR', true),
  (38, 'referral_friend_qualified', 'A referred friend satisfied the configured qualification rule', true)
on conflict (id) do update
set code = excluded.code,
    description = excluded.description,
    is_important = excluded.is_important;

alter table public.missions
  add column if not exists progress_event_type_id smallint
    references public.activity_event_types(id),
  add column if not exists progress_mode text not null default 'event_count';

alter table public.missions
  drop constraint if exists missions_progress_mode_check;

alter table public.missions
  add constraint missions_progress_mode_check
  check (progress_mode in ('event_count', 'distinct_entities'));

-- Internal entry point for trusted database functions only. Do not grant this
-- to anon/authenticated: client-submitted events are not valid reward evidence.
create or replace function public.record_trusted_activity_and_progress(
  p_campaign_id uuid,
  p_user_id uuid,
  p_event_type_id smallint,
  p_event_key text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_type_code text;
  v_activity_id uuid;
  v_campaign_user_id uuid;
  v_mission record;
  v_progress integer;
  v_event_count integer := 0;
  v_distinct_entity_count integer := 0;
  v_completed boolean;
  v_target integer;
  v_reward integer;
  v_tasks_completed jsonb := '[]'::jsonb;
  v_transaction_id uuid;
begin
  if p_event_type_id is null
     or nullif(trim(coalesce(p_event_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'Event type and idempotency key are required.';
  end if;

  select t.code into v_type_code
  from public.activity_event_types t
  where t.id = p_event_type_id;

  if v_type_code is null then
    raise exception using errcode = '22023', message = 'Unknown activity event type.';
  end if;

  if p_campaign_id is not null and not exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id and c.active = true
  ) then
    raise exception using errcode = '22023', message = 'Campaign is not active.';
  end if;

  -- Event occurrence is written once. A retry with the same key cannot
  -- create another occurrence or award the same mission a second time.
  insert into public.activity_events (
    campaign_id, user_id, event_type, event_type_id, entity_type, entity_id,
    metadata, event_key, origin
  )
  values (
    p_campaign_id, p_user_id, v_type_code, p_event_type_id, p_entity_type,
    p_entity_id, coalesce(p_metadata, '{}'::jsonb), p_event_key, 'app'
  )
  on conflict (event_key) where event_key is not null do nothing
  returning id into v_activity_id;

  if v_activity_id is null then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'activityNumber', p_event_type_id,
      'tasksCompleted', '[]'::jsonb
    );
  end if;

  -- Anonymous events are still logged, but never advance a user's tasks.
  if p_user_id is null or p_campaign_id is null then
    return jsonb_build_object(
      'success', true,
      'duplicate', false,
      'activityNumber', p_event_type_id,
      'tasksCompleted', v_tasks_completed
    );
  end if;

  -- Serialize task awards and balance changes for this user/campaign.
  select cu.id
    into v_campaign_user_id
  from public.campaign_users cu
  where cu.campaign_id = p_campaign_id
    and cu.user_id = p_user_id
    and cu.status = 'active'
  for update;

  if not found then
    return jsonb_build_object(
      'success', true,
      'duplicate', false,
      'activityNumber', p_event_type_id,
      'tasksCompleted', v_tasks_completed,
      'progressSkipped', 'user_not_active_in_campaign'
    );
  end if;

  -- One indexed aggregate serves every active mission listening for this event.
  -- The campaign-user row lock serializes this user's event processing.
  select count(*)::integer, count(distinct e.entity_id)::integer
    into v_event_count, v_distinct_entity_count
  from public.activity_events e
  where e.campaign_id = p_campaign_id
    and e.user_id = p_user_id
    and e.event_type_id = p_event_type_id
    and e.origin in ('app', 'server');

  for v_mission in
    select m.id, m.name, m.target_value, m.reward_points, m.progress_mode
    from public.missions m
    where m.campaign_id = p_campaign_id
      and m.is_active = true
      and m.progress_event_type_id = p_event_type_id
      and (m.starts_at is null or m.starts_at <= now())
      and (m.ends_at is null or m.ends_at >= now())
    order by m.id
  loop
    v_target := greatest(1, coalesce(v_mission.target_value, 1));
    v_reward := greatest(0, coalesce(v_mission.reward_points, 0));

    select mp.progress, mp.completed
      into v_progress, v_completed
    from public.mission_progress mp
    where mp.mission_id = v_mission.id
      and mp.user_id = p_user_id
    for update;

    if not found then
      insert into public.mission_progress (
        mission_id, user_id, progress, completed, completed_at
      )
      values (
        v_mission.id, p_user_id, 0, false, null
      )
      on conflict (mission_id, user_id) do nothing;

      select mp.progress, mp.completed
        into v_progress, v_completed
      from public.mission_progress mp
      where mp.mission_id = v_mission.id
        and mp.user_id = p_user_id
      for update;
    end if;

    -- Reuse the indexed aggregate for all missions of this event type.
    v_progress := least(
      case
        when v_mission.progress_mode = 'distinct_entities'
          then coalesce(v_distinct_entity_count, 0)
        else coalesce(v_event_count, 0)
      end,
      v_target
    );

    if coalesce(v_completed, false) then
      update public.mission_progress
      set progress = greatest(progress, v_progress)
      where mission_id = v_mission.id and user_id = p_user_id;
      continue;
    end if;

    update public.mission_progress
    set progress = v_progress,
        completed = (v_progress >= v_target),
        completed_at = case when v_progress >= v_target then now() else null end
    where mission_id = v_mission.id and user_id = p_user_id;

    if v_progress >= v_target then
      -- A prior ledger entry is also treated as proof that this mission was
      -- paid, protecting data restored from older deployments.
      select pt.id into v_transaction_id
      from public.point_transactions pt
      where pt.campaign_id = p_campaign_id
        and pt.user_id = p_user_id
        and pt.source_type = 'mission'
        and pt.source_id = v_mission.id
        and pt.amount >= 0
      limit 1;

      if v_transaction_id is null then
        insert into public.point_transactions (
          campaign_id, user_id, amount, source_type, source_id, description
        )
        values (
          p_campaign_id, p_user_id, v_reward, 'mission', v_mission.id,
          'Mission completed: ' || v_mission.name
        )
        returning id into v_transaction_id;

        update public.campaign_users
        set points_balance = coalesce(points_balance, 0) + v_reward,
            last_activity_at = now()
        where id = v_campaign_user_id;
      end if;

      v_tasks_completed := v_tasks_completed || jsonb_build_array(
        jsonb_build_object(
          'missionId', v_mission.id,
          'missionName', v_mission.name,
          'rewardPoints', v_reward
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'activityNumber', p_event_type_id,
    'tasksCompleted', v_tasks_completed
  );
end;
$function$;

revoke all on function public.record_trusted_activity_and_progress(
  uuid, uuid, smallint, text, text, uuid, jsonb
) from public, anon, authenticated;


-- Tie referral landing events into the shared activity/task engine.
-- Signup completion and campaign joining are distinct qualification signals:
-- missions can count event type 30 (signup) or 38 (qualified/joined friend).
create or replace function public.record_qr_landing_event(
  p_code text,
  p_event_type text,
  p_visitor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_qr record;
  v_user_id uuid := auth.uid();
  v_referrer_id uuid;
  v_referral_id uuid;
  v_referral_status text;
  v_referral_code text;
begin
  if p_event_type not in ('page_view', 'signup_started', 'signup_completed', 'campaign_joined') then
    raise exception using errcode = '22023', message = 'Unsupported QR landing event.';
  end if;

  if p_visitor_id is null then
    raise exception using errcode = '22023', message = 'A session visitor id is required.';
  end if;

  if p_event_type in ('signup_completed', 'campaign_joined') and v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to record signup completion.';
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

  -- A referral QR visit is an activity for the inviter. The visitor UUID is
  -- the entity, so repeat visits by the same visitor can be deduplicated.
  if p_event_type = 'page_view'
     and v_qr.purpose = 'friend_invite'
     and v_qr.inviter_user_id is not null then
    perform public.record_trusted_activity_and_progress(
      v_qr.campaign_id,
      v_qr.inviter_user_id,
      37,
      'referral-qr-visit:' || v_qr.id::text || ':' || p_visitor_id::text,
      'referral_visitor',
      p_visitor_id,
      jsonb_build_object(
        'qr_id', v_qr.id,
        'referral_code', v_qr.referral_code,
        'referred_user_id', v_user_id
      )
    );
  end if;

  if p_event_type in ('signup_completed', 'campaign_joined')
     and v_user_id is not null
     and v_qr.purpose = 'friend_invite'
     and v_qr.inviter_user_id is not null
     and v_qr.inviter_user_id <> v_user_id
     and v_qr.referral_code is not null
     and exists (
       select 1 from public.qr_landing_events le
       where le.qr_id = v_qr.id
         and le.visitor_id = p_visitor_id
         and le.event_type = 'page_view'
     ) then

    -- First referral attribution wins: one referrer per referred user/campaign.
    insert into public.referrals(
      campaign_id, referrer_user_id, referred_user_id, referral_code, status,
      qualified_at
    )
    select
      v_qr.campaign_id,
      v_qr.inviter_user_id,
      v_user_id,
      v_qr.referral_code,
      case when p_event_type = 'campaign_joined' then 'qualified' else 'registered' end,
      case when p_event_type = 'campaign_joined' then now() else null end
    where not exists (
      select 1
      from public.referrals r
      where r.campaign_id = v_qr.campaign_id
        and r.referred_user_id = v_user_id
    );

    select r.id, r.referrer_user_id, r.status, r.referral_code
      into v_referral_id, v_referrer_id, v_referral_status, v_referral_code
    from public.referrals r
    where r.campaign_id = v_qr.campaign_id
      and r.referred_user_id = v_user_id
    order by r.created_at
    limit 1
    for update;

    if found then
      if p_event_type = 'campaign_joined' and v_referral_status <> 'qualified' then
        update public.referrals
        set status = 'qualified',
            qualified_at = coalesce(qualified_at, now())
        where id = v_referral_id;
        v_referral_status := 'qualified';
      end if;

      if p_event_type = 'signup_completed' then
        perform public.record_trusted_activity_and_progress(
          v_qr.campaign_id,
          v_referrer_id,
          30,
          'referral-signup:' || v_qr.campaign_id::text || ':' || v_user_id::text,
          'referred_user',
          v_user_id,
          jsonb_build_object(
            'referral_id', v_referral_id,
            'referral_code', v_referral_code,
            'qualification_signal', 'signup_completed'
          )
        );
      elsif p_event_type = 'campaign_joined' then
        perform public.record_trusted_activity_and_progress(
          v_qr.campaign_id,
          v_referrer_id,
          38,
          'referral-qualified:' || v_qr.campaign_id::text || ':' || v_user_id::text,
          'referred_user',
          v_user_id,
          jsonb_build_object(
            'referral_id', v_referral_id,
            'referral_code', v_referral_code,
            'qualification_signal', 'campaign_joined'
          )
        );
      end if;
    end if;
  end if;

  return true;
end;
$function$;


-- Any trusted transition to completed creates a completion activity, including
-- missions completed by the existing process_scan/hunt implementation.
create or replace function public.log_mission_completion_activity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_mission record;
begin
  if new.completed is true
     and (tg_op = 'INSERT' or coalesce(old.completed, false) is false) then
    select m.id, m.campaign_id, m.name, m.reward_points
      into v_mission
    from public.missions m
    where m.id = new.mission_id;

    if found then
      insert into public.activity_events (
        campaign_id, user_id, event_type, event_type_id, entity_type,
        entity_id, metadata, event_key, origin
      )
      values (
        v_mission.campaign_id,
        new.user_id,
        'task_completed',
        17,
        'mission',
        v_mission.id,
        jsonb_build_object(
          'mission_id', v_mission.id,
          'mission_name', v_mission.name,
          'reward_points', v_mission.reward_points,
          'completed_at', coalesce(new.completed_at, now())
        ),
        'task-completed:' || v_mission.id::text || ':' || new.user_id::text,
        'app'
      )
      on conflict (event_key) where event_key is not null do nothing;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists mission_progress_log_completion on public.mission_progress;
create trigger mission_progress_log_completion
after insert or update of completed on public.mission_progress
for each row
execute function public.log_mission_completion_activity();

revoke all on function public.log_mission_completion_activity()
from public, anon, authenticated;
