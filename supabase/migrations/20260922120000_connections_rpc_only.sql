-- Connections may only be created by trusted SECURITY DEFINER RPCs
-- (accept_campaign_application / invite acceptance). Direct client inserts
-- bypassed the application lifecycle.

revoke insert on table public.connections from authenticated, anon, public;

drop policy if exists "connections_insert_brand" on public.connections;

revoke all on table public.connections from anon, public;
grant select, update on table public.connections to authenticated;
