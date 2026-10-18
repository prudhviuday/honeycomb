-- Compact activity numbering and configuration-driven task progress.
-- Activity number = one occurrence (31, 32, 33 ...).
-- event_type_id = the compact code for the kind of activity (e.g. referral_friend_qualified).
-- These are deliberately separate: the same activity type can occur many times and in many campaigns.

alter table public.activity_events
  add column if not exists activity_number bigint generated always as identity;

create unique index if not exists activity_events_activity_number_uidx
  on public.activity_events (activity_number);

create unique index if not exists activity_events_event_key_uidx
  on public.activity_events (event_key)
  where event_key is not null;

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

comment on column public.activity_events.activity_number is
  'Compact sequential identifier for an individual activity occurrence. Use event_type_id to identify the activity category.';
comment on column public.missions.progress_event_type_id is
  'Optional activity category that advances this mission. When NULL, existing mission-specific processing remains in control.';
comment on column public.missions.progress_mode is
  'event_count counts trusted occurrences; distinct_entities counts unique entity_id values for the configured event type.';

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
  v_activity_number bigint;
  v_campaign_user_id uuid;
  v_balance integer;
  v_mission record;
  v_progress integer;
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
    p_entity_id, coalesce(p_metadata, '{}'::jsonb), p_event_key, 'server'
  )
  on conflict (event_key) where event_key is not null do nothing
  returning id, activity_number into v_activity_id, v_activity_number;

  if v_activity_id is null then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'activityNumber', null,
      'tasksCompleted', '[]'::jsonb
    );
  end if;

  -- Anonymous events are still logged, but never advance a user's tasks.
  if p_user_id is null or p_campaign_id is null then
    return jsonb_build_object(
      'success', true,
      'duplicate', false,
      'activityNumber', v_activity_number,
      'tasksCompleted', v_tasks_completed
    );
  end if;

  -- Serialize task awards and balance changes for this user/campaign.
  select cu.id, coalesce(cu.points_balance, 0)
    into v_campaign_user_id, v_balance
  from public.campaign_users cu
  where cu.campaign_id = p_campaign_id
    and cu.user_id = p_user_id
    and cu.status = 'active'
  for update;

  if not found then
    return jsonb_build_object(
      'success', true,
      'duplicate', false,
      'activityNumber', v_activity_number,
      'tasksCompleted', v_tasks_completed,
      'progressSkipped', 'user_not_active_in_campaign'
    );
  end if;

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
    if v_mission.progress_mode = 'distinct_entities' then
      select count(distinct e.entity_id)::integer
        into v_progress
      from public.activity_events e
      where e.campaign_id = p_campaign_id
        and e.user_id = p_user_id
        and e.event_type_id = p_event_type_id
        and e.origin = 'server'
        and e.entity_id is not null;
    else
      select count(*)::integer
        into v_progress
      from public.activity_events e
      where e.campaign_id = p_campaign_id
        and e.user_id = p_user_id
        and e.event_type_id = p_event_type_id
        and e.origin = 'server';
    end if;

    v_target := greatest(1, coalesce(v_mission.target_value, 1));
    v_reward := greatest(0, coalesce(v_mission.reward_points, 0));
    v_progress := least(v_progress, v_target);

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

    -- Recompute the count after the row lock without losing the current count.
    if v_mission.progress_mode = 'distinct_entities' then
      select least(count(distinct e.entity_id)::integer, v_target)
        into v_progress
      from public.activity_events e
      where e.campaign_id = p_campaign_id
        and e.user_id = p_user_id
        and e.event_type_id = p_event_type_id
        and e.origin = 'server'
        and e.entity_id is not null;
    else
      select least(count(*)::integer, v_target)
        into v_progress
      from public.activity_events e
      where e.campaign_id = p_campaign_id
        and e.user_id = p_user_id
        and e.event_type_id = p_event_type_id
        and e.origin = 'server';
    end if;

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
        and pt.amount > 0
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

        insert into public.activity_events (
          campaign_id, user_id, event_type, event_type_id, entity_type,
          entity_id, metadata, event_key, origin
        )
        values (
          p_campaign_id, p_user_id, 'task_completed', 17, 'mission',
          v_mission.id,
          jsonb_build_object(
            'mission_id', v_mission.id,
            'mission_name', v_mission.name,
            'reward_points', v_reward,
            'trigger_activity_number', v_activity_number
          ),
          'task-completed:' || v_mission.id::text || ':' || p_user_id::text,
          'server'
        )
        on conflict (event_key) where event_key is not null do nothing;

        v_tasks_completed := v_tasks_completed || jsonb_build_array(
          jsonb_build_object(
            'missionId', v_mission.id,
            'missionName', v_mission.name,
            'rewardPoints', v_reward
          )
        );
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'activityNumber', v_activity_number,
    'tasksCompleted', v_tasks_completed
  );
end;
$function$;

revoke all on function public.record_trusted_activity_and_progress(
  uuid, uuid, smallint, text, text, uuid, jsonb
) from public, anon, authenticated;

