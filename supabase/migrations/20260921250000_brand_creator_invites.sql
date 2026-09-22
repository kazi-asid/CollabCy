-- Brand-initiated creator connection requests.
-- Creators still apply to campaigns; brands can invite a creator to one of their campaigns.
-- Accept still creates connection + conversation + deal through the existing architecture.

alter table public.campaign_applications
  add column if not exists initiated_by text not null default 'creator';

alter table public.campaign_applications
  drop constraint if exists campaign_applications_initiated_by_check;

alter table public.campaign_applications
  add constraint campaign_applications_initiated_by_check
  check (initiated_by in ('creator', 'brand'));

alter table public.campaign_applications
  drop constraint if exists campaign_applications_campaign_id_creator_id_key;

drop index if exists campaign_applications_open_pair_idx;
create unique index campaign_applications_open_pair_idx
  on public.campaign_applications (campaign_id, creator_id)
  where status in ('pending', 'accepted');

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'new_message',
    'application_received',
    'application_accepted',
    'application_rejected',
    'connection_created',
    'deal_submitted',
    'deal_revision_requested',
    'deal_completed',
    'deal_cancelled',
    'deal_brand_verified',
    'deal_platform_verified',
    'deal_platform_revision',
    'deal_needs_verification',
    'deal_disputed',
    'deal_dispute_resolved'
  ));

drop policy if exists "campaign_applications_insert_own" on public.campaign_applications;
create policy "campaign_applications_insert_own"
  on public.campaign_applications
  for insert
  to authenticated
  with check (
    auth.uid() = creator_id
    and initiated_by = 'creator'
    and public.campaign_is_open_for_applications(campaign_id)
  );

drop policy if exists "campaign_applications_update_creator" on public.campaign_applications;
create policy "campaign_applications_update_creator"
  on public.campaign_applications
  for update
  to authenticated
  using (auth.uid() = creator_id and status = 'pending')
  with check (
    auth.uid() = creator_id
    and (
      (initiated_by = 'creator' and status = 'withdrawn')
      or (initiated_by = 'brand' and status = 'rejected')
    )
  );

drop policy if exists "campaign_applications_update_brand" on public.campaign_applications;
create policy "campaign_applications_update_brand"
  on public.campaign_applications
  for update
  to authenticated
  using (public.brand_owns_campaign(campaign_id) and status = 'pending')
  with check (
    public.brand_owns_campaign(campaign_id)
    and (
      (initiated_by = 'creator' and status = 'rejected')
      or (initiated_by = 'brand' and status = 'withdrawn')
    )
  );

create or replace function public.notify_application_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  brand_id uuid;
  campaign_label text;
begin
  select user_id, coalesce(nullif(new.campaign_title, ''), title, 'a campaign')
    into brand_id, campaign_label
  from public.campaigns
  where id = new.campaign_id;

  if new.initiated_by = 'brand' then
    insert into public.notifications (user_id, type, title, body)
    values (
      new.creator_id,
      'application_received',
      'New connection request',
      left(coalesce(nullif(new.campaign_brand, ''), 'A brand') || ' invited you to ' || coalesce(campaign_label, 'a campaign') || '.', 180)
    );
  elsif brand_id is not null then
    insert into public.notifications (user_id, type, title, body)
    values (
      brand_id,
      'application_received',
      'New application',
      left(coalesce(nullif(new.creator_name, ''), 'A creator') || ' applied to ' || coalesce(campaign_label, 'your campaign') || '.', 180)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_applications_notify_insert on public.campaign_applications;
create trigger campaign_applications_notify_insert
after insert on public.campaign_applications
for each row
execute procedure public.notify_application_inserted();

create or replace function public.notify_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  brand_id uuid;
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status = 'rejected' then
    select user_id into brand_id from public.campaigns where id = new.campaign_id;
    if new.initiated_by = 'brand' then
      if brand_id is not null then
        insert into public.notifications (user_id, type, title, body)
        values (
          brand_id,
          'application_rejected',
          'Connection request declined',
          left(coalesce(nullif(new.creator_name, ''), 'A creator') || ' declined your request for ' || coalesce(nullif(new.campaign_title, ''), 'a campaign') || '.', 180)
        );
      end if;
    else
      insert into public.notifications (user_id, type, title, body)
      values (
        new.creator_id,
        'application_rejected',
        'Application declined',
        left('Your application for ' || coalesce(nullif(new.campaign_title, ''), 'a campaign') || ' was declined.', 180)
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.notify_connection_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  title text;
  initiated text;
begin
  select a.initiated_by,
         coalesce(nullif(a.campaign_title, ''), c.title, 'a campaign')
    into initiated, title
  from public.campaigns c
  left join public.campaign_applications a on a.id = new.application_id
  where c.id = new.campaign_id;

  if initiated = 'brand' then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, connection_id)
  values (
    new.brand_id,
    'connection_created',
    'New collaboration',
    left('You’re now connected on ' || coalesce(title, 'a campaign') || '.', 180),
    new.id
  );
  return new;
end;
$$;

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
  if p_creator_id is null or p_creator_id = auth.uid() then
    raise exception 'Choose a creator to connect with';
  end if;

  select * into camp from public.campaigns where id = p_campaign_id;
  if not found or camp.user_id is distinct from auth.uid() then
    raise exception 'Not allowed';
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

  if coalesce(app.initiated_by, 'creator') = 'brand' then
    if app.creator_id is distinct from auth.uid() then
      raise exception 'Not allowed';
    end if;
  else
    if camp.user_id is distinct from auth.uid() then
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
revoke all on function public.notify_application_inserted() from public, anon, authenticated;
revoke all on function public.notify_application_status() from public, anon, authenticated;
revoke all on function public.notify_connection_created() from public, anon, authenticated;
