-- =============================================================================
-- ONE-TIME MANUAL FULL AUTH RESET — REVIEW BEFORE RUNNING
-- =============================================================================
-- DO NOT run Part 1 until you have read Part 0 and agree this is a full wipe
-- of EVERY current auth.users row and their user-owned CollabCy data.
--
-- Source of truth: auth.users at the start of the transaction.
-- No hardcoded user IDs or emails.
--
-- Run in the Supabase SQL editor as postgres (table owner). Do not switch
-- session role to authenticated. Do not disable RLS. Do not drop objects.
--
-- This is NOT a migration. Do not apply it via the migrations folder.
-- =============================================================================
-- SCHEMA AUDIT (from repository migrations — not assumed)
--
-- Direct auth.users FKs:
--   profiles.user_id                          ON DELETE CASCADE
--   social_accounts.user_id                   ON DELETE CASCADE
--   campaigns.user_id                         ON DELETE CASCADE
--   campaign_applications.creator_id          ON DELETE CASCADE
--   connections.brand_id / creator_id         ON DELETE CASCADE
--   conversations.brand_id / creator_id       ON DELETE CASCADE
--   messages.sender_id                        ON DELETE CASCADE
--   notifications.user_id                     ON DELETE CASCADE
--   deals.brand_id / creator_id               ON DELETE CASCADE
--   deals.brand_verified_by                   ON DELETE SET NULL
--   deals.platform_verified_by                ON DELETE SET NULL
--   deals.revision_requested_by               ON DELETE SET NULL
--   deal_submissions.submitted_by             ON DELETE CASCADE
--   deal_verification_events.actor_id         ON DELETE SET NULL
--   deal_disputes.opened_by                   ON DELETE CASCADE
--   deal_disputes.resolved_by                 ON DELETE SET NULL
--   platform_verifiers.user_id                ON DELETE CASCADE
--   platform_verifiers.created_by             ON DELETE SET NULL
--   attention_products.owner_id               ON DELETE CASCADE  (nullable after public listing)
--   attention_bids.bidder_id                  ON DELETE SET NULL
--
-- No auth.users FK:
--   conversations.last_message_sender_id      (uuid, no FK)
--   attention_activity                        (product_id → attention_products CASCADE only)
--   attention_rate_windows                    (bucket text PK, not user-owned)
--   marketplace_role_audit                    (generated_at PK; details jsonb snapshot only)
--   public_creators                           (VIEW over profiles)
--
-- RESTRICT parents (must clear children first; a raw auth.users delete is unsafe):
--   deals.connection_id          → connections ON DELETE RESTRICT
--   deals.campaign_id            → campaigns   ON DELETE RESTRICT
--   conversations.connection_id  → connections ON DELETE RESTRICT
--   conversations.campaign_id    → campaigns   ON DELETE RESTRICT
--
-- Other public FKs:
--   campaign_applications.campaign_id → campaigns CASCADE
--   connections.campaign_id           → campaigns CASCADE
--   connections.application_id        → campaign_applications SET NULL
--   messages.conversation_id          → conversations CASCADE
--   notifications.conversation_id     → conversations CASCADE
--   notifications.connection_id       → connections CASCADE
--   notifications.message_id          → messages CASCADE
--   deal_submissions.deal_id          → deals CASCADE
--   deal_verification_events.deal_id  → deals CASCADE
--   deal_disputes.deal_id             → deals CASCADE
--   attention_bids.product_id         → attention_products CASCADE
--   attention_activity.product_id     → attention_products CASCADE
--
-- Auth schema (standard Supabase; CASCADE from auth.users, not redefined here):
--   auth.identities, auth.sessions, auth.refresh_tokens, and related auth
--   child tables are removed when the parent auth.users row is deleted.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PART 0 — PREFLIGHT (read-only). Run this first. It does not delete anything.
-- -----------------------------------------------------------------------------

select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.profiles where role = 'creator') as creator_profiles,
  (select count(*) from public.profiles where role = 'brand') as brand_profiles,
  (select count(*) from public.campaigns) as campaigns,
  (select count(*) from public.campaign_applications) as applications,
  (select count(*) from public.connections) as connections,
  (select count(*) from public.conversations) as conversations,
  (select count(*) from public.messages) as messages,
  (select count(*) from public.notifications) as notifications,
  (select count(*) from public.deals) as deals,
  (select count(*) from public.deal_submissions) as deal_submissions,
  (select count(*) from public.deal_verification_events) as deal_verification_events,
  (select count(*) from public.deal_disputes) as deal_disputes,
  (select count(*) from public.social_accounts) as social_accounts,
  (select count(*) from public.platform_verifiers) as platform_verifiers,
  (select count(*) from public.attention_products) as attention_products_total,
  (select count(*) from public.attention_products where owner_id is not null) as attention_products_user_owned,
  (select count(*) from public.attention_products where owner_id is null) as attention_products_guest,
  (select count(*) from public.attention_bids) as attention_bids_total,
  (select count(*) from public.attention_bids where bidder_id is not null) as attention_bids_by_users,
  (select count(*) from public.attention_activity) as attention_activity,
  (select count(*) from public.attention_rate_windows) as attention_rate_windows,
  (select count(*) from public.marketplace_role_audit) as marketplace_role_audit_rows;

select id as user_id, email, created_at
from auth.users
order by created_at, email;

select user_id, email, role, created_at
from public.profiles
order by created_at, role;

select user_id, created_at, revoked_at
from public.platform_verifiers
order by created_at;

-- Dual-role snapshot (informational). Cleanup does not delete by role.
select user_id, array_agg(role order by created_at, role) as roles
from public.profiles
group by user_id
having count(distinct role) > 1;

-- Attention Marketplace: user-owned products would be destroyed if auth.users
-- were deleted (owner_id ON DELETE CASCADE). Guest listings (owner_id null)
-- would remain. Bids on remaining products would have bidder_id SET NULL.
select
  p.id as product_id,
  p.name,
  p.owner_id,
  u.email as owner_email,
  p.status,
  (select count(*) from public.attention_bids b where b.product_id = p.id) as bids,
  (select count(*) from public.attention_activity a where a.product_id = p.id) as activity_rows
from public.attention_products p
left join auth.users u on u.id = p.owner_id
order by p.created_at;

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname = 'profiles_one_identity_idx';


-- -----------------------------------------------------------------------------
-- PART 1 — FULL RESET TRANSACTION
-- Run only after Part 0 looks correct. Entire block succeeds or rolls back.
-- -----------------------------------------------------------------------------

begin;

create temporary table cleanup_users (
  user_id uuid primary key,
  email text
) on commit drop;

insert into cleanup_users (user_id, email)
select id, email
from auth.users;

-- Only IDs captured above may be deleted. No role/email/dual-role predicates.
do $$
declare
  snapshot_count integer;
  live_count integer;
begin
  select count(*) into snapshot_count from cleanup_users;
  select count(*) into live_count from auth.users;
  if snapshot_count is distinct from live_count then
    raise exception
      'Cleanup aborted: snapshot (%) does not match live auth.users (%)',
      snapshot_count, live_count;
  end if;
end $$;

create temporary table cleanup_campaigns on commit drop as
  select id from public.campaigns
  where user_id in (select user_id from cleanup_users);

create temporary table cleanup_applications on commit drop as
  select id from public.campaign_applications
  where creator_id in (select user_id from cleanup_users)
     or campaign_id in (select id from cleanup_campaigns);

create temporary table cleanup_connections on commit drop as
  select id from public.connections
  where brand_id in (select user_id from cleanup_users)
     or creator_id in (select user_id from cleanup_users);

create temporary table cleanup_conversations on commit drop as
  select id from public.conversations
  where brand_id in (select user_id from cleanup_users)
     or creator_id in (select user_id from cleanup_users)
     or connection_id in (select id from cleanup_connections);

create temporary table cleanup_deals on commit drop as
  select id from public.deals
  where brand_id in (select user_id from cleanup_users)
     or creator_id in (select user_id from cleanup_users)
     or connection_id in (select id from cleanup_connections);

create temporary table cleanup_attention_products on commit drop as
  select id from public.attention_products
  where owner_id in (select user_id from cleanup_users);

-- Explicit Attention Marketplace handling (do not rely on silent cascade):
-- 1. User-owned products are deleted here. Their bids and activity CASCADE
--    from attention_products.
-- 2. Guest products (owner_id is null) are kept.
-- 3. Remaining bids by snapshot users (on guest products) have bidder_id
--    cleared explicitly, matching ON DELETE SET NULL, so bid amounts remain.
-- 4. attention_rate_windows are not user-owned and are not deleted.
delete from public.attention_products
where id in (select id from cleanup_attention_products);

update public.attention_bids
set bidder_id = null
where bidder_id in (select user_id from cleanup_users);

-- CollabCy marketplace children before RESTRICT parents.
delete from public.notifications
where user_id in (select user_id from cleanup_users)
   or conversation_id in (select id from cleanup_conversations)
   or connection_id in (select id from cleanup_connections)
   or message_id in (
        select m.id from public.messages m
        where m.conversation_id in (select id from cleanup_conversations)
     );

delete from public.messages
where conversation_id in (select id from cleanup_conversations);

delete from public.deal_disputes
where deal_id in (select id from cleanup_deals);

delete from public.deal_verification_events
where deal_id in (select id from cleanup_deals);

delete from public.deal_submissions
where deal_id in (select id from cleanup_deals);

delete from public.deals
where id in (select id from cleanup_deals);

delete from public.conversations
where id in (select id from cleanup_conversations);

delete from public.connections
where id in (select id from cleanup_connections);

delete from public.campaign_applications
where id in (select id from cleanup_applications);

delete from public.campaigns
where id in (select id from cleanup_campaigns);

delete from public.social_accounts
where user_id in (select user_id from cleanup_users);

delete from public.profiles
where user_id in (select user_id from cleanup_users);

delete from public.platform_verifiers
where user_id in (select user_id from cleanup_users);

-- auth.users deletion also removes auth.identities / sessions / refresh tokens.
delete from auth.users
where id in (select user_id from cleanup_users);

-- In-transaction verification. Any leftover target row rolls the cleanup back.
do $$
declare
  leftover integer;
begin
  select count(*) into leftover from auth.users
    where id in (select user_id from cleanup_users);
  if leftover <> 0 then raise exception 'Verification failed: % snapshot auth.users row(s) remain', leftover; end if;

  select count(*) into leftover from auth.users;
  if leftover <> 0 then raise exception 'Verification failed: % auth.users row(s) remain after reset', leftover; end if;

  select count(*) into leftover from public.profiles;
  if leftover <> 0 then raise exception 'Verification failed: % profile row(s) remain', leftover; end if;

  select count(*) into leftover from public.social_accounts;
  if leftover <> 0 then raise exception 'Verification failed: % social_accounts row(s) remain', leftover; end if;

  select count(*) into leftover from public.campaigns;
  if leftover <> 0 then raise exception 'Verification failed: % campaign row(s) remain', leftover; end if;

  select count(*) into leftover from public.campaign_applications;
  if leftover <> 0 then raise exception 'Verification failed: % application row(s) remain', leftover; end if;

  select count(*) into leftover from public.connections;
  if leftover <> 0 then raise exception 'Verification failed: % connection row(s) remain', leftover; end if;

  select count(*) into leftover from public.conversations;
  if leftover <> 0 then raise exception 'Verification failed: % conversation row(s) remain', leftover; end if;

  select count(*) into leftover from public.messages;
  if leftover <> 0 then raise exception 'Verification failed: % message row(s) remain', leftover; end if;

  select count(*) into leftover from public.notifications;
  if leftover <> 0 then raise exception 'Verification failed: % notification row(s) remain', leftover; end if;

  select count(*) into leftover from public.deals;
  if leftover <> 0 then raise exception 'Verification failed: % deal row(s) remain', leftover; end if;

  select count(*) into leftover from public.deal_submissions;
  if leftover <> 0 then raise exception 'Verification failed: % deal_submissions row(s) remain', leftover; end if;

  select count(*) into leftover from public.deal_verification_events;
  if leftover <> 0 then raise exception 'Verification failed: % deal_verification_events row(s) remain', leftover; end if;

  select count(*) into leftover from public.deal_disputes;
  if leftover <> 0 then raise exception 'Verification failed: % deal_disputes row(s) remain', leftover; end if;

  select count(*) into leftover from public.platform_verifiers;
  if leftover <> 0 then raise exception 'Verification failed: % platform_verifiers row(s) remain', leftover; end if;

  select count(*) into leftover from public.attention_products
    where owner_id is not null;
  if leftover <> 0 then raise exception 'Verification failed: % user-owned attention products remain', leftover; end if;

  select count(*) into leftover from public.attention_bids
    where bidder_id is not null;
  if leftover <> 0 then raise exception 'Verification failed: % attention bids still reference a user', leftover; end if;

  select count(*) into leftover
  from (
    select user_id from public.profiles
    group by user_id
    having count(distinct role) > 1
  ) dual_users;
  if leftover <> 0 then
    raise exception 'Verification failed: % dual-role user(s) still exist', leftover;
  end if;
end $$;

commit;


-- -----------------------------------------------------------------------------
-- PART 2 — POST-CLEANUP VERIFICATION (run after a successful COMMIT)
-- -----------------------------------------------------------------------------

select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.social_accounts) as social_accounts,
  (select count(*) from public.campaigns) as campaigns,
  (select count(*) from public.campaign_applications) as applications,
  (select count(*) from public.connections) as connections,
  (select count(*) from public.conversations) as conversations,
  (select count(*) from public.messages) as messages,
  (select count(*) from public.notifications) as notifications,
  (select count(*) from public.deals) as deals,
  (select count(*) from public.deal_submissions) as deal_submissions,
  (select count(*) from public.deal_verification_events) as deal_verification_events,
  (select count(*) from public.deal_disputes) as deal_disputes,
  (select count(*) from public.platform_verifiers) as platform_verifiers;

-- Expected leftover Attention Marketplace: guest listings only (owner_id null),
-- bids with bidder_id null, activity on remaining products, rate windows.
select
  (select count(*) from public.attention_products) as attention_products_remaining,
  (select count(*) from public.attention_products where owner_id is null) as attention_products_guest,
  (select count(*) from public.attention_products where owner_id is not null) as attention_products_still_user_owned,
  (select count(*) from public.attention_bids) as attention_bids_remaining,
  (select count(*) from public.attention_bids where bidder_id is not null) as attention_bids_still_user_linked,
  (select count(*) from public.attention_activity) as attention_activity_remaining,
  (select count(*) from public.attention_rate_windows) as attention_rate_windows_remaining;

-- marketplace_role_audit is historical infrastructure with no auth.users FK.
-- Rows remain. details jsonb may still mention deleted user_ids as history.
select count(*) as marketplace_role_audit_rows
from public.marketplace_role_audit;

select 'deals_missing_connection' as check_name, count(*) as leftover
from public.deals d
left join public.connections n on n.id = d.connection_id
where n.id is null
union all
select 'conversations_missing_connection', count(*)
from public.conversations v
left join public.connections n on n.id = v.connection_id
where n.id is null
union all
select 'connections_missing_campaign', count(*)
from public.connections n
left join public.campaigns c on c.id = n.campaign_id
where c.id is null
union all
select 'attention_bids_missing_product', count(*)
from public.attention_bids b
left join public.attention_products p on p.id = b.product_id
where p.id is null;

select count(*) as dual_role_users
from (
  select user_id from public.profiles
  group by user_id
  having count(distinct role) > 1
) dual_users;

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname = 'profiles_one_identity_idx';

-- Optional follow-up, only after auth.users = 0, profiles = 0, dual_role_users = 0:
-- create unique index if not exists profiles_one_identity_idx on public.profiles (user_id);
