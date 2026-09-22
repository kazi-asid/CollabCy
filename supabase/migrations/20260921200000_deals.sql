-- CollabCy collaboration deals: lifecycle after an accepted campaign connection.
-- Apply after 20260921140000_messaging_notifications.sql.
-- Does not move money. Does not alter Attention Marketplace tables.

-- Allow deal lifecycle notification types.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'new_message',
    'application_accepted',
    'application_rejected',
    'connection_created',
    'deal_submitted',
    'deal_revision_requested',
    'deal_completed',
    'deal_cancelled'
  ));

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique references public.connections (id) on delete restrict,
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  creator_id uuid not null references auth.users (id) on delete cascade,
  brand_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'submitted', 'revision_requested', 'completed', 'cancelled')),
  deliverable text not null default '',
  requirements text not null default '',
  agreed_budget integer not null default 0 check (agreed_budget >= 0),
  deadline timestamptz,
  creator_note text not null default '',
  brand_note text not null default '',
  submission_url text not null default '',
  submission_note text not null default '',
  revision_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists deals_brand_id_updated_idx on public.deals (brand_id, updated_at desc);
create index if not exists deals_creator_id_updated_idx on public.deals (creator_id, updated_at desc);
create index if not exists deals_campaign_id_idx on public.deals (campaign_id);
create index if not exists deals_status_idx on public.deals (status);

create or replace function public.set_deals_updated_at()
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

drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at
before update on public.deals
for each row
execute procedure public.set_deals_updated_at();

create or replace function public.protect_deal_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Deals can only be updated through the collaboration workflow';
  end if;
  if new.connection_id is distinct from old.connection_id
     or new.campaign_id is distinct from old.campaign_id
     or new.creator_id is distinct from old.creator_id
     or new.brand_id is distinct from old.brand_id then
    raise exception 'Deal ownership cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists deals_protect_fields on public.deals;
create trigger deals_protect_fields
before update on public.deals
for each row
execute procedure public.protect_deal_fields();

alter table public.deals enable row level security;
alter table public.deals replica identity full;

drop policy if exists "deals_select_party" on public.deals;
create policy "deals_select_party"
  on public.deals
  for select
  to authenticated
  using (auth.uid() = brand_id or auth.uid() = creator_id);

revoke all on table public.deals from anon, public;
grant select on table public.deals to authenticated;

create or replace function public.deal_clean_website(p_url text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := trim(coalesce(p_url, ''));
begin
  if v = '' then
    return '';
  end if;
  if char_length(v) > 2048 or v ~ '\s' or position('@' in v) > 0 then
    return null;
  end if;
  if v !~* '^https?://[^/\s]+' then
    return null;
  end if;
  return v;
end;
$$;

create or replace function public.deal_to_json(p public.deals)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'connection_id', p.connection_id,
    'campaign_id', p.campaign_id,
    'creator_id', p.creator_id,
    'brand_id', p.brand_id,
    'status', p.status,
    'deliverable', p.deliverable,
    'requirements', p.requirements,
    'agreed_budget', p.agreed_budget,
    'deadline', p.deadline,
    'creator_note', p.creator_note,
    'brand_note', p.brand_note,
    'submission_url', p.submission_url,
    'submission_note', p.submission_note,
    'revision_note', p.revision_note,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'started_at', p.started_at,
    'submitted_at', p.submitted_at,
    'completed_at', p.completed_at,
    'cancelled_at', p.cancelled_at
  );
$$;

create or replace function public.internal_notify_deal(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_connection_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation uuid;
begin
  if p_user_id is null or p_user_id = auth.uid() then
    return;
  end if;
  select id into v_conversation from public.conversations where connection_id = p_connection_id;
  insert into public.notifications (user_id, type, title, body, conversation_id, connection_id)
  values (p_user_id, p_type, p_title, left(p_body, 180), v_conversation, p_connection_id);
end;
$$;

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

create or replace function public.connections_after_insert_ensure_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.internal_ensure_deal(new.id);
  return new;
end;
$$;

drop trigger if exists connections_ensure_deal on public.connections;
create trigger connections_ensure_deal
after insert on public.connections
for each row
execute procedure public.connections_after_insert_ensure_deal();

create or replace function public.ensure_my_deals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  conn record;
  n integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  for conn in
    select id from public.connections
    where brand_id = auth.uid() or creator_id = auth.uid()
  loop
    if public.internal_ensure_deal(conn.id) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

create or replace function public.submit_deal(p_deal_id uuid, p_note text default '', p_url text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals;
  v_url text;
  v_note text := trim(coalesce(p_note, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_deal_id is null then
    raise exception 'Deal not found';
  end if;

  select * into d from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;
  if d.creator_id is distinct from auth.uid() then
    raise exception 'Not allowed';
  end if;
  if d.status not in ('active', 'revision_requested') then
    raise exception 'This deal cannot be submitted from its current status';
  end if;

  v_url := public.deal_clean_website(p_url);
  if p_url is not null and trim(p_url) <> '' and v_url is null then
    raise exception 'Enter a complete http or https delivery link.';
  end if;
  v_url := coalesce(v_url, '');
  if v_note = '' and v_url = '' then
    raise exception 'Add a submission note or a delivery link.';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'Keep the submission note under 2,000 characters.';
  end if;

  update public.deals
  set status = 'submitted',
      submission_note = v_note,
      submission_url = v_url,
      creator_note = v_note,
      submitted_at = now()
  where id = d.id
  returning * into d;

  perform public.internal_notify_deal(
    d.brand_id,
    'deal_submitted',
    'Work submitted',
    'Your creator submitted work for review.',
    d.connection_id
  );

  return public.deal_to_json(d);
end;
$$;

create or replace function public.request_deal_revision(p_deal_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals;
  v_note text := trim(coalesce(p_note, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_deal_id is null then
    raise exception 'Deal not found';
  end if;
  if v_note = '' or char_length(v_note) < 8 then
    raise exception 'Explain the revision you need.';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'Keep the revision note under 2,000 characters.';
  end if;

  select * into d from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;
  if d.brand_id is distinct from auth.uid() then
    raise exception 'Not allowed';
  end if;
  if d.status is distinct from 'submitted' then
    raise exception 'Revisions can only be requested on submitted work';
  end if;

  update public.deals
  set status = 'revision_requested',
      revision_note = v_note,
      brand_note = v_note
  where id = d.id
  returning * into d;

  perform public.internal_notify_deal(
    d.creator_id,
    'deal_revision_requested',
    'Revision requested',
    'The brand asked for changes on your submission.',
    d.connection_id
  );

  return public.deal_to_json(d);
end;
$$;

create or replace function public.complete_deal(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_deal_id is null then
    raise exception 'Deal not found';
  end if;

  select * into d from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;
  if d.brand_id is distinct from auth.uid() then
    raise exception 'Not allowed';
  end if;
  if d.status is distinct from 'submitted' then
    raise exception 'Only submitted work can be approved';
  end if;

  update public.deals
  set status = 'completed',
      completed_at = now()
  where id = d.id
  returning * into d;

  perform public.internal_notify_deal(
    d.creator_id,
    'deal_completed',
    'Collaboration completed',
    'The brand approved your work. This collaboration is complete.',
    d.connection_id
  );

  return public.deal_to_json(d);
end;
$$;

create or replace function public.cancel_deal(p_deal_id uuid, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals;
  v_note text := trim(coalesce(p_note, ''));
  v_other uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_deal_id is null then
    raise exception 'Deal not found';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'Keep the cancellation note under 2,000 characters.';
  end if;

  select * into d from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;
  if auth.uid() is distinct from d.brand_id and auth.uid() is distinct from d.creator_id then
    raise exception 'Not allowed';
  end if;
  if d.status not in ('active', 'submitted', 'revision_requested') then
    raise exception 'This deal can no longer be cancelled';
  end if;

  update public.deals
  set status = 'cancelled',
      cancelled_at = now(),
      brand_note = case when auth.uid() = d.brand_id and v_note <> '' then v_note else d.brand_note end,
      creator_note = case when auth.uid() = d.creator_id and v_note <> '' then v_note else d.creator_note end
  where id = d.id
  returning * into d;

  v_other := case when auth.uid() = d.brand_id then d.creator_id else d.brand_id end;
  perform public.internal_notify_deal(
    v_other,
    'deal_cancelled',
    'Collaboration cancelled',
    'The other participant cancelled this collaboration.',
    d.connection_id
  );

  return public.deal_to_json(d);
end;
$$;

-- Existing accepted connections get a deal without duplicates.
insert into public.deals (
  connection_id, campaign_id, creator_id, brand_id, status,
  deliverable, requirements, agreed_budget, deadline,
  started_at, created_at, updated_at
)
select
  n.id,
  n.campaign_id,
  n.creator_id,
  n.brand_id,
  'active',
  coalesce(nullif(c.deliverable, ''), ''),
  coalesce(nullif(c.requirements, ''), coalesce(a.message, '')),
  greatest(coalesce(a.proposed_rate, 0), coalesce(c.budget, 0), 0),
  c.expires_at,
  coalesce(n.created_at, now()),
  now(),
  now()
from public.connections n
left join public.campaigns c on c.id = n.campaign_id
left join public.campaign_applications a on a.id = n.application_id
on conflict (connection_id) do nothing;

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

  if conn_id is not null then
    perform public.internal_ensure_conversation(conn_id);
    perform public.internal_ensure_deal(conn_id);
    insert into public.notifications (user_id, type, title, body, conversation_id, connection_id)
    select
      app.creator_id,
      'application_accepted',
      'Application accepted',
      left('Your application for ' || coalesce(nullif(app.campaign_title, ''), 'a campaign') || ' was accepted.', 180),
      c.id,
      conn_id
    from public.conversations c
    where c.connection_id = conn_id;
  end if;

  return conn_id;
end;
$$;

revoke all on function public.deal_clean_website(text) from public, anon, authenticated;
revoke all on function public.deal_to_json(public.deals) from public, anon, authenticated;
revoke all on function public.internal_notify_deal(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.internal_ensure_deal(uuid) from public, anon, authenticated;
revoke all on function public.connections_after_insert_ensure_deal() from public, anon, authenticated;
revoke all on function public.set_deals_updated_at() from public, anon, authenticated;
revoke all on function public.protect_deal_fields() from public, anon, authenticated;

revoke all on function public.ensure_my_deals() from public, anon;
grant execute on function public.ensure_my_deals() to authenticated;
revoke all on function public.submit_deal(uuid, text, text) from public, anon;
grant execute on function public.submit_deal(uuid, text, text) to authenticated;
revoke all on function public.request_deal_revision(uuid, text) from public, anon;
grant execute on function public.request_deal_revision(uuid, text) to authenticated;
revoke all on function public.complete_deal(uuid) from public, anon;
grant execute on function public.complete_deal(uuid) to authenticated;
revoke all on function public.cancel_deal(uuid, text) from public, anon;
grant execute on function public.cancel_deal(uuid, text) to authenticated;
revoke all on function public.accept_campaign_application(uuid) from public, anon;
grant execute on function public.accept_campaign_application(uuid) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.deals;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
