-- CollabCy campaigns: one row per brand-owned listing.
-- Apply this in the Supabase SQL editor or with the Supabase CLI.
-- Public/anon key only from the browser; RLS enforces ownership and published reads.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  brand_name text not null default '',
  title text not null default '',
  description text not null default '',
  category text not null default '',
  platform text not null default '',
  deliverable text not null default '',
  requirements text not null default '',
  budget integer not null default 0,
  max_budget integer not null default 0,
  color text not null default '#e8edff',
  letter text not null default 'orbit',
  featured boolean not null default false,
  days integer not null default 7,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  applications integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.set_campaigns_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at
before update on public.campaigns
for each row
execute procedure public.set_campaigns_updated_at();

alter table public.campaigns enable row level security;

drop policy if exists "campaigns_select_own" on public.campaigns;
create policy "campaigns_select_own"
  on public.campaigns
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "campaigns_select_published" on public.campaigns;
create policy "campaigns_select_published"
  on public.campaigns
  for select
  to authenticated
  using (
    status = 'active'
    and expires_at is not null
    and expires_at > now()
  );

drop policy if exists "campaigns_insert_own" on public.campaigns;
create policy "campaigns_insert_own"
  on public.campaigns
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "campaigns_update_own" on public.campaigns;
create policy "campaigns_update_own"
  on public.campaigns
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "campaigns_delete_own" on public.campaigns;
create policy "campaigns_delete_own"
  on public.campaigns
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.campaigns from anon, public;
grant select, insert, update, delete on table public.campaigns to authenticated;
