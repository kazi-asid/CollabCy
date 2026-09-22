-- CollabCy social accounts + safe public creator directory.
-- Apply this in the Supabase SQL editor. Does not alter profiles or campaigns.

create or replace function public.current_user_is_brand()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and role = 'brand'
  );
$$;

revoke all on function public.current_user_is_brand() from public, anon;
grant execute on function public.current_user_is_brand() to authenticated;

create or replace function public.creator_is_publicly_listed(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = target_user_id
      and role = 'creator'
  );
$$;

revoke all on function public.creator_is_publicly_listed(uuid) from public, anon;
grant execute on function public.creator_is_publicly_listed(uuid) to authenticated;

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  handle text not null default '',
  url text not null default '',
  followers integer not null default 0,
  impressions integer not null default 0,
  engagement numeric not null default 0,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

create index if not exists social_accounts_user_id_idx on public.social_accounts (user_id);

create or replace function public.set_social_accounts_updated_at()
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

drop trigger if exists social_accounts_set_updated_at on public.social_accounts;
create trigger social_accounts_set_updated_at
before update on public.social_accounts
for each row
execute procedure public.set_social_accounts_updated_at();

alter table public.social_accounts enable row level security;

drop policy if exists "social_accounts_select_own" on public.social_accounts;
create policy "social_accounts_select_own"
  on public.social_accounts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "social_accounts_select_discoverable" on public.social_accounts;
create policy "social_accounts_select_discoverable"
  on public.social_accounts
  for select
  to authenticated
  using (
    public.current_user_is_brand()
    and public.creator_is_publicly_listed(social_accounts.user_id)
  );

drop policy if exists "social_accounts_insert_own" on public.social_accounts;
create policy "social_accounts_insert_own"
  on public.social_accounts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "social_accounts_update_own" on public.social_accounts;
create policy "social_accounts_update_own"
  on public.social_accounts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "social_accounts_delete_own" on public.social_accounts;
create policy "social_accounts_delete_own"
  on public.social_accounts
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.social_accounts from anon, public;
grant select, insert, update, delete on table public.social_accounts to authenticated;

-- Safe directory: no email, no auth metadata. Visible only to authenticated brands.
drop view if exists public.public_creators;
create view public.public_creators
with (security_invoker = false)
as
select
  p.user_id,
  p.role,
  p.name,
  p.bio,
  p.handle,
  p.website,
  p.niche,
  p.platforms,
  p.followers,
  p.impressions,
  p.rate,
  p.location,
  p.available,
  p.avatar,
  p.portfolio,
  p.created_at
from public.profiles p
where p.role = 'creator'
  and public.current_user_is_brand();

comment on view public.public_creators is
  'Brand-facing creator directory. Intentionally omits email and auth metadata.';

revoke all on public.public_creators from anon, public;
grant select on public.public_creators to authenticated;
