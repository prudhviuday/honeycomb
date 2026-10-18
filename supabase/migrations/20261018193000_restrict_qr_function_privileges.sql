-- Restrict privileged QR creation functions explicitly because Supabase default
-- privileges can grant EXECUTE to anon on newly-created functions.
revoke all on function public.enforce_movie_for_qr() from anon, authenticated, public;
revoke all on function public.create_friend_invite_qr(uuid, text) from anon, public;
grant execute on function public.create_friend_invite_qr(uuid, text) to authenticated;
revoke all on function public.create_promotion_qr(uuid, text, uuid, uuid, uuid, text) from anon, public;
grant execute on function public.create_promotion_qr(uuid, text, uuid, uuid, uuid, text) to authenticated;
revoke all on function public.admin_create_friend_invite_qr(uuid, uuid, text) from anon, public;
grant execute on function public.admin_create_friend_invite_qr(uuid, uuid, text) to authenticated;

create index if not exists qr_codes_venue_id_idx on public.qr_codes(venue_id);
create index if not exists qr_codes_inviter_user_id_idx on public.qr_codes(inviter_user_id);
create index if not exists qr_codes_hunt_id_idx on public.qr_codes(hunt_id);
create index if not exists qr_landing_events_user_id_idx on public.qr_landing_events(user_id);
