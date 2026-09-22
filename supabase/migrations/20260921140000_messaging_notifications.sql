-- CollabCy conversations, messages, and notifications.
-- Apply this in the Supabase SQL editor. Does not drop existing tables.
-- Conversations are created atomically when an application is accepted.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique references public.connections (id) on delete restrict,
  brand_id uuid not null references auth.users (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  campaign_title text not null default '',
  campaign_brand text not null default '',
  campaign_color text not null default '#e8edff',
  creator_name text not null default '',
  creator_handle text not null default '',
  creator_avatar text,
  brand_name text not null default '',
  last_message_at timestamptz,
  last_message_body text not null default '',
  last_message_sender_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_brand_id_idx on public.conversations (brand_id);
create index if not exists conversations_creator_id_idx on public.conversations (creator_id);
create index if not exists conversations_campaign_id_idx on public.conversations (campaign_id);
create index if not exists conversations_last_message_at_idx on public.conversations (last_message_at desc nulls last);

create or replace function public.set_conversations_updated_at()
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

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
before update on public.conversations
for each row
execute procedure public.set_conversations_updated_at();

create or replace function public.protect_conversation_ownership()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.connection_id is distinct from old.connection_id
     or new.brand_id is distinct from old.brand_id
     or new.creator_id is distinct from old.creator_id
     or new.campaign_id is distinct from old.campaign_id then
    raise exception 'Conversation ownership cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_protect_ownership on public.conversations;
create trigger conversations_protect_ownership
before update on public.conversations
for each row
execute procedure public.protect_conversation_ownership();

alter table public.conversations enable row level security;

drop policy if exists "conversations_select_party" on public.conversations;
create policy "conversations_select_party"
  on public.conversations
  for select
  to authenticated
  using (auth.uid() = brand_id or auth.uid() = creator_id);

revoke all on table public.conversations from anon, public;
grant select on table public.conversations to authenticated;

create or replace function public.is_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations
    where id = target_conversation_id
      and (brand_id = auth.uid() or creator_id = auth.uid())
  );
$$;

create or replace function public.conversation_accepts_messages(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    join public.connections n on n.id = c.connection_id
    where c.id = target_conversation_id
      and (c.brand_id = auth.uid() or c.creator_id = auth.uid())
      and n.status = 'active'
  );
$$;

revoke all on function public.is_conversation_participant(uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated;
revoke all on function public.conversation_accepts_messages(uuid) from public, anon;
grant execute on function public.conversation_accepts_messages(uuid) to authenticated;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 3000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);
create index if not exists messages_unread_idx on public.messages (conversation_id, sender_id) where read_at is null;

create or replace function public.prepare_message()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.body := trim(new.body);
  if new.body = '' or char_length(new.body) > 3000 then
    raise exception 'Invalid message';
  end if;
  if new.sender_id is distinct from auth.uid() then
    raise exception 'Not allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_prepare on public.messages;
create trigger messages_prepare
before insert on public.messages
for each row
execute procedure public.prepare_message();

create or replace function public.protect_message_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at then
    raise exception 'Messages cannot be edited';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_protect_immutable on public.messages;
create trigger messages_protect_immutable
before update on public.messages
for each row
execute procedure public.protect_message_immutability();

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set
    last_message_at = new.created_at,
    last_message_body = left(new.body, 180),
    last_message_sender_id = new.sender_id,
    updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row
execute procedure public.touch_conversation_on_message();

alter table public.messages enable row level security;
alter table public.messages replica identity full;

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages
  for select
  to authenticated
  using (public.is_conversation_participant(conversation_id));

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages
  for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.conversation_accepts_messages(conversation_id)
  );

drop policy if exists "messages_update_read" on public.messages;
create policy "messages_update_read"
  on public.messages
  for update
  to authenticated
  using (public.is_conversation_participant(conversation_id))
  with check (public.is_conversation_participant(conversation_id));

revoke all on table public.messages from anon, public;
grant select, insert, update on table public.messages to authenticated;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('new_message', 'application_accepted', 'application_rejected', 'connection_created')),
  title text not null,
  body text not null,
  conversation_id uuid references public.conversations (id) on delete cascade,
  connection_id uuid references public.connections (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_id_unread_idx on public.notifications (user_id) where read = false;

create or replace function public.protect_notification_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.type is distinct from old.type
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.conversation_id is distinct from old.conversation_id
     or new.connection_id is distinct from old.connection_id
     or new.message_id is distinct from old.message_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Notifications cannot be edited';
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_protect_fields on public.notifications;
create trigger notifications_protect_fields
before update on public.notifications
for each row
execute procedure public.protect_notification_fields();

alter table public.notifications enable row level security;
alter table public.notifications replica identity full;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.notifications from anon, public;
grant select, update on table public.notifications to authenticated;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
  recipient uuid;
  sender_label text;
begin
  select * into conv from public.conversations where id = new.conversation_id;
  if not found then
    return new;
  end if;
  if new.sender_id = conv.brand_id then
    recipient := conv.creator_id;
    sender_label := coalesce(nullif(conv.brand_name, ''), 'Brand');
  else
    recipient := conv.brand_id;
    sender_label := coalesce(nullif(conv.creator_name, ''), 'Creator');
  end if;
  if recipient is null or recipient = new.sender_id then
    return new;
  end if;
  insert into public.notifications (
    user_id, type, title, body, conversation_id, connection_id, message_id
  ) values (
    recipient,
    'new_message',
    'New message',
    left(sender_label || ': ' || new.body, 180),
    conv.id,
    conv.connection_id,
    new.id
  );
  return new;
end;
$$;

drop trigger if exists messages_notify_recipient on public.messages;
create trigger messages_notify_recipient
after insert on public.messages
for each row
execute procedure public.notify_new_message();

create or replace function public.notify_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status = 'rejected' then
    insert into public.notifications (user_id, type, title, body)
    values (
      new.creator_id,
      'application_rejected',
      'Application declined',
      left('Your application for ' || coalesce(nullif(new.campaign_title, ''), 'a campaign') || ' was declined.', 180)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_applications_notify_status on public.campaign_applications;
create trigger campaign_applications_notify_status
after update of status on public.campaign_applications
for each row
execute procedure public.notify_application_status();

create or replace function public.notify_connection_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  title text;
  brand_label text;
begin
  select coalesce(nullif(a.campaign_title, ''), c.title, 'a campaign'),
         coalesce(nullif(a.campaign_brand, ''), c.brand_name, 'your campaign')
    into title, brand_label
  from public.campaigns c
  left join public.campaign_applications a on a.id = new.application_id
  where c.id = new.campaign_id;

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

drop trigger if exists connections_notify_created on public.connections;
create trigger connections_notify_created
after insert on public.connections
for each row
execute procedure public.notify_connection_created();

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
  return public.internal_ensure_conversation(conn.id);
end;
$$;

revoke all on function public.ensure_conversation(uuid) from public, anon;
grant execute on function public.ensure_conversation(uuid) to authenticated;

create or replace function public.sync_my_conversations()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conn record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  for conn in
    select id
    from public.connections
    where brand_id = auth.uid() or creator_id = auth.uid()
  loop
    perform public.internal_ensure_conversation(conn.id);
  end loop;
end;
$$;

revoke all on function public.sync_my_conversations() from public, anon;
grant execute on function public.sync_my_conversations() to authenticated;

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

revoke all on function public.accept_campaign_application(uuid) from public, anon;
grant execute on function public.accept_campaign_application(uuid) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.conversations;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
