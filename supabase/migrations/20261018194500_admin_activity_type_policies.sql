-- Allow administrators to maintain the activity category registry.
-- Keep read access as-is; writes remain protected by the database-side is_admin() check.
alter table public.activity_event_types enable row level security;

drop policy if exists activity_event_types_admin_insert on public.activity_event_types;
create policy activity_event_types_admin_insert
  on public.activity_event_types
  for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists activity_event_types_admin_update on public.activity_event_types;
create policy activity_event_types_admin_update
  on public.activity_event_types
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
