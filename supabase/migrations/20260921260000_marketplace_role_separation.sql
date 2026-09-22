-- One auth identity = one marketplace role.
-- Brand ↔ Creator connections only.
-- Does not delete existing profiles, campaigns, connections, conversations, or deals.

create or replace function public.profile_has_role(target_user_id uuid, expected_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select expected_role in ('brand', 'creator')
     and target_user_id is not null
     and exists (
       select 1
       from public.profiles
       where user_id = target_user_id
         and role = expected_role
     );
$$;

create or replace function public.current_user_is_creator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.profile_has_role(auth.uid(), 'creator');
$$;

create or replace function public.current_user_is_brand()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.profile_has_role(auth.uid(), 'brand');
$$;

revoke all on function public.profile_has_role(uuid, text) from public, anon;
grant execute on function public.profile_has_role(uuid, text) to authenticated;
revoke all on function public.current_user_is_creator() from public, anon;
grant execute on function public.current_user_is_creator() to authenticated;
revoke all on function public.current_user_is_brand() from public, anon;
grant execute on function public.current_user_is_brand() to authenticated;

create table if not exists public.marketplace_role_audit (
  generated_at timestamptz primary key default now(),
  dual_role_user_count integer not null,
  unique_index_applied boolean not null,
  details jsonb not null default '[]'::jsonb
);

alter table public.marketplace_role_audit enable row level security;
revoke all on table public.marketplace_role_audit from anon, public, authenticated;

insert into public.marketplace_role_audit (dual_role_user_count, unique_index_applied, details)
select
  (select count(*) from (
    select user_id from public.profiles group by user_id having count(distinct role) > 1
  ) dual_users),
  false,
  coalesce((
    select jsonb_agg(to_jsonb(report) order by report.user_id)
    from (
      select
        p.user_id,
        array_agg(p.role order by p.created_at, p.role) as roles,
        (select count(*) from public.campaigns c where c.user_id = p.user_id) as campaigns,
        (select count(*) from public.connections n where n.brand_id = p.user_id) as connections_as_brand,
        (select count(*) from public.connections n where n.creator_id = p.user_id) as connections_as_creator,
        (select count(*) from public.campaign_applications a where a.creator_id = p.user_id) as applications_as_creator,
        (select count(*) from public.deals d where d.brand_id = p.user_id) as deals_as_brand,
        (select count(*) from public.deals d where d.creator_id = p.user_id) as deals_as_creator
      from public.profiles p
      group by p.user_id
      having count(distinct p.role) > 1
    ) report
  ), '[]'::jsonb);

create or replace function public.prevent_second_marketplace_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_role text;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Profile ownership cannot be changed';
    end if;
    if new.role is distinct from old.role then
      if old.role = 'brand' then
        raise exception 'This email is already registered as a Brand account';
      end if;
      raise exception 'This email is already registered as a Creator account';
    end if;
    return new;
  end if;

  select role
    into existing_role
  from public.profiles
  where user_id = new.user_id
    and role is distinct from new.role
  order by created_at asc, role asc
  limit 1;

  -- Allow upserts of an already-existing role, including grandfathered dual-role users.
  if exists (
    select 1
    from public.profiles
    where user_id = new.user_id
      and role = new.role
  ) then
    return new;
  end if;

  if existing_role = 'brand' then
    raise exception 'This email is already registered as a Brand account';
  end if;
  if existing_role = 'creator' then
    raise exception 'This email is already registered as a Creator account';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_one_marketplace_role on public.profiles;
create trigger profiles_one_marketplace_role
before insert or update on public.profiles
for each row
execute procedure public.prevent_second_marketplace_role();

revoke all on function public.prevent_second_marketplace_role() from public, anon, authenticated;

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      exists (
        select 1
        from public.profiles existing
        where existing.user_id = auth.uid()
          and existing.role = role
      )
      or not exists (
        select 1
        from public.profiles existing
        where existing.user_id = auth.uid()
          and existing.role is distinct from role
      )
    )
  );

do $$
declare
  dual_count integer;
begin
  select count(*) into dual_count
  from (
    select user_id
    from public.profiles
    group by user_id
    having count(distinct role) > 1
  ) dual_users;

  if dual_count = 0 then
    execute 'create unique index if not exists profiles_one_identity_idx on public.profiles (user_id)';
    update public.marketplace_role_audit
      set unique_index_applied = true
      where generated_at = (select max(generated_at) from public.marketplace_role_audit);
  end if;
end $$;

create or replace function public.enforce_brand_creator_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id from public.campaigns where id = new.campaign_id;
  if owner_id is null then
    raise exception 'Not allowed';
  end if;
  if new.creator_id = owner_id then
    raise exception 'Connections must be between a Brand and a Creator';
  end if;
  if not public.profile_has_role(owner_id, 'brand') then
    raise exception 'Creator to Creator connections are not allowed';
  end if;
  if not public.profile_has_role(new.creator_id, 'creator') then
    raise exception 'Brand to Brand connections are not allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_applications_brand_creator_only on public.campaign_applications;
create trigger campaign_applications_brand_creator_only
before insert on public.campaign_applications
for each row
execute procedure public.enforce_brand_creator_application();

revoke all on function public.enforce_brand_creator_application() from public, anon, authenticated;

drop policy if exists "campaign_applications_insert_own" on public.campaign_applications;
create policy "campaign_applications_insert_own"
  on public.campaign_applications
  for insert
  to authenticated
  with check (
    auth.uid() = creator_id
    and initiated_by = 'creator'
    and public.current_user_is_creator()
    and public.campaign_is_open_for_applications(campaign_id)
    and not public.brand_owns_campaign(campaign_id)
  );

create or replace function public.enforce_brand_creator_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.brand_id = new.creator_id then
    raise exception 'Connections must be between a Brand and a Creator';
  end if;
  if not public.profile_has_role(new.brand_id, 'brand') then
    raise exception 'Creator to Creator connections are not allowed';
  end if;
  if not public.profile_has_role(new.creator_id, 'creator') then
    raise exception 'Brand to Brand connections are not allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists connections_brand_creator_only on public.connections;
create trigger connections_brand_creator_only
before insert on public.connections
for each row
execute procedure public.enforce_brand_creator_connection();

revoke all on function public.enforce_brand_creator_connection() from public, anon, authenticated;

create or replace function public.enforce_brand_creator_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.brand_id = new.creator_id then
    raise exception 'Connections must be between a Brand and a Creator';
  end if;
  if not public.profile_has_role(new.brand_id, 'brand')
     or not public.profile_has_role(new.creator_id, 'creator') then
    raise exception 'Connections must be between a Brand and a Creator';
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_brand_creator_only on public.conversations;
create trigger conversations_brand_creator_only
before insert on public.conversations
for each row
execute procedure public.enforce_brand_creator_conversation();

revoke all on function public.enforce_brand_creator_conversation() from public, anon, authenticated;

create or replace function public.enforce_brand_creator_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.brand_id = new.creator_id then
    raise exception 'Connections must be between a Brand and a Creator';
  end if;
  if not public.profile_has_role(new.brand_id, 'brand')
     or not public.profile_has_role(new.creator_id, 'creator') then
    raise exception 'Connections must be between a Brand and a Creator';
  end if;
  return new;
end;
$$;

drop trigger if exists deals_brand_creator_only on public.deals;
create trigger deals_brand_creator_only
before insert on public.deals
for each row
execute procedure public.enforce_brand_creator_deal();

revoke all on function public.enforce_brand_creator_deal() from public, anon, authenticated;

drop policy if exists "connections_insert_brand" on public.connections;
create policy "connections_insert_brand"
  on public.connections
  for insert
  to authenticated
  with check (
    auth.uid() = brand_id
    and brand_id is distinct from creator_id
    and public.current_user_is_brand()
    and public.profile_has_role(creator_id, 'creator')
    and public.brand_owns_campaign(campaign_id)
  );

create or replace function public.internal_ensure_conversation(target_connection_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conn public.connections%rowtype;
  app public.campaign_applications%rowtype;
  camp public.campaigns%rowtype;
  conv_id uuid;
  v_creator_name text := '';
  v_creator_handle text := '';
  v_creator_avatar text;
  v_campaign_title text := '';
  v_campaign_brand text := '';
  v_campaign_color text := '#e8edff';
begin
  select * into conn from public.connections where id = target_connection_id;
  if not found then
    raise exception 'Connection not found';
  end if;

  select id into conv_id from public.conversations where connection_id = conn.id;
  if conv_id is not null then
    return conv_id;
  end if;

  if conn.brand_id = conn.creator_id
     or not public.profile_has_role(conn.brand_id, 'brand')
     or not public.profile_has_role(conn.creator_id, 'creator') then
    return null;
  end if;

  if conn.application_id is not null then
    select * into app from public.campaign_applications where id = conn.application_id;
  end if;
  select * into camp from public.campaigns where id = conn.campaign_id;

  v_creator_name := coalesce(app.creator_name, '');
  v_creator_handle := coalesce(app.creator_handle, '');
  v_creator_avatar := app.creator_avatar;
  v_campaign_title := coalesce(nullif(app.campaign_title, ''), camp.title, '');
  v_campaign_brand := coalesce(nullif(app.campaign_brand, ''), camp.brand_name, '');
  v_campaign_color := coalesce(nullif(app.campaign_color, ''), camp.color, '#e8edff');

  if v_creator_name = '' then
    select p.name, p.handle, p.avatar
      into v_creator_name, v_creator_handle, v_creator_avatar
    from public.profiles p
    where p.user_id = conn.creator_id
      and p.role = 'creator';
  end if;

  insert into public.conversations (
    connection_id, brand_id, creator_id, campaign_id,
    campaign_title, campaign_brand, campaign_color,
    creator_name, creator_handle, creator_avatar, brand_name
  ) values (
    conn.id, conn.brand_id, conn.creator_id, conn.campaign_id,
    v_campaign_title, v_campaign_brand, v_campaign_color,
    coalesce(v_creator_name, ''), coalesce(v_creator_handle, ''), v_creator_avatar,
    v_campaign_brand
  )
  on conflict (connection_id) do nothing
  returning id into conv_id;

  if conv_id is null then
    select id into conv_id from public.conversations where connection_id = conn.id;
  end if;

  return conv_id;
end;
$$;

revoke all on function public.internal_ensure_conversation(uuid) from public, anon, authenticated;

create or replace function public.ensure_conversation(target_connection_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conn public.connections%rowtype;
  conv_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into conn from public.connections where id = target_connection_id;
  if not found then
    raise exception 'Connection not found';
  end if;
  if auth.uid() is distinct from conn.brand_id
     and auth.uid() is distinct from conn.creator_id then
    raise exception 'Not allowed';
  end if;
  conv_id := public.internal_ensure_conversation(conn.id);
  if conv_id is null then
    raise exception 'Connections must be between a Brand and a Creator';
  end if;
  return conv_id;
end;
$$;

revoke all on function public.ensure_conversation(uuid) from public, anon;
grant execute on function public.ensure_conversation(uuid) to authenticated;

create or replace function public.internal_ensure_deal(p_connection_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conn public.connections%rowtype;
  camp public.campaigns%rowtype;
  app public.campaign_applications%rowtype;
  v_id uuid;
  v_now timestamptz := now();
begin
  if p_connection_id is null then
    return null;
  end if;

  select id into v_id from public.deals where connection_id = p_connection_id;
  if v_id is not null then
    return v_id;
  end if;

  select * into conn from public.connections where id = p_connection_id;
  if not found then
    return null;
  end if;

  if conn.brand_id = conn.creator_id
     or not public.profile_has_role(conn.brand_id, 'brand')
     or not public.profile_has_role(conn.creator_id, 'creator') then
    return null;
  end if;

  select * into camp from public.campaigns where id = conn.campaign_id;
  if conn.application_id is not null then
    select * into app from public.campaign_applications where id = conn.application_id;
  end if;

  insert into public.deals (
    connection_id, campaign_id, creator_id, brand_id, status,
    deliverable, requirements, agreed_budget, deadline,
    started_at, created_at, updated_at
  ) values (
    conn.id,
    conn.campaign_id,
    conn.creator_id,
    conn.brand_id,
    'active',
    coalesce(nullif(camp.deliverable, ''), ''),
    coalesce(nullif(camp.requirements, ''), coalesce(app.message, '')),
    greatest(coalesce(app.proposed_rate, 0), coalesce(camp.budget, 0), 0),
    camp.expires_at,
    v_now,
    v_now,
    v_now
  )
  on conflict (connection_id) do nothing;

  select id into v_id from public.deals where connection_id = p_connection_id;
  return v_id;
end;
$$;

revoke all on function public.internal_ensure_deal(uuid) from public, anon, authenticated;

drop policy if exists "campaigns_insert_own" on public.campaigns;
create policy "campaigns_insert_own"
  on public.campaigns
  for insert
  to authenticated
  with check (auth.uid() = user_id and public.current_user_is_brand());

create or replace function public.invite_creator_to_campaign(
  p_campaign_id uuid,
  p_creator_id uuid,
  p_message text,
  p_proposed_rate integer
)
returns public.campaign_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  camp public.campaigns%rowtype;
  creator public.profiles%rowtype;
  body text;
  rate integer;
  app public.campaign_applications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.current_user_is_brand() then
    raise exception 'Creator to Creator connections are not allowed';
  end if;
  if p_creator_id is null or p_creator_id = auth.uid() then
    raise exception 'Choose a creator to connect with';
  end if;
  if not public.profile_has_role(p_creator_id, 'creator') then
    raise exception 'Brand to Brand connections are not allowed';
  end if;

  select * into camp from public.campaigns where id = p_campaign_id;
  if not found or camp.user_id is distinct from auth.uid() then
    raise exception 'Not allowed';
  end if;
  if not public.profile_has_role(camp.user_id, 'brand') then
    raise exception 'Creator to Creator connections are not allowed';
  end if;

  select * into creator
  from public.profiles
  where user_id = p_creator_id
    and role = 'creator';
  if not found then
    raise exception 'Creator not found';
  end if;

  if exists (
    select 1 from public.connections
    where campaign_id = p_campaign_id
      and creator_id = p_creator_id
  ) then
    raise exception 'You are already connected with this creator on this campaign';
  end if;

  if exists (
    select 1 from public.campaign_applications
    where campaign_id = p_campaign_id
      and creator_id = p_creator_id
      and status in ('pending', 'accepted')
  ) then
    raise exception 'You already have a pending request with this creator';
  end if;

  body := trim(coalesce(p_message, ''));
  if char_length(body) < 15 or char_length(body) > 2000 then
    raise exception 'Write a short message before sending';
  end if;
  rate := coalesce(p_proposed_rate, 0);
  if rate < 1 or rate > 100000 then
    raise exception 'Enter a valid proposed rate';
  end if;

  insert into public.campaign_applications (
    campaign_id,
    creator_id,
    creator_name,
    creator_avatar,
    creator_handle,
    creator_rate,
    creator_niche,
    creator_followers,
    creator_impressions,
    campaign_title,
    campaign_brand,
    campaign_color,
    message,
    proposed_rate,
    status,
    initiated_by
  ) values (
    camp.id,
    creator.user_id,
    coalesce(creator.name, ''),
    creator.avatar,
    coalesce(creator.handle, ''),
    coalesce(creator.rate, 0),
    coalesce(creator.niche, ''),
    coalesce(creator.followers, 0),
    coalesce(creator.impressions, 0),
    coalesce(camp.title, ''),
    coalesce(camp.brand_name, ''),
    coalesce(nullif(camp.color, ''), '#e8edff'),
    body,
    rate,
    'pending',
    'brand'
  )
  returning * into app;

  return app;
end;
$$;

revoke all on function public.invite_creator_to_campaign(uuid, uuid, text, integer) from public, anon;
grant execute on function public.invite_creator_to_campaign(uuid, uuid, text, integer) to authenticated;

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
  recipient uuid;
  title text;
  body text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into app from public.campaign_applications where id = application_id;
  if not found then
    raise exception 'Application not found';
  end if;

  select * into camp from public.campaigns where id = app.campaign_id;
  if not found then
    raise exception 'Application not found';
  end if;

  if camp.user_id = app.creator_id
     or not public.profile_has_role(camp.user_id, 'brand')
     or not public.profile_has_role(app.creator_id, 'creator') then
    raise exception 'Connections must be between a Brand and a Creator';
  end if;

  if coalesce(app.initiated_by, 'creator') = 'brand' then
    if app.creator_id is distinct from auth.uid() then
      raise exception 'Not allowed';
    end if;
    if not public.current_user_is_creator() then
      raise exception 'Not allowed';
    end if;
  else
    if camp.user_id is distinct from auth.uid() then
      raise exception 'Not allowed';
    end if;
    if not public.current_user_is_brand() then
      raise exception 'Not allowed';
    end if;
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

  if conn_id is not null then
    perform public.internal_ensure_conversation(conn_id);
    perform public.internal_ensure_deal(conn_id);
    if coalesce(app.initiated_by, 'creator') = 'brand' then
      recipient := camp.user_id;
      title := 'Connection request accepted';
      body := left(coalesce(nullif(app.creator_name, ''), 'A creator') || ' accepted your request for ' || coalesce(nullif(app.campaign_title, ''), 'a campaign') || '.', 180);
    else
      recipient := app.creator_id;
      title := 'Application accepted';
      body := left('Your application for ' || coalesce(nullif(app.campaign_title, ''), 'a campaign') || ' was accepted.', 180);
    end if;
    insert into public.notifications (user_id, type, title, body, conversation_id, connection_id)
    select
      recipient,
      'application_accepted',
      title,
      body,
      c.id,
      conn_id
    from public.conversations c
    where c.connection_id = conn_id;
  end if;

  return conn_id;
end;
$$;

revoke all on function public.accept_campaign_application(uuid) from public, anon;
grant execute on function public.accept_campaign_application(uuid) to authenticated;
