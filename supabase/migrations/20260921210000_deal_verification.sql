-- Two-step verification + disputes for CollabCy deals.
-- Apply after 20260921200000_deals.sql. Does not move money.
-- Existing completed deals stay completed. Other statuses keep their meaning.

-- ---------------------------------------------------------------------------
-- Platform verifiers: server-side only. Clients cannot grant themselves admin.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_verifiers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);

alter table public.platform_verifiers enable row level security;

drop policy if exists "platform_verifiers_select_self" on public.platform_verifiers;
create policy "platform_verifiers_select_self"
  on public.platform_verifiers
  for select
  to authenticated
  using (auth.uid() = user_id and revoked_at is null);

revoke all on table public.platform_verifiers from anon, public, authenticated;
grant select on table public.platform_verifiers to authenticated;

create or replace function public.is_platform_verifier(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_verifiers
    where user_id = p_user_id
      and revoked_at is null
  );
$$;

revoke all on function public.is_platform_verifier(uuid) from public, anon;
grant execute on function public.is_platform_verifier(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Deal status + verification columns
-- ---------------------------------------------------------------------------
alter table public.deals drop constraint if exists deals_status_check;
alter table public.deals
  add constraint deals_status_check check (status in (
    'active',
    'submitted',
    'revision_requested',
    'brand_verified',
    'platform_review',
    'disputed',
    'completed',
    'cancelled'
  ));

alter table public.deals add column if not exists brand_verified_at timestamptz;
alter table public.deals add column if not exists brand_verified_by uuid references auth.users (id) on delete set null;
alter table public.deals add column if not exists brand_verification_note text not null default '';
alter table public.deals add column if not exists platform_verified_at timestamptz;
alter table public.deals add column if not exists platform_verified_by uuid references auth.users (id) on delete set null;
alter table public.deals add column if not exists platform_verification_note text not null default '';
alter table public.deals add column if not exists revision_requested_by uuid references auth.users (id) on delete set null;
alter table public.deals add column if not exists revision_requested_at timestamptz;

drop policy if exists "deals_select_party" on public.deals;
create policy "deals_select_party"
  on public.deals
  for select
  to authenticated
  using (
    auth.uid() = brand_id
    or auth.uid() = creator_id
    or (
      public.is_platform_verifier()
      and status in ('brand_verified', 'platform_review', 'disputed', 'completed')
    )
  );

-- ---------------------------------------------------------------------------
-- Submission history, verification events, disputes
-- ---------------------------------------------------------------------------
create table if not exists public.deal_submissions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  submitted_by uuid not null references auth.users (id) on delete cascade,
  note text not null default '',
  url text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists deal_submissions_deal_id_created_idx on public.deal_submissions (deal_id, created_at desc);

alter table public.deal_submissions enable row level security;
drop policy if exists "deal_submissions_select" on public.deal_submissions;
create policy "deal_submissions_select"
  on public.deal_submissions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id
        and (d.brand_id = auth.uid() or d.creator_id = auth.uid() or public.is_platform_verifier())
    )
  );
revoke all on table public.deal_submissions from anon, public;
grant select on table public.deal_submissions to authenticated;

create table if not exists public.deal_verification_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('creator', 'brand', 'platform')),
  action text not null,
  from_status text not null default '',
  to_status text not null default '',
  note text not null default '',
  visibility text not null default 'public' check (visibility in ('public', 'admin')),
  created_at timestamptz not null default now()
);

create index if not exists deal_verification_events_deal_id_created_idx on public.deal_verification_events (deal_id, created_at desc);

alter table public.deal_verification_events enable row level security;
drop policy if exists "deal_verification_events_select" on public.deal_verification_events;
create policy "deal_verification_events_select"
  on public.deal_verification_events
  for select
  to authenticated
  using (
    public.is_platform_verifier()
    or (
      visibility = 'public'
      and exists (
        select 1 from public.deals d
        where d.id = deal_id
          and (d.brand_id = auth.uid() or d.creator_id = auth.uid())
      )
    )
  );
revoke all on table public.deal_verification_events from anon, public;
grant select on table public.deal_verification_events to authenticated;

create table if not exists public.deal_disputes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  opened_by uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'under_review', 'resolved', 'dismissed')),
  resolution_note text not null default '',
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists deal_disputes_deal_id_created_idx on public.deal_disputes (deal_id, created_at desc);
create unique index if not exists deal_disputes_one_open_idx
  on public.deal_disputes (deal_id)
  where status in ('open', 'under_review');

alter table public.deal_disputes enable row level security;
drop policy if exists "deal_disputes_select" on public.deal_disputes;
create policy "deal_disputes_select"
  on public.deal_disputes
  for select
  to authenticated
  using (
    public.is_platform_verifier()
    or exists (
      select 1 from public.deals d
      where d.id = deal_id
        and (d.brand_id = auth.uid() or d.creator_id = auth.uid())
    )
  );
revoke all on table public.deal_disputes from anon, public;
grant select on table public.deal_disputes to authenticated;

alter table public.deal_submissions replica identity full;
alter table public.deal_verification_events replica identity full;
alter table public.deal_disputes replica identity full;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
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
    'deal_cancelled',
    'deal_brand_verified',
    'deal_platform_verified',
    'deal_platform_revision',
    'deal_needs_verification',
    'deal_disputed',
    'deal_dispute_resolved'
  ));

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
    'cancelled_at', p.cancelled_at,
    'brand_verified_at', p.brand_verified_at,
    'brand_verified_by', p.brand_verified_by,
    'brand_verification_note', p.brand_verification_note,
    'platform_verified_at', p.platform_verified_at,
    'platform_verified_by', p.platform_verified_by,
    'platform_verification_note', p.platform_verification_note,
    'revision_requested_by', p.revision_requested_by,
    'revision_requested_at', p.revision_requested_at
  );
$$;

create or replace function public.internal_record_deal_event(
  p_deal_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_action text,
  p_from text,
  p_to text,
  p_note text default '',
  p_visibility text default 'public'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.deal_verification_events (
    deal_id, actor_id, actor_role, action, from_status, to_status, note, visibility
  ) values (
    p_deal_id, p_actor_id, p_actor_role, p_action, p_from, p_to, left(coalesce(p_note, ''), 2000), coalesce(nullif(p_visibility, ''), 'public')
  );
end;
$$;

create or replace function public.internal_notify_platform(
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
  rec record;
begin
  for rec in
    select user_id from public.platform_verifiers
    where revoked_at is null
      and user_id is distinct from auth.uid()
  loop
    perform public.internal_notify_deal(rec.user_id, p_type, p_title, p_body, p_connection_id);
  end loop;
end;
$$;

create or replace function public.internal_open_deal_dispute(p_deal public.deals, p_reason text)
returns public.deal_disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deal_disputes;
begin
  select * into v
  from public.deal_disputes
  where deal_id = p_deal.id
    and status in ('open', 'under_review')
  for update;
  if found then
    raise exception 'This collaboration already has an open dispute';
  end if;

  insert into public.deal_disputes (deal_id, opened_by, reason, status)
  values (p_deal.id, auth.uid(), p_reason, 'open')
  returning * into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Existing RPCs: keep submit/revision/cancel; brand can no longer complete.
-- ---------------------------------------------------------------------------
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
  v_from text;
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

  v_from := d.status;
  insert into public.deal_submissions (deal_id, submitted_by, note, url)
  values (d.id, auth.uid(), v_note, v_url);

  update public.deals
  set status = 'submitted',
      submission_note = v_note,
      submission_url = v_url,
      creator_note = v_note,
      submitted_at = now()
  where id = d.id
  returning * into d;

  perform public.internal_record_deal_event(d.id, auth.uid(), 'creator', 'creator_submitted', v_from, d.status, v_note, 'public');
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
  v_from text;
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

  v_from := d.status;
  update public.deals
  set status = 'revision_requested',
      revision_note = v_note,
      brand_note = v_note,
      revision_requested_by = auth.uid(),
      revision_requested_at = now()
  where id = d.id
  returning * into d;

  perform public.internal_record_deal_event(d.id, auth.uid(), 'brand', 'brand_requested_revision', v_from, d.status, v_note, 'public');
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
begin
  raise exception 'Only CollabCy can complete a collaboration after platform verification';
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
  v_from text;
  v_role text;
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

  v_from := d.status;
  v_role := case when auth.uid() = d.brand_id then 'brand' else 'creator' end;
  update public.deals
  set status = 'cancelled',
      cancelled_at = now(),
      brand_note = case when auth.uid() = d.brand_id and v_note <> '' then v_note else d.brand_note end,
      creator_note = case when auth.uid() = d.creator_id and v_note <> '' then v_note else d.creator_note end
  where id = d.id
  returning * into d;

  perform public.internal_record_deal_event(d.id, auth.uid(), v_role, 'deal_cancelled', v_from, d.status, v_note, 'public');
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

create or replace function public.verify_deal_brand(p_deal_id uuid, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals;
  v_note text := trim(coalesce(p_note, ''));
  v_from text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_deal_id is null then
    raise exception 'Deal not found';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'Keep the verification note under 2,000 characters.';
  end if;

  select * into d from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;
  if d.brand_id is distinct from auth.uid() then
    raise exception 'Not allowed';
  end if;
  if d.status in ('platform_review', 'brand_verified') and d.brand_verified_by = auth.uid() then
    return public.deal_to_json(d);
  end if;
  if d.status is distinct from 'submitted' then
    raise exception 'Only submitted work can be verified by the brand';
  end if;

  v_from := d.status;
  update public.deals
  set status = 'platform_review',
      brand_verified_at = now(),
      brand_verified_by = auth.uid(),
      brand_verification_note = v_note,
      brand_note = case when v_note <> '' then v_note else d.brand_note end
  where id = d.id
  returning * into d;

  perform public.internal_record_deal_event(d.id, auth.uid(), 'brand', 'brand_verified', v_from, d.status, v_note, 'public');
  perform public.internal_notify_deal(
    d.creator_id,
    'deal_brand_verified',
    'Brand verified your work',
    'The brand accepted your submission. CollabCy will review it next.',
    d.connection_id
  );
  perform public.internal_notify_platform(
    'deal_needs_verification',
    'Platform verification needed',
    'A brand verified a collaboration and it is ready for CollabCy review.',
    d.connection_id
  );

  return public.deal_to_json(d);
end;
$$;

create or replace function public.verify_deal_platform(p_deal_id uuid, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals;
  v_note text := trim(coalesce(p_note, ''));
  v_from text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_platform_verifier() then
    raise exception 'Not allowed';
  end if;
  if p_deal_id is null then
    raise exception 'Deal not found';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'Keep the verification note under 2,000 characters.';
  end if;

  select * into d from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;
  if d.status = 'completed' then
    return public.deal_to_json(d);
  end if;
  if d.status in ('cancelled', 'disputed') then
    raise exception 'This deal cannot be verified from its current status';
  end if;
  if d.brand_verified_at is null or d.status not in ('platform_review', 'brand_verified') then
    raise exception 'Platform verification requires brand verification first';
  end if;

  v_from := d.status;
  update public.deals
  set status = 'completed',
      completed_at = now(),
      platform_verified_at = now(),
      platform_verified_by = auth.uid(),
      platform_verification_note = v_note
  where id = d.id
  returning * into d;

  perform public.internal_record_deal_event(d.id, auth.uid(), 'platform', 'platform_verified', v_from, d.status, v_note, 'public');
  perform public.internal_notify_deal(d.creator_id, 'deal_platform_verified', 'Collaboration completed', 'CollabCy verified this collaboration. It is now complete.', d.connection_id);
  perform public.internal_notify_deal(d.brand_id, 'deal_platform_verified', 'Collaboration completed', 'CollabCy verified this collaboration. It is now complete.', d.connection_id);

  return public.deal_to_json(d);
end;
$$;

create or replace function public.request_platform_revision(p_deal_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals;
  v_note text := trim(coalesce(p_note, ''));
  v_from text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_platform_verifier() then
    raise exception 'Not allowed';
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
  if d.status not in ('platform_review', 'brand_verified', 'disputed') then
    raise exception 'CollabCy can only request a revision during platform review';
  end if;

  v_from := d.status;
  update public.deals
  set status = 'revision_requested',
      revision_note = v_note,
      revision_requested_by = auth.uid(),
      revision_requested_at = now()
  where id = d.id
  returning * into d;

  perform public.internal_record_deal_event(d.id, auth.uid(), 'platform', 'platform_requested_revision', v_from, d.status, v_note, 'public');
  perform public.internal_notify_deal(d.creator_id, 'deal_platform_revision', 'CollabCy requested a revision', 'CollabCy asked for changes before this collaboration can be completed.', d.connection_id);
  perform public.internal_notify_deal(d.brand_id, 'deal_platform_revision', 'CollabCy requested a revision', 'CollabCy asked for changes before this collaboration can be completed.', d.connection_id);

  return public.deal_to_json(d);
end;
$$;

create or replace function public.open_deal_dispute(p_deal_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals;
  v_reason text := trim(coalesce(p_reason, ''));
  v_from text;
  v_role text;
  v_other uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if v_reason = '' or char_length(v_reason) < 8 then
    raise exception 'Explain the issue so CollabCy can review it.';
  end if;
  if char_length(v_reason) > 2000 then
    raise exception 'Keep the dispute reason under 2,000 characters.';
  end if;

  select * into d from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;
  if auth.uid() is distinct from d.brand_id and auth.uid() is distinct from d.creator_id then
    raise exception 'Not allowed';
  end if;
  if d.status not in ('submitted', 'revision_requested', 'brand_verified', 'platform_review') then
    raise exception 'A dispute cannot be opened from this status';
  end if;

  v_from := d.status;
  v_role := case when auth.uid() = d.brand_id then 'brand' else 'creator' end;
  perform public.internal_open_deal_dispute(d, v_reason);

  update public.deals
  set status = 'disputed'
  where id = d.id
  returning * into d;

  perform public.internal_record_deal_event(d.id, auth.uid(), v_role, 'dispute_opened', v_from, d.status, v_reason, 'public');
  v_other := case when auth.uid() = d.brand_id then d.creator_id else d.brand_id end;
  perform public.internal_notify_deal(v_other, 'deal_disputed', 'A dispute was opened', 'This collaboration needs a CollabCy review.', d.connection_id);
  perform public.internal_notify_platform('deal_disputed', 'Collaboration disputed', 'A participant opened a dispute that needs CollabCy review.', d.connection_id);

  return public.deal_to_json(d);
end;
$$;

create or replace function public.mark_deal_disputed(p_deal_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals;
  v_reason text := trim(coalesce(p_reason, ''));
  v_from text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_platform_verifier() then
    raise exception 'Not allowed';
  end if;
  if v_reason = '' or char_length(v_reason) < 8 then
    raise exception 'Explain the issue so CollabCy can review it.';
  end if;
  if char_length(v_reason) > 2000 then
    raise exception 'Keep the dispute reason under 2,000 characters.';
  end if;

  select * into d from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;
  if d.status = 'disputed' then
    return public.deal_to_json(d);
  end if;
  if d.status not in ('platform_review', 'brand_verified') then
    raise exception 'CollabCy can only mark a dispute during platform review';
  end if;

  v_from := d.status;
  perform public.internal_open_deal_dispute(d, v_reason);
  update public.deals set status = 'disputed' where id = d.id returning * into d;
  perform public.internal_record_deal_event(d.id, auth.uid(), 'platform', 'dispute_opened', v_from, d.status, v_reason, 'public');
  perform public.internal_notify_deal(d.creator_id, 'deal_disputed', 'CollabCy opened a dispute', 'This collaboration is under CollabCy review.', d.connection_id);
  perform public.internal_notify_deal(d.brand_id, 'deal_disputed', 'CollabCy opened a dispute', 'This collaboration is under CollabCy review.', d.connection_id);

  return public.deal_to_json(d);
end;
$$;

create or replace function public.resolve_deal_dispute(p_deal_id uuid, p_outcome text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deals;
  v public.deal_disputes;
  v_note text := trim(coalesce(p_note, ''));
  v_outcome text := trim(coalesce(p_outcome, ''));
  v_from text;
  v_next text;
  v_dispute_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_platform_verifier() then
    raise exception 'Not allowed';
  end if;
  if v_note = '' or char_length(v_note) < 8 then
    raise exception 'Add a resolution note.';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'Keep the resolution note under 2,000 characters.';
  end if;
  if v_outcome not in ('completed', 'revision_requested', 'dismissed') then
    raise exception 'Choose a valid dispute resolution.';
  end if;

  select * into d from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;
  if d.status is distinct from 'disputed' then
    raise exception 'Only a disputed collaboration can be resolved';
  end if;

  select * into v
  from public.deal_disputes
  where deal_id = d.id
    and status in ('open', 'under_review')
  order by created_at desc
  limit 1
  for update;
  if not found then
    raise exception 'No open dispute to resolve';
  end if;

  v_from := d.status;
  if v_outcome = 'completed' then
    if d.brand_verified_at is null then
      raise exception 'Platform verification requires brand verification first';
    end if;
    v_next := 'completed';
    v_dispute_status := 'resolved';
  elsif v_outcome = 'revision_requested' then
    v_next := 'revision_requested';
    v_dispute_status := 'resolved';
  else
    v_next := case when d.brand_verified_at is not null then 'platform_review' else 'submitted' end;
    v_dispute_status := 'dismissed';
  end if;

  update public.deal_disputes
  set status = v_dispute_status,
      resolution_note = v_note,
      resolved_by = auth.uid(),
      resolved_at = now()
  where id = v.id;

  update public.deals
  set status = v_next,
      completed_at = case when v_next = 'completed' then now() else completed_at end,
      platform_verified_at = case when v_next = 'completed' then now() else platform_verified_at end,
      platform_verified_by = case when v_next = 'completed' then auth.uid() else platform_verified_by end,
      platform_verification_note = case when v_next = 'completed' then v_note else platform_verification_note end,
      revision_note = case when v_next = 'revision_requested' then v_note else revision_note end,
      revision_requested_by = case when v_next = 'revision_requested' then auth.uid() else revision_requested_by end,
      revision_requested_at = case when v_next = 'revision_requested' then now() else revision_requested_at end
  where id = d.id
  returning * into d;

  perform public.internal_record_deal_event(d.id, auth.uid(), 'platform', 'dispute_resolved', v_from, d.status, v_note, 'public');
  perform public.internal_notify_deal(d.creator_id, 'deal_dispute_resolved', 'Dispute update', 'CollabCy resolved the dispute on this collaboration.', d.connection_id);
  perform public.internal_notify_deal(d.brand_id, 'deal_dispute_resolved', 'Dispute update', 'CollabCy resolved the dispute on this collaboration.', d.connection_id);

  return public.deal_to_json(d);
end;
$$;

create or replace function public.list_verification_queue(p_filter text default 'needs')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_filter text := coalesce(nullif(trim(p_filter), ''), 'needs');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_platform_verifier() then
    raise exception 'Not allowed';
  end if;
  if v_filter not in ('needs', 'disputed', 'completed') then
    v_filter := 'needs';
  end if;

  return coalesce((
    select jsonb_agg(item order by sort_at desc)
    from (
      select jsonb_build_object(
        'deal', public.deal_to_json(d),
        'campaign_title', coalesce(nullif(camp.title, ''), nullif(app.campaign_title, ''), 'Collaboration'),
        'campaign_brand', coalesce(nullif(camp.brand_name, ''), nullif(app.campaign_brand, ''), 'Brand'),
        'campaign_color', coalesce(nullif(camp.color, ''), nullif(app.campaign_color, ''), '#e8edff'),
        'creator_name', coalesce(nullif(app.creator_name, ''), 'Creator'),
        'creator_handle', coalesce(nullif(app.creator_handle, ''), ''),
        'brand_name', coalesce(nullif(camp.brand_name, ''), nullif(app.campaign_brand, ''), 'Brand'),
        'dispute_id', disp.id,
        'dispute_status', disp.status,
        'dispute_reason', disp.reason,
        'dispute_opened_at', disp.created_at
      ) as item,
      d.updated_at as sort_at
      from public.deals d
      left join public.campaigns camp on camp.id = d.campaign_id
      left join public.connections n on n.id = d.connection_id
      left join public.campaign_applications app on app.id = n.application_id
      left join lateral (
        select *
        from public.deal_disputes x
        where x.deal_id = d.id
        order by x.created_at desc
        limit 1
      ) disp on true
      where (
        (v_filter = 'needs' and d.status in ('platform_review', 'brand_verified'))
        or (v_filter = 'disputed' and d.status = 'disputed')
        or (v_filter = 'completed' and d.status = 'completed' and d.completed_at > now() - interval '30 days')
      )
    ) queued
  ), '[]'::jsonb);
end;
$$;

-- Backfill submission history from current deal rows without duplicating.
insert into public.deal_submissions (deal_id, submitted_by, note, url, created_at)
select d.id, d.creator_id, d.submission_note, d.submission_url, coalesce(d.submitted_at, d.updated_at, now())
from public.deals d
where d.submitted_at is not null
  and not exists (select 1 from public.deal_submissions s where s.deal_id = d.id);

insert into public.deal_verification_events (deal_id, actor_id, actor_role, action, from_status, to_status, note, created_at)
select d.id, d.creator_id, 'creator', 'creator_submitted', 'active', 'submitted', d.submission_note, d.submitted_at
from public.deals d
where d.submitted_at is not null
  and not exists (
    select 1 from public.deal_verification_events e
    where e.deal_id = d.id and e.action = 'creator_submitted'
  );

insert into public.deal_verification_events (deal_id, actor_id, actor_role, action, from_status, to_status, created_at)
select d.id, d.brand_id, 'brand', 'legacy_completed', 'submitted', 'completed', d.completed_at
from public.deals d
where d.status = 'completed'
  and d.completed_at is not null
  and d.platform_verified_at is null
  and not exists (
    select 1 from public.deal_verification_events e
    where e.deal_id = d.id and e.action in ('platform_verified', 'legacy_completed')
  );

revoke all on function public.internal_record_deal_event(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.internal_notify_platform(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.internal_open_deal_dispute(public.deals, text) from public, anon, authenticated;
revoke all on function public.deal_to_json(public.deals) from public, anon, authenticated;

revoke all on function public.verify_deal_brand(uuid, text) from public, anon;
grant execute on function public.verify_deal_brand(uuid, text) to authenticated;
revoke all on function public.verify_deal_platform(uuid, text) from public, anon;
grant execute on function public.verify_deal_platform(uuid, text) to authenticated;
revoke all on function public.request_platform_revision(uuid, text) from public, anon;
grant execute on function public.request_platform_revision(uuid, text) to authenticated;
revoke all on function public.open_deal_dispute(uuid, text) from public, anon;
grant execute on function public.open_deal_dispute(uuid, text) to authenticated;
revoke all on function public.mark_deal_disputed(uuid, text) from public, anon;
grant execute on function public.mark_deal_disputed(uuid, text) to authenticated;
revoke all on function public.resolve_deal_dispute(uuid, text, text) from public, anon;
grant execute on function public.resolve_deal_dispute(uuid, text, text) to authenticated;
revoke all on function public.list_verification_queue(text) from public, anon;
grant execute on function public.list_verification_queue(text) to authenticated;
revoke all on function public.submit_deal(uuid, text, text) from public, anon;
grant execute on function public.submit_deal(uuid, text, text) to authenticated;
revoke all on function public.request_deal_revision(uuid, text) from public, anon;
grant execute on function public.request_deal_revision(uuid, text) to authenticated;
revoke all on function public.complete_deal(uuid) from public, anon;
grant execute on function public.complete_deal(uuid) to authenticated;
revoke all on function public.cancel_deal(uuid, text) from public, anon;
grant execute on function public.cancel_deal(uuid, text) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.deal_disputes;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.deal_verification_events;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
