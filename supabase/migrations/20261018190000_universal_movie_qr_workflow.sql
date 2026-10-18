-- Integrated onto current main after 20261018180000_movie_first_scan_bonus.sql.
-- The current main process_scan already includes purpose-aware and public_code scan handling
-- plus the first-movie bonus; the duplicate historical process_scan migrations are intentionally omitted.

-- Universal movie QR workflow: one /q/:code route for every promotion source.
-- Keep the existing MD5 code_hash compatible with process_scan while adding
-- opaque public codes for newly generated QR URLs.

alter table public.qr_codes
  add column if not exists purpose text not null default 'general',
  add column if not exists public_code text,
  add column if not exists venue_id uuid references public.venues(id) on delete set null,
  add column if not exists inviter_user_id uuid references auth.users(id) on delete set null,
  add column if not exists referral_code text,
  add column if not exists hunt_id uuid references public.missions(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'qr_codes_purpose_check'
      and conrelid = 'public.qr_codes'::regclass
  ) then
    alter table public.qr_codes
      add constraint qr_codes_purpose_check
      check (purpose in ('vendor', 'mall', 'friend_invite', 'hunt_location', 'general'));
  end if;
end $$;

create unique index if not exists qr_codes_public_code_unique
  on public.qr_codes(public_code)
  where public_code is not null;

create index if not exists qr_codes_campaign_purpose_idx
  on public.qr_codes(campaign_id, purpose)
  where is_active = true;
create index if not exists qr_codes_venue_id_idx on public.qr_codes(venue_id);
create index if not exists qr_codes_inviter_user_id_idx on public.qr_codes(inviter_user_id);
create index if not exists qr_codes_hunt_id_idx on public.qr_codes(hunt_id);

-- Prevent newly created QR codes from being attached to a campaign without a movie.
create or replace function public.enforce_movie_for_qr()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.campaigns c
    join public.movies m on m.id = c.movie_id and m.active = true
    where c.id = new.campaign_id and c.active = true
  ) then
    raise exception 'Every Honeycomb QR must belong to an active campaign with an active movie.';
  end if;
  return new;
end;
$function$;

drop trigger if exists qr_codes_require_movie on public.qr_codes;
create trigger qr_codes_require_movie
before insert or update of campaign_id on public.qr_codes
for each row execute function public.enforce_movie_for_qr();
revoke all on function public.enforce_movie_for_qr() from anon, authenticated, public;

create table if not exists public.qr_landing_events (
  id uuid primary key default gen_random_uuid(),
  qr_id uuid not null references public.qr_codes(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  visitor_id uuid not null,
  event_type text not null check (event_type in ('page_view', 'signup_started', 'signup_completed', 'campaign_joined')),
  created_at timestamptz not null default now(),
  constraint qr_landing_events_visitor_event_unique unique (qr_id, visitor_id, event_type)
);

create index if not exists qr_landing_events_campaign_created_idx
  on public.qr_landing_events(campaign_id, created_at desc);
create index if not exists qr_landing_events_user_id_idx on public.qr_landing_events(user_id);

alter table public.qr_landing_events enable row level security;

drop policy if exists qr_landing_events_admin_read on public.qr_landing_events;
create policy qr_landing_events_admin_read
  on public.qr_landing_events
  for select to authenticated
  using ((select public.is_admin()));

revoke all on public.qr_landing_events from anon, authenticated;
grant select on public.qr_landing_events to authenticated;

create or replace function public.resolve_public_qr(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
  where (q.public_code = upper(trim(p_code)) or q.code_hash = md5(upper(trim(p_code))))
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
    'referralCode', case when v_qr.purpose = 'friend_invite' then v_qr.referral_code else null end
  );
end;
$function$;

create or replace function public.record_qr_landing_event(
  p_code text,
  p_event_type text,
  p_visitor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
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
  where (q.public_code = upper(trim(p_code)) or q.code_hash = md5(upper(trim(p_code))))
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

create or replace function public.create_friend_invite_qr(
  p_campaign_id uuid,
  p_referral_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_referral record;
  v_source_id uuid;
  v_public_code text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select rc.id, rc.campaign_id, rc.user_id, rc.code
  into v_referral
  from public.referral_codes rc
  join public.campaigns c on c.id = rc.campaign_id and c.active = true
  join public.movies m on m.id = c.movie_id and m.active = true
  where rc.campaign_id = p_campaign_id
    and rc.user_id = v_user_id
    and rc.code = p_referral_code
    and rc.is_active = true
  limit 1;

  if not found then
    raise exception 'Active referral code not found for this campaign and user.';
  end if;

  select q.public_code into v_public_code
  from public.qr_codes q
  where q.campaign_id = p_campaign_id
    and q.purpose = 'friend_invite'
    and q.inviter_user_id = v_user_id
    and q.referral_code = p_referral_code
    and q.is_active = true
    and q.public_code is not null
  limit 1;

  if v_public_code is not null then
    return v_public_code;
  end if;

  select s.id into v_source_id
  from public.interaction_sources s
  where s.campaign_id = p_campaign_id
    and s.source_type = 'referral'
    and s.is_active = true
  order by s.created_at
  limit 1;

  if v_source_id is null then
    insert into public.interaction_sources(campaign_id, source_type, name, description, points, reward_entries, metadata)
    values (p_campaign_id, 'referral', 'Friend invitation', 'Friend invitation QR for this movie promotion', 0, 0,
      jsonb_build_object('created_for', 'friend_invite_qr'))
    returning id into v_source_id;
  end if;

  v_public_code := upper(replace(gen_random_uuid()::text, '-', ''));

  insert into public.qr_codes(
    campaign_id, interaction_source_id, code_hash, public_code, qr_type, purpose,
    inviter_user_id, referral_code, is_active
  )
  values (
    p_campaign_id, v_source_id, md5(v_public_code), v_public_code, 'referral', 'friend_invite',
    v_user_id, p_referral_code, true
  );

  return v_public_code;
end;
$function$;


create or replace function public.create_promotion_qr(
  p_campaign_id uuid,
  p_purpose text,
  p_venue_id uuid default null,
  p_hunt_id uuid default null,
  p_interaction_source_id uuid default null,
  p_source_name text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_code text := upper(replace(gen_random_uuid()::text, '-', ''));
  v_source_id uuid := p_interaction_source_id;
  v_source_type text;
  v_source_name text;
  v_location_id uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required to create promotion QR codes.';
  end if;

  if p_purpose not in ('vendor', 'mall', 'hunt_location', 'general') then
    raise exception 'Unsupported QR purpose. Use the friend-invite flow for friend_invite QR codes.';
  end if;

  if not exists (
    select 1 from public.campaigns c
    join public.movies m on m.id = c.movie_id and m.active = true
    where c.id = p_campaign_id and c.active = true
  ) then
    raise exception 'QR codes require an active campaign linked to an active movie.';
  end if;

  if p_purpose = 'hunt_location' and not exists (
    select 1 from public.missions m
    where m.id = p_hunt_id and m.campaign_id = p_campaign_id and m.is_active = true
  ) then
    raise exception 'A hunt-location QR must reference an active mission in the same campaign.';
  end if;

  if p_venue_id is not null then
    select l.id into v_location_id
    from public.locations l
    where l.campaign_id = p_campaign_id and l.venue_id = p_venue_id and l.is_active = true
    order by l.created_at
    limit 1;
  end if;

  if v_source_id is not null and not exists (
    select 1 from public.interaction_sources s
    where s.id = v_source_id and s.campaign_id = p_campaign_id and s.is_active = true
  ) then
    raise exception 'The interaction source must be active and belong to this movie campaign.';
  end if;

  if v_source_id is null then
    v_source_type := case when p_purpose in ('vendor', 'mall', 'hunt_location') then 'location' else 'generic' end;
    select coalesce(v.name, l.name, m.title, c.name)
    into v_source_name
    from public.campaigns c
    left join public.movies m on m.id = c.movie_id
    left join public.venues v on v.id = p_venue_id
    left join public.missions l on l.id = p_hunt_id
    where c.id = p_campaign_id;

    insert into public.interaction_sources(
      campaign_id, source_type, name, description, location_id, points, reward_entries, metadata
    )
    values (
      p_campaign_id,
      v_source_type,
      coalesce(nullif(trim(p_source_name), ''), v_source_name, 'Movie promotion'),
      'Source created for a universal movie QR',
      v_location_id,
      10,
      0,
      jsonb_build_object('qr_purpose', p_purpose, 'venue_id', p_venue_id, 'hunt_id', p_hunt_id)
    )
    returning id into v_source_id;
  end if;

  insert into public.qr_codes(
    campaign_id, interaction_source_id, code_hash, public_code, qr_type, purpose, venue_id, hunt_id, is_active
  )
  values (
    p_campaign_id, v_source_id, md5(v_code), v_code, p_purpose, p_purpose, p_venue_id, p_hunt_id, true
  );

  return v_code;
end;
$function$;

revoke all on function public.create_promotion_qr(uuid, text, uuid, uuid, uuid, text) from anon, public;
grant execute on function public.create_promotion_qr(uuid, text, uuid, uuid, uuid, text) to authenticated;

revoke all on function public.resolve_public_qr(text) from public;
grant execute on function public.resolve_public_qr(text) to anon, authenticated;
revoke all on function public.record_qr_landing_event(text, text, uuid) from public;
grant execute on function public.record_qr_landing_event(text, text, uuid) to anon, authenticated;
revoke all on function public.create_friend_invite_qr(uuid, text) from anon, public;
grant execute on function public.create_friend_invite_qr(uuid, text) to authenticated;
