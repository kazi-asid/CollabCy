-- CollabCy campaign applications and connections.
-- Apply this in the Supabase SQL editor. Does not alter existing table structures.

create or replace function public.brand_owns_campaign(target_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaigns
    where id = target_campaign_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.brand_owns_campaign(uuid) from public, anon;
grant execute on function public.brand_owns_campaign(uuid) to authenticated;

create or replace function public.campaign_is_open_for_applications(target_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaigns
    where id = target_campaign_id
      and status = 'active'
      and expires_at is not null
      and expires_at > now()
  );
$$;

revoke all on function public.campaign_is_open_for_applications(uuid) from public, anon;
grant execute on function public.campaign_is_open_for_applications(uuid) to authenticated;

create table if not exists public.campaign_applications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  creator_name text not null default '',
  creator_avatar text,
  creator_handle text not null default '',
  creator_rate integer not null default 0,
  creator_niche text not null default '',
  creator_followers integer not null default 0,
  creator_impressions integer not null default 0,
  campaign_title text not null default '',
  campaign_brand text not null default '',
  campaign_color text not null default '#e8edff',
  message text not null default '',
  proposed_rate integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, creator_id)
);

create index if not exists campaign_applications_campaign_id_idx on public.campaign_applications (campaign_id);
create index if not exists campaign_applications_creator_id_idx on public.campaign_applications (creator_id);
create index if not exists campaign_applications_status_idx on public.campaign_applications (status);

create or replace function public.set_campaign_applications_updated_at()
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

drop trigger if exists campaign_applications_set_updated_at on public.campaign_applications;
create trigger campaign_applications_set_updated_at
before update on public.campaign_applications
for each row
execute procedure public.set_campaign_applications_updated_at();

create or replace function public.snapshot_application_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  camp public.campaigns%rowtype;
begin
  select * into camp from public.campaigns where id = new.campaign_id;
  if found then
    new.campaign_title := coalesce(camp.title, '');
    new.campaign_brand := coalesce(camp.brand_name, '');
    new.campaign_color := coalesce(nullif(camp.color, ''), '#e8edff');
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_applications_snapshot_campaign on public.campaign_applications;
create trigger campaign_applications_snapshot_campaign
before insert on public.campaign_applications
for each row
execute procedure public.snapshot_application_campaign();

create or replace function public.protect_campaign_application_ownership()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.campaign_id is distinct from old.campaign_id
     or new.creator_id is distinct from old.creator_id then
    raise exception 'Application ownership cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_applications_protect_ownership on public.campaign_applications;
create trigger campaign_applications_protect_ownership
before update on public.campaign_applications
for each row
execute procedure public.protect_campaign_application_ownership();

alter table public.campaign_applications enable row level security;

drop policy if exists "campaign_applications_select_own" on public.campaign_applications;
create policy "campaign_applications_select_own"
  on public.campaign_applications
  for select
  to authenticated
  using (auth.uid() = creator_id);

drop policy if exists "campaign_applications_select_brand" on public.campaign_applications;
create policy "campaign_applications_select_brand"
  on public.campaign_applications
  for select
  to authenticated
  using (public.brand_owns_campaign(campaign_id));

drop policy if exists "campaign_applications_insert_own" on public.campaign_applications;
create policy "campaign_applications_insert_own"
  on public.campaign_applications
  for insert
  to authenticated
  with check (
    auth.uid() = creator_id
    and public.campaign_is_open_for_applications(campaign_id)
  );

drop policy if exists "campaign_applications_update_creator" on public.campaign_applications;
create policy "campaign_applications_update_creator"
  on public.campaign_applications
  for update
  to authenticated
  using (auth.uid() = creator_id and status = 'pending')
  with check (auth.uid() = creator_id and status = 'withdrawn');

drop policy if exists "campaign_applications_update_brand" on public.campaign_applications;
create policy "campaign_applications_update_brand"
  on public.campaign_applications
  for update
  to authenticated
  using (public.brand_owns_campaign(campaign_id))
  with check (
    public.brand_owns_campaign(campaign_id)
    and status in ('pending', 'accepted', 'rejected')
  );

revoke all on table public.campaign_applications from anon, public;
grant select, insert, update on table public.campaign_applications to authenticated;

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  application_id uuid references public.campaign_applications (id) on delete set null,
  brand_id uuid not null references auth.users (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, creator_id)
);

create index if not exists connections_campaign_id_idx on public.connections (campaign_id);
create index if not exists connections_brand_id_idx on public.connections (brand_id);
create index if not exists connections_creator_id_idx on public.connections (creator_id);

create or replace function public.set_connections_updated_at()
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

drop trigger if exists connections_set_updated_at on public.connections;
create trigger connections_set_updated_at
before update on public.connections
for each row
execute procedure public.set_connections_updated_at();

create or replace function public.protect_connection_ownership()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.campaign_id is distinct from old.campaign_id
     or new.brand_id is distinct from old.brand_id
     or new.creator_id is distinct from old.creator_id then
    raise exception 'Connection ownership cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists connections_protect_ownership on public.connections;
create trigger connections_protect_ownership
before update on public.connections
for each row
execute procedure public.protect_connection_ownership();

alter table public.connections enable row level security;

drop policy if exists "connections_select_party" on public.connections;
create policy "connections_select_party"
  on public.connections
  for select
  to authenticated
  using (auth.uid() = brand_id or auth.uid() = creator_id);

drop policy if exists "connections_insert_brand" on public.connections;
create policy "connections_insert_brand"
  on public.connections
  for insert
  to authenticated
  with check (
    auth.uid() = brand_id
    and public.brand_owns_campaign(campaign_id)
  );

drop policy if exists "connections_update_party" on public.connections;
create policy "connections_update_party"
  on public.connections
  for update
  to authenticated
  using (auth.uid() = brand_id or auth.uid() = creator_id)
  with check (
    (auth.uid() = brand_id or auth.uid() = creator_id)
    and status in ('active', 'closed')
  );

revoke all on table public.connections from anon, public;
grant select, insert, update on table public.connections to authenticated;

-- Creators can still read campaigns they applied to after expiry.
drop policy if exists "campaigns_select_applicant" on public.campaigns;
create policy "campaigns_select_applicant"
  on public.campaigns
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.campaign_applications a
      where a.campaign_id = campaigns.id
        and a.creator_id = auth.uid()
    )
  );

create or replace function public.accept_campaign_application(application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.campaign_applications%rowtype;
  camp public.campaigns%rowtype;
  conn_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into app from public.campaign_applications where id = application_id;
  if not found then
    raise exception 'Application not found';
  end if;

  select * into camp from public.campaigns where id = app.campaign_id;
  if not found or camp.user_id is distinct from auth.uid() then
    raise exception 'Not allowed';
  end if;

  if app.status is distinct from 'pending' then
    raise exception 'Application is not pending';
  end if;

  update public.campaign_applications
  set status = 'accepted'
  where id = application_id
    and status = 'pending';

  if not found then
    raise exception 'Application is not pending';
  end if;

  insert into public.connections (campaign_id, application_id, brand_id, creator_id, status)
  values (app.campaign_id, app.id, camp.user_id, app.creator_id, 'active')
  on conflict (campaign_id, creator_id) do nothing;

  select id into conn_id
  from public.connections
  where campaign_id = app.campaign_id
    and creator_id = app.creator_id;

  return conn_id;
end;
$$;

revoke all on function public.accept_campaign_application(uuid) from public, anon;
grant execute on function public.accept_campaign_application(uuid) to authenticated;
