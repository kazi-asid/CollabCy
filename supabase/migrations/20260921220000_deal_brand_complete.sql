-- Brand approval completes a collaboration. Platform review is escalation-only.
-- Existing completed deals stay completed. Existing events stay intact.
-- In-flight platform_review rows are left for the admin queue (legacy / escalation).
-- Payments and escrow are not implemented.

alter table public.messages add column if not exists from_platform boolean not null default false;

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
  if coalesce(current_setting('collabcy.platform_message', true), '') is distinct from 'on' then
    new.from_platform := false;
  elsif not public.is_platform_verifier() then
    raise exception 'Not allowed';
  else
    new.from_platform := true;
  end if;
  return new;
end;
$$;

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
     or new.created_at is distinct from old.created_at
     or new.from_platform is distinct from old.from_platform then
    raise exception 'Messages cannot be edited';
  end if;
  return new;
end;
$$;

drop policy if exists "messages_select_verifier" on public.messages;
create policy "messages_select_verifier"
  on public.messages
  for select
  to authenticated
  using (public.is_platform_verifier());

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
      and status in (
        'submitted',
        'revision_requested',
        'brand_verified',
        'platform_review',
        'disputed',
        'completed'
      )
    )
  );

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
  if d.status = 'completed' and d.brand_verified_by = auth.uid() then
    return public.deal_to_json(d);
  end if;
  if d.status in ('platform_review', 'brand_verified') and d.brand_verified_by = auth.uid() then
    return public.deal_to_json(d);
  end if;
  if d.status is distinct from 'submitted' then
    raise exception 'Only submitted work can be verified by the brand';
  end if;

  v_from := d.status;
  update public.deals
  set status = 'completed',
      brand_verified_at = now(),
      brand_verified_by = auth.uid(),
      brand_verification_note = v_note,
      brand_note = case when v_note <> '' then v_note else d.brand_note end,
      completed_at = now()
  where id = d.id
  returning * into d;

  perform public.internal_record_deal_event(d.id, auth.uid(), 'brand', 'brand_verified', v_from, 'brand_verified', v_note, 'public');
  perform public.internal_record_deal_event(d.id, auth.uid(), 'brand', 'deal_completed', 'brand_verified', d.status, v_note, 'public');
  perform public.internal_notify_deal(
    d.creator_id,
    'deal_completed',
    'Brand approved your work',
    'The brand verified this submission. The collaboration is complete.',
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
  if v_note = '' or char_length(v_note) < 8 then
    raise exception 'Add a reason for this platform decision.';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'Keep the decision reason under 2,000 characters.';
  end if;

  select * into d from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;
  if d.status = 'completed' then
    return public.deal_to_json(d);
  end if;
  if d.status = 'disputed' then
    raise exception 'Resolve the dispute instead of completing it from verification.';
  end if;
  if d.status is distinct from 'platform_review' then
    raise exception 'This collaboration is not in platform review';
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

  perform public.internal_record_deal_event(d.id, auth.uid(), 'platform', 'platform_approved', v_from, d.status, v_note, 'public');
  perform public.internal_notify_deal(
    d.creator_id,
    'deal_platform_verified',
    'Platform decision recorded',
    'CollabCy recorded a platform decision on this collaboration. Reason: ' || left(v_note, 280),
    d.connection_id
  );
  perform public.internal_notify_deal(
    d.brand_id,
    'deal_platform_verified',
    'Platform decision recorded',
    'CollabCy recorded a platform decision on this collaboration. Reason: ' || left(v_note, 280),
    d.connection_id
  );

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
  if d.status not in ('platform_review', 'disputed') then
    raise exception 'CollabCy can only request a revision during platform review';
  end if;

  v_from := d.status;
  if d.status = 'disputed' then
    update public.deal_disputes
    set status = 'resolved',
        resolution_note = v_note,
        resolved_by = auth.uid(),
        resolved_at = now()
    where deal_id = d.id
      and status in ('open', 'under_review');
  end if;

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
  if d.status not in ('submitted', 'revision_requested', 'platform_review', 'brand_verified') then
    raise exception 'CollabCy can only mark a dispute during review';
  end if;

  v_from := d.status;
  perform public.internal_open_deal_dispute(d, v_reason);
  update public.deals set status = 'disputed' where id = d.id returning * into d;
  perform public.internal_record_deal_event(d.id, auth.uid(), 'platform', 'dispute_opened', v_from, d.status, v_reason, 'public');
  perform public.internal_notify_deal(d.creator_id, 'deal_disputed', 'CollabCy opened a dispute', 'This collaboration has been escalated for platform review.', d.connection_id);
  perform public.internal_notify_deal(d.brand_id, 'deal_disputed', 'CollabCy opened a dispute', 'This collaboration has been escalated for platform review.', d.connection_id);

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
  perform public.internal_notify_deal(v_other, 'deal_disputed', 'A dispute was opened', 'This collaboration has been escalated for platform review.', d.connection_id);
  perform public.internal_notify_platform('deal_disputed', 'Collaboration disputed', 'A participant opened a dispute that needs CollabCy review.', d.connection_id);

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
    raise exception 'Add a reason for this platform decision.';
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
    v_next := 'completed';
    v_dispute_status := 'resolved';
  elsif v_outcome = 'revision_requested' then
    v_next := 'revision_requested';
    v_dispute_status := 'resolved';
  else
    v_next := 'submitted';
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
  perform public.internal_notify_deal(
    d.creator_id,
    'deal_dispute_resolved',
    'Platform decision recorded',
    'CollabCy recorded a platform decision on this dispute. Reason: ' || left(v_note, 280),
    d.connection_id
  );
  perform public.internal_notify_deal(
    d.brand_id,
    'deal_dispute_resolved',
    'Platform decision recorded',
    'CollabCy recorded a platform decision on this dispute. Reason: ' || left(v_note, 280),
    d.connection_id
  );

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
        'conversation_id', conv.id,
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
      left join public.conversations conv on conv.connection_id = d.connection_id
      left join lateral (
        select *
        from public.deal_disputes x
        where x.deal_id = d.id
        order by x.created_at desc
        limit 1
      ) disp on true
      where (
        (v_filter = 'needs' and d.status in ('platform_review', 'disputed'))
        or (v_filter = 'disputed' and d.status = 'disputed')
        or (v_filter = 'completed' and d.status = 'completed' and d.completed_at > now() - interval '30 days')
      )
    ) queued
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_platform_verifier() then
    raise exception 'Not allowed';
  end if;

  return jsonb_build_object(
    'pending_reviews', (select count(*)::int from public.deals where status in ('platform_review', 'disputed')),
    'open_disputes', (select count(*)::int from public.deals where status = 'disputed'),
    'active_collaborations', (select count(*)::int from public.deals where status in ('active', 'submitted', 'revision_requested')),
    'completed_collaborations', (select count(*)::int from public.deals where status = 'completed'),
    'recently_completed', (select count(*)::int from public.deals where status = 'completed' and completed_at > now() - interval '7 days'),
    'recent_escalations', (select count(*)::int from public.deal_disputes where created_at > now() - interval '7 days')
  );
end;
$$;

create or replace function public.list_admin_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_platform_verifier() then
    raise exception 'Not allowed';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'deal_id', e.deal_id,
      'actor_id', e.actor_id,
      'actor_role', e.actor_role,
      'action', e.action,
      'from_status', e.from_status,
      'to_status', e.to_status,
      'note', e.note,
      'visibility', e.visibility,
      'created_at', e.created_at,
      'campaign_title', coalesce(nullif(camp.title, ''), 'Collaboration')
    ) order by e.created_at desc)
    from (
      select *
      from public.deal_verification_events
      where actor_role = 'platform'
      order by created_at desc
      limit 80
    ) e
    left join public.deals d on d.id = e.deal_id
    left join public.campaigns camp on camp.id = d.campaign_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_admin_conversations()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_platform_verifier() then
    raise exception 'Not allowed';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'connection_id', c.connection_id,
      'campaign_id', c.campaign_id,
      'brand_id', c.brand_id,
      'creator_id', c.creator_id,
      'campaign_title', c.campaign_title,
      'campaign_brand', c.campaign_brand,
      'campaign_color', c.campaign_color,
      'creator_name', c.creator_name,
      'creator_handle', c.creator_handle,
      'creator_avatar', c.creator_avatar,
      'brand_name', c.brand_name,
      'last_message_at', c.last_message_at,
      'last_message_body', c.last_message_body,
      'last_message_sender_id', c.last_message_sender_id,
      'deal_id', d.id,
      'deal_status', d.status,
      'agreed_budget', d.agreed_budget,
      'created_at', c.created_at
    ) order by coalesce(c.last_message_at, c.created_at) desc)
    from public.conversations c
    join public.deals d on d.connection_id = c.connection_id
    where d.status in ('submitted', 'revision_requested', 'platform_review', 'disputed', 'completed')
  ), '[]'::jsonb);
end;
$$;

create or replace function public.send_platform_message(p_conversation_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.conversations;
  d public.deals;
  v_body text := trim(coalesce(p_body, ''));
  m public.messages;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_platform_verifier() then
    raise exception 'Not allowed';
  end if;
  if v_body = '' then
    raise exception 'Please write a message before sending.';
  end if;
  if char_length(v_body) > 3000 then
    raise exception 'That message is too long.';
  end if;

  select * into c from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'Conversation not found';
  end if;
  select * into d from public.deals where connection_id = c.connection_id;
  if not found then
    raise exception 'Deal not found';
  end if;

  perform set_config('collabcy.platform_message', 'on', true);
  insert into public.messages (conversation_id, sender_id, body, from_platform)
  values (c.id, auth.uid(), v_body, true)
  returning * into m;

  perform public.internal_record_deal_event(d.id, auth.uid(), 'platform', 'platform_message_sent', d.status, d.status, left(v_body, 280), 'admin');
  perform public.internal_notify_deal(
    c.creator_id,
    'new_message',
    'Message from CollabCy Admin',
    'This message is from CollabCy platform administration.',
    c.connection_id
  );
  perform public.internal_notify_deal(
    c.brand_id,
    'new_message',
    'Message from CollabCy Admin',
    'This message is from CollabCy platform administration.',
    c.connection_id
  );

  return jsonb_build_object(
    'id', m.id,
    'conversation_id', m.conversation_id,
    'sender_id', m.sender_id,
    'body', m.body,
    'from_platform', m.from_platform,
    'created_at', m.created_at,
    'read_at', m.read_at
  );
end;
$$;

create or replace function public.record_admin_internal_note(p_deal_id uuid, p_note text)
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
  if not public.is_platform_verifier() then
    raise exception 'Not allowed';
  end if;
  if v_note = '' or char_length(v_note) < 8 then
    raise exception 'Add an internal note.';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'Keep the internal note under 2,000 characters.';
  end if;

  select * into d from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;

  perform public.internal_record_deal_event(d.id, auth.uid(), 'platform', 'admin_internal_note', d.status, d.status, v_note, 'admin');
  return public.deal_to_json(d);
end;
$$;

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
revoke all on function public.list_admin_overview() from public, anon;
grant execute on function public.list_admin_overview() to authenticated;
revoke all on function public.list_admin_activity() from public, anon;
grant execute on function public.list_admin_activity() to authenticated;
revoke all on function public.list_admin_conversations() from public, anon;
grant execute on function public.list_admin_conversations() to authenticated;
revoke all on function public.send_platform_message(uuid, text) from public, anon;
grant execute on function public.send_platform_message(uuid, text) to authenticated;
revoke all on function public.record_admin_internal_note(uuid, text) from public, anon;
grant execute on function public.record_admin_internal_note(uuid, text) to authenticated;
