-- Configurable task verification and reusable task UI contracts.
alter table public.missions
  add column if not exists verification_action text not null default 'event_progress',
  add column if not exists verification_config jsonb not null default '{}'::jsonb,
  add column if not exists ui_component text not null default 'generic',
  add column if not exists ui_config jsonb not null default '{}'::jsonb;

alter table public.missions
  drop constraint if exists missions_verification_action_not_blank,
  drop constraint if exists missions_ui_component_not_blank;
alter table public.missions
  add constraint missions_verification_action_not_blank check (length(trim(verification_action)) > 0),
  add constraint missions_ui_component_not_blank check (length(trim(ui_component)) > 0);

create index if not exists missions_task_verification_dispatch_idx
  on public.missions (campaign_id, verification_action, is_active) where is_active = true;

do $$
declare v_next_id smallint;
begin
  if not exists (select 1 from public.activity_event_types where code = 'qr_scan_task_verified') then
    select (coalesce(max(id), 0) + 1)::smallint into v_next_id from public.activity_event_types;
    insert into public.activity_event_types (id, code, description, is_important)
    values (v_next_id, 'qr_scan_task_verified', 'Accepted QR scan verified for a configured task', true);
  end if;
end;
$$;

-- Verified evidence advances only the task whose verifier accepted it.
create or replace function public.record_verified_task_activity(
  p_mission_id uuid, p_user_id uuid, p_event_type_id smallint, p_event_key text,
  p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_mission record;
  v_event_code text;
  v_activity_id uuid;
  v_activity_number integer;
  v_campaign_user_id uuid;
  v_event_count integer := 0;
  v_distinct_entities integer := 0;
  v_progress integer := 0;
  v_old_progress integer := 0;
  v_completed boolean := false;
  v_target integer;
  v_reward integer;
  v_transaction_id uuid;
begin
  if p_mission_id is null or p_user_id is null or p_event_type_id is null
     or nullif(trim(coalesce(p_event_key, '')), '') is null or p_entity_id is null then
    raise exception using errcode = '22023', message = 'Task, user, event category, idempotency key and evidence entity are required.';
  end if;
  select m.id, m.campaign_id, m.name, m.target_value, m.reward_points,
         m.progress_mode, m.progress_event_type_id, m.is_active, m.starts_at, m.ends_at
    into v_mission from public.missions m where m.id = p_mission_id for update;
  if not found then raise exception using errcode = '22023', message = 'Task does not exist.'; end if;
  if v_mission.is_active is distinct from true
     or (v_mission.starts_at is not null and v_mission.starts_at > now())
     or (v_mission.ends_at is not null and v_mission.ends_at < now()) then
    raise exception using errcode = '22023', message = 'Task is not active in the current time window.';
  end if;
  if v_mission.progress_event_type_id is distinct from p_event_type_id then
    raise exception using errcode = '22023', message = 'Evidence event category does not match task configuration.';
  end if;
  if not exists (select 1 from public.campaigns c where c.id = v_mission.campaign_id and c.active = true) then
    raise exception using errcode = '22023', message = 'Campaign is not active.';
  end if;
  select t.code into v_event_code from public.activity_event_types t where t.id = p_event_type_id;
  if v_event_code is null then raise exception using errcode = '22023', message = 'Unknown activity event category.'; end if;
  select cu.id into v_campaign_user_id from public.campaign_users cu
  where cu.campaign_id = v_mission.campaign_id and cu.user_id = p_user_id and cu.status = 'active' for update;
  if not found then raise exception using errcode = '42501', message = 'User is not an active member of this campaign.'; end if;

  insert into public.activity_events (campaign_id, user_id, event_type, event_type_id, entity_type, entity_id, metadata, event_key, origin)
  values (v_mission.campaign_id, p_user_id, v_event_code, p_event_type_id, p_entity_type, p_entity_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('mission_id', p_mission_id), p_event_key, 'server')
  on conflict (event_key) where event_key is not null do nothing
  returning id, activity_number into v_activity_id, v_activity_number;

  if v_activity_id is null then
    select e.activity_number into v_activity_number from public.activity_events e where e.event_key = p_event_key;
    select coalesce(mp.progress, 0), coalesce(mp.completed, false) into v_progress, v_completed
      from public.mission_progress mp where mp.mission_id = p_mission_id and mp.user_id = p_user_id;
    return jsonb_build_object('success', true, 'duplicate', true, 'activityNumber', v_activity_number,
      'progress', coalesce(v_progress, 0), 'completed', coalesce(v_completed, false), 'tasksCompleted', '[]'::jsonb);
  end if;

  select count(*)::integer, count(distinct e.entity_id)::integer into v_event_count, v_distinct_entities
  from public.activity_events e
  where e.campaign_id = v_mission.campaign_id and e.user_id = p_user_id
    and e.event_type_id = p_event_type_id and e.metadata ->> 'mission_id' = p_mission_id::text
    and e.origin = 'server';
  v_target := greatest(1, coalesce(v_mission.target_value, 1));
  v_reward := greatest(0, coalesce(v_mission.reward_points, 0));
  v_progress := least(case when v_mission.progress_mode = 'distinct_entities' then v_distinct_entities else v_event_count end, v_target);

  select mp.progress, mp.completed into v_old_progress, v_completed from public.mission_progress mp
  where mp.mission_id = p_mission_id and mp.user_id = p_user_id for update;
  if not found then
    insert into public.mission_progress (mission_id, user_id, progress, completed, completed_at)
      values (p_mission_id, p_user_id, 0, false, null) on conflict (mission_id, user_id) do nothing;
    select mp.progress, mp.completed into v_old_progress, v_completed from public.mission_progress mp
      where mp.mission_id = p_mission_id and mp.user_id = p_user_id for update;
  end if;
  if coalesce(v_completed, false) then
    update public.mission_progress set progress = greatest(coalesce(progress, 0), v_progress)
      where mission_id = p_mission_id and user_id = p_user_id;
    return jsonb_build_object('success', true, 'duplicate', false, 'activityNumber', v_activity_number,
      'progress', v_progress, 'completed', true, 'tasksCompleted', '[]'::jsonb);
  end if;
  update public.mission_progress set progress = v_progress,
    completed = (v_progress >= v_target), completed_at = case when v_progress >= v_target then now() else null end
  where mission_id = p_mission_id and user_id = p_user_id;

  if v_progress >= v_target then
    select pt.id into v_transaction_id from public.point_transactions pt
      where pt.campaign_id = v_mission.campaign_id and pt.user_id = p_user_id and pt.source_type = 'mission'
        and pt.source_id = p_mission_id and pt.amount >= 0 limit 1;
    if v_transaction_id is null then
      insert into public.point_transactions (campaign_id, user_id, amount, source_type, source_id, description)
      values (v_mission.campaign_id, p_user_id, v_reward, 'mission', p_mission_id, 'Mission completed: ' || v_mission.name)
      returning id into v_transaction_id;
      update public.campaign_users set points_balance = coalesce(points_balance, 0) + v_reward, last_activity_at = now()
        where id = v_campaign_user_id;
    end if;
    return jsonb_build_object('success', true, 'duplicate', false, 'activityNumber', v_activity_number,
      'progress', v_progress, 'completed', true,
      'tasksCompleted', jsonb_build_array(jsonb_build_object('missionId', p_mission_id, 'missionName', v_mission.name, 'rewardPoints', v_reward)));
  end if;
  return jsonb_build_object('success', true, 'duplicate', false, 'activityNumber', v_activity_number,
    'progress', v_progress, 'completed', false, 'tasksCompleted', '[]'::jsonb);
end;
$function$;

revoke all on function public.record_verified_task_activity(uuid, uuid, smallint, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_verified_task_activity(uuid, uuid, smallint, text, text, uuid, jsonb) to service_role;
comment on column public.missions.verification_action is 'Server verifier registry key; event_progress requires trusted event integrations.';
comment on column public.missions.verification_config is 'Admin-managed verifier settings; not evidence by themselves.';
comment on column public.missions.ui_component is 'Key consumed by the centralized app task UI registry.';
comment on column public.missions.ui_config is 'Presentation options only; never store correct answers or secrets.';
