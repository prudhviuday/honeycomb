-- Admin-only friend-invite QR creation lets staff attach a campaign QR to a selected user.
create or replace function public.admin_create_friend_invite_qr(
  p_campaign_id uuid,
  p_inviter_user_id uuid,
  p_referral_code text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_code text := upper(replace(gen_random_uuid()::text, '-', ''));
  v_referral_code text := nullif(trim(p_referral_code), '');
  v_source_id uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;

  if p_inviter_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_inviter_user_id
  ) then
    raise exception 'Choose a valid Honeybadger user.';
  end if;

  if not exists (
    select 1 from public.campaigns c
    join public.movies m on m.id = c.movie_id and m.active = true
    where c.id = p_campaign_id and c.active = true
  ) then
    raise exception 'QR codes require an active campaign linked to an active movie.';
  end if;

  if v_referral_code is null then
    select rc.code into v_referral_code
    from public.referral_codes rc
    where rc.campaign_id = p_campaign_id
      and rc.user_id = p_inviter_user_id
      and rc.is_active = true
    order by rc.created_at
    limit 1;
  end if;

  if v_referral_code is null then
    v_referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    insert into public.referral_codes(campaign_id, user_id, code, is_active)
    values (p_campaign_id, p_inviter_user_id, v_referral_code, true);
  end if;

  select s.id into v_source_id
  from public.interaction_sources s
  where s.campaign_id = p_campaign_id
    and s.source_type = 'referral'
    and s.is_active = true
  order by s.created_at
  limit 1;

  if v_source_id is null then
    insert into public.interaction_sources(
      campaign_id, source_type, name, description, points, reward_entries, metadata
    ) values (
      p_campaign_id, 'referral', 'Friend invitation',
      'Admin-created friend invitation QR', 0, 0,
      jsonb_build_object('created_for', 'admin_friend_invite_qr')
    ) returning id into v_source_id;
  end if;

  insert into public.qr_codes(
    campaign_id, interaction_source_id, code_hash, public_code, qr_type,
    purpose, inviter_user_id, referral_code, is_active
  ) values (
    p_campaign_id, v_source_id, md5(v_code), v_code, 'referral',
    'friend_invite', p_inviter_user_id, v_referral_code, true
  );

  return v_code;
end;
$function$;

revoke all on function public.admin_create_friend_invite_qr(uuid, uuid, text) from public, anon;
grant execute on function public.admin_create_friend_invite_qr(uuid, uuid, text) to authenticated;


-- SECURITY DEFINER functions are not executable by public clients by default policy.
revoke all on function public.admin_create_friend_invite_qr(uuid, uuid, text) from anon, public;
grant execute on function public.admin_create_friend_invite_qr(uuid, uuid, text) to authenticated;
