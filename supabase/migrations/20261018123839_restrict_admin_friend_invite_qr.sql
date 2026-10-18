-- Restrict admin-created friend-invite QR creation to authenticated callers.
-- The function also checks public.is_admin() internally.
revoke all on function public.admin_create_friend_invite_qr(uuid, uuid, text) from anon, public;
grant execute on function public.admin_create_friend_invite_qr(uuid, uuid, text) to authenticated;
