-- Attention Marketplace production hardening.
-- Apply after 20260921180000_attention_public_listing.sql.
-- Does not change ranking semantics, public/no-login access, or payment.

-- ---------------------------------------------------------------------------
-- Length / money constraints (existing rows are short guest listings)
-- ---------------------------------------------------------------------------
do $$
begin
  alter table public.attention_products
    add constraint attention_products_name_len check (char_length(name) between 1 and 80);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.attention_products
    add constraint attention_products_brand_name_len check (char_length(brand_name) between 1 and 80);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.attention_products
    add constraint attention_products_description_len check (char_length(description) between 1 and 500);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.attention_products
    add constraint attention_products_website_len check (char_length(website_url) between 8 and 2048);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.attention_products
    add constraint attention_products_logo_len check (logo is null or char_length(logo) <= 700000);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.attention_products
    add constraint attention_products_current_bid_max check (current_bid <= 100000);
exception when duplicate_object then null;
end $$;

-- Useful lookup indexes only.
create index if not exists attention_products_live_rank_idx
  on public.attention_products (current_bid desc, id)
  where status = 'active';

create index if not exists attention_products_name_website_idx
  on public.attention_products (lower(name), website_url, created_at desc);

-- ---------------------------------------------------------------------------
-- Rate-limit ledger: not exposed to clients
-- ---------------------------------------------------------------------------
create table if not exists public.attention_rate_windows (
  bucket text primary key,
  hits integer not null default 0,
  window_starts_at timestamptz not null default now()
);

alter table public.attention_rate_windows enable row level security;
revoke all on table public.attention_rate_windows from public, anon, authenticated;

create or replace function public.attention_request_subject()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_ip text;
begin
  begin
    v_headers := coalesce(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip := nullif(trim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)), '');
  if v_ip is null then
    v_ip := nullif(trim(coalesce(v_headers->>'cf-connecting-ip', '')), '');
  end if;
  if v_ip is null then
    v_ip := nullif(trim(coalesce(v_headers->>'x-real-ip', '')), '');
  end if;
  return coalesce(v_ip, auth.uid()::text);
end;
$$;

create or replace function public.attention_rate_limit(p_bucket text, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attention_rate_windows;
  v_now timestamptz := now();
begin
  if p_bucket is null or length(p_bucket) = 0 or p_max is null or p_max < 1 then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext(p_bucket));
  select * into v_row from public.attention_rate_windows where bucket = p_bucket;
  if not found then
    insert into public.attention_rate_windows (bucket, hits, window_starts_at)
    values (p_bucket, 1, v_now);
    return;
  end if;
  if v_row.window_starts_at + p_window <= v_now then
    update public.attention_rate_windows
      set hits = 1, window_starts_at = v_now
      where bucket = p_bucket;
    return;
  end if;
  if v_row.hits >= p_max then
    raise exception 'Please wait a moment before trying again.';
  end if;
  update public.attention_rate_windows
    set hits = hits + 1
    where bucket = p_bucket;
end;
$$;

create or replace function public.attention_clean_website(p_url text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := trim(coalesce(p_url, ''));
  v_host text;
begin
  if v = '' or char_length(v) > 2048 or v ~ '\s' then
    return null;
  end if;
  if v !~* '^https?://' then
    return null;
  end if;
  if position('@' in v) > 0 then
    return null;
  end if;
  v_host := substring(v from '^https?://([^/?#]+)');
  if v_host is null or v_host = '' or (v_host ~ ':' and v_host !~ ':[0-9]{1,5}$') then
    return null;
  end if;
  v_host := lower(split_part(v_host, ':', 1));
  if v_host = '' or v_host in ('localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1') then
    return null;
  end if;
  if v_host !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
     and v_host !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' then
    return null;
  end if;
  return v;
end;
$$;

-- Owner content edits cannot change ranking/ownership/status fields.
create or replace function public.protect_attention_product_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), current_user) in ('authenticated', 'anon') then
    if new.owner_id is distinct from old.owner_id
       or new.current_bid is distinct from old.current_bid
       or new.click_count is distinct from old.click_count
       or new.listing_starts_at is distinct from old.listing_starts_at
       or new.listing_ends_at is distinct from old.listing_ends_at
       or new.status is distinct from old.status
       or new.slug is distinct from old.slug
       or new.created_at is distinct from old.created_at then
      raise exception 'Attention product fields cannot be changed directly';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bids: lock the product row, add the increment server-side, never trust client
-- current_bid. Same increment / minimum-increment contract as 170000.
-- ---------------------------------------------------------------------------
create or replace function public.place_attention_bid(p_product_id uuid, p_increment integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.attention_products;
  v_min integer;
  v_new integer;
  v_now timestamptz := now();
  v_bid_id uuid;
  v_rank integer;
  v_subject text := public.attention_request_subject();
begin
  if p_product_id is null then
    raise exception 'This listing has expired and cannot receive bids.';
  end if;
  if p_increment is null or p_increment <= 0 then
    raise exception 'Enter a valid bid amount.';
  end if;
  if p_increment > 100000 then
    raise exception 'Demo bids must be $100,000 or less.';
  end if;

  if v_subject is not null then
    perform public.attention_rate_limit('bid:' || p_product_id::text || ':' || v_subject, 1, interval '2 seconds');
    perform public.attention_rate_limit('bid-user:' || v_subject, 20, interval '1 minute');
  end if;
  perform public.attention_rate_limit('bid-product:' || p_product_id::text, 30, interval '1 minute');

  select * into v_product
  from public.attention_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'This listing has expired and cannot receive bids.';
  end if;

  if v_product.status is distinct from 'active'
     or v_product.listing_starts_at is null
     or v_product.listing_ends_at is null
     or v_product.listing_starts_at > v_now
     or v_product.listing_ends_at <= v_now then
    raise exception 'This listing has expired and cannot receive bids.';
  end if;

  -- Absolute bid is always locked current_bid + increment. Client cannot supply current_bid.
  v_new := v_product.current_bid + p_increment;
  if v_new > 100000 then
    raise exception 'Demo bids must be $100,000 or less.';
  end if;

  v_min := public.attention_minimum_bid(p_product_id, v_now);
  if v_min is null then
    raise exception 'This listing has expired and cannot receive bids.';
  end if;
  if p_increment < v_min then
    raise exception 'Enter at least $% to improve this product’s position.', v_min;
  end if;

  insert into public.attention_bids (product_id, bidder_id, amount, created_at)
  values (p_product_id, auth.uid(), v_new, v_now)
  returning id into v_bid_id;

  update public.attention_products
  set current_bid = v_new,
      updated_at = v_now
  where id = p_product_id;

  v_rank := public.attention_resulting_rank(p_product_id, v_new, v_now);

  insert into public.attention_activity (product_id, type, amount, rank, created_at)
  values (p_product_id, 'bid', v_new, v_rank, v_now);

  return jsonb_build_object(
    'product_id', p_product_id,
    'bid_id', v_bid_id,
    'amount', v_new,
    'current_bid', v_new,
    'resulting_rank', v_rank,
    'created_at', v_now
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Visits: atomic increment + lightweight per-subject / per-product caps
-- ---------------------------------------------------------------------------
create or replace function public.record_attention_visit(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_now timestamptz := now();
  v_subject text := public.attention_request_subject();
begin
  if p_product_id is null then
    raise exception 'Product not found.';
  end if;
  if not public.attention_product_is_public(p_product_id) then
    raise exception 'Product not found.';
  end if;

  if v_subject is not null then
    perform public.attention_rate_limit('visit:' || p_product_id::text || ':' || v_subject, 1, interval '6 seconds');
  end if;
  perform public.attention_rate_limit('visit-product:' || p_product_id::text, 90, interval '1 minute');

  update public.attention_products
  set click_count = click_count + 1,
      updated_at = v_now
  where id = p_product_id
  returning click_count into v_count;

  if v_count is null then
    raise exception 'Product not found.';
  end if;

  insert into public.attention_activity (product_id, type, created_at)
  values (p_product_id, 'visit', v_now);

  return jsonb_build_object(
    'product_id', p_product_id,
    'click_count', v_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Public listing: always owner_id null, server timestamps, stricter inputs,
-- slug unique-violation retry, short-window duplicate-submit guard.
-- ---------------------------------------------------------------------------
create or replace function public.publish_attention_listing(
  p_name text,
  p_website_url text,
  p_description text,
  p_category text,
  p_logo text,
  p_color text,
  p_initial_bid integer,
  p_brand_name text,
  p_campaign_title text default null,
  p_campaign_description text default null,
  p_campaign_requirements text default null,
  p_campaign_budget numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_id uuid := gen_random_uuid();
  v_base text;
  v_slug text;
  v_logo text;
  v_color text;
  v_brand text;
  v_rank integer;
  v_has_campaign boolean;
  v_website text;
  v_name text := trim(coalesce(p_name, ''));
  v_description text := trim(coalesce(p_description, ''));
  v_subject text := public.attention_request_subject();
  v_categories text[] := array[
    'AI Tools','SaaS','Developer Tools','Marketing','Productivity','Apps','Finance','Design','Education','Gaming','Other'
  ];
begin
  if v_subject is not null then
    perform public.attention_rate_limit('list-user:' || v_subject, 3, interval '10 minutes');
  end if;
  perform public.attention_rate_limit('list-global', 20, interval '5 minutes');

  if v_name = '' or char_length(v_name) > 80 or v_description = '' or char_length(v_description) > 500 then
    raise exception 'Add a product name, description, category, and valid website.';
  end if;
  v_website := public.attention_clean_website(p_website_url);
  if v_website is null then
    raise exception 'Add a product name, description, category, and valid website.';
  end if;
  if p_category is null or not (p_category = any (v_categories)) then
    raise exception 'Add a product name, description, category, and valid website.';
  end if;
  if p_initial_bid is null or p_initial_bid < 1 or p_initial_bid > 100000 then
    raise exception 'Initial bid must be a whole dollar between $1 and $100,000.';
  end if;

  v_has_campaign := coalesce(length(trim(p_campaign_title)), 0) > 0
                 or coalesce(length(trim(p_campaign_description)), 0) > 0
                 or coalesce(length(trim(p_campaign_requirements)), 0) > 0
                 or p_campaign_budget is not null;
  if v_has_campaign then
    if p_campaign_title is null or length(trim(p_campaign_title)) = 0 or char_length(trim(p_campaign_title)) > 100
       or p_campaign_description is null or length(trim(p_campaign_description)) = 0 or char_length(trim(p_campaign_description)) > 2000
       or p_campaign_requirements is null or length(trim(p_campaign_requirements)) = 0 or char_length(trim(p_campaign_requirements)) > 2000
       or p_campaign_budget is null or p_campaign_budget < 1 or p_campaign_budget > 100000 then
      raise exception 'Complete the optional creator opportunity, including its budget.';
    end if;
  end if;

  if exists (
    select 1
    from public.attention_products
    where lower(name) = lower(v_name)
      and website_url = v_website
      and status = 'active'
      and created_at > v_now - interval '45 seconds'
  ) then
    raise exception 'This product was just listed. Please wait before listing it again.';
  end if;

  v_brand := coalesce(nullif(trim(coalesce(p_brand_name, '')), ''), v_name, 'Brand');
  if char_length(v_brand) > 80 then
    v_brand := left(v_brand, 80);
  end if;
  v_logo := nullif(trim(coalesce(p_logo, '')), '');
  if v_logo is null then
    v_logo := left(v_name, 1);
  elsif char_length(v_logo) > 700000 then
    raise exception 'Add a product name, description, category, and valid website.';
  elsif v_logo like 'data:image/%' then
    if v_logo !~* '^data:image/(png|jpeg|jpg|webp);base64,' then
      raise exception 'Add a product name, description, category, and valid website.';
    end if;
  elsif v_logo like 'http%' then
    if public.attention_clean_website(v_logo) is null then
      raise exception 'Add a product name, description, category, and valid website.';
    end if;
  elsif char_length(v_logo) > 8 then
    raise exception 'Add a product name, description, category, and valid website.';
  end if;
  v_color := coalesce(nullif(trim(coalesce(p_color, '')), ''), '#3267e8');
  if v_color !~ '^#[0-9A-Fa-f]{6}$' then
    v_color := '#3267e8';
  end if;

  v_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_base is null or v_base = '' then
    v_base := 'product';
  end if;
  v_slug := v_base;
  if exists (select 1 from public.attention_products where slug = v_slug) then
    v_slug := v_base || '-' || substr(replace(v_id::text, '-', ''), 1, 8);
  end if;

  begin
    insert into public.attention_products (
      id, owner_id, brand_name, name, slug, logo, color, website_url, description, category, tags,
      status, listing_starts_at, listing_ends_at, current_bid, click_count,
      campaign_title, campaign_description, campaign_requirements, campaign_budget,
      created_at, updated_at
    ) values (
      v_id, null, v_brand, v_name, v_slug, v_logo, v_color, v_website, v_description, p_category, '{}',
      'active', v_now, v_now + interval '7 days', p_initial_bid, 0,
      case when v_has_campaign then trim(p_campaign_title) else null end,
      case when v_has_campaign then trim(p_campaign_description) else null end,
      case when v_has_campaign then trim(p_campaign_requirements) else null end,
      case when v_has_campaign then p_campaign_budget else null end,
      v_now, v_now
    );
  exception
    when unique_violation then
      v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      insert into public.attention_products (
        id, owner_id, brand_name, name, slug, logo, color, website_url, description, category, tags,
        status, listing_starts_at, listing_ends_at, current_bid, click_count,
        campaign_title, campaign_description, campaign_requirements, campaign_budget,
        created_at, updated_at
      ) values (
        v_id, null, v_brand, v_name, v_slug, v_logo, v_color, v_website, v_description, p_category, '{}',
        'active', v_now, v_now + interval '7 days', p_initial_bid, 0,
        case when v_has_campaign then trim(p_campaign_title) else null end,
        case when v_has_campaign then trim(p_campaign_description) else null end,
        case when v_has_campaign then trim(p_campaign_requirements) else null end,
        case when v_has_campaign then p_campaign_budget else null end,
        v_now, v_now
      );
  end;

  insert into public.attention_bids (product_id, bidder_id, amount, created_at)
  values (v_id, null, p_initial_bid, v_now);

  v_rank := public.attention_resulting_rank(v_id, p_initial_bid, v_now);

  insert into public.attention_activity (product_id, type, amount, rank, created_at)
  values (v_id, 'listing', p_initial_bid, v_rank, v_now);

  return jsonb_build_object(
    'id', v_id,
    'owner_id', null,
    'brand_name', v_brand,
    'name', v_name,
    'slug', v_slug,
    'logo', v_logo,
    'color', v_color,
    'website_url', v_website,
    'description', v_description,
    'category', p_category,
    'tags', '[]'::jsonb,
    'status', 'active',
    'listing_starts_at', v_now,
    'listing_ends_at', v_now + interval '7 days',
    'current_bid', p_initial_bid,
    'click_count', 0,
    'campaign_title', case when v_has_campaign then trim(p_campaign_title) else null end,
    'campaign_description', case when v_has_campaign then trim(p_campaign_description) else null end,
    'campaign_requirements', case when v_has_campaign then trim(p_campaign_requirements) else null end,
    'campaign_budget', case when v_has_campaign then p_campaign_budget else null end,
    'created_at', v_now,
    'resulting_rank', v_rank
  );
end;
$$;

revoke all on function public.attention_request_subject() from public, anon, authenticated;
revoke all on function public.attention_rate_limit(text, integer, interval) from public, anon, authenticated;
revoke all on function public.attention_clean_website(text) from public, anon, authenticated;
revoke all on function public.attention_minimum_bid(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.attention_resulting_rank(uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.attention_product_is_live(public.attention_products, timestamptz) from public, anon, authenticated;
revoke all on function public.set_attention_products_updated_at() from public, anon, authenticated;
revoke all on function public.protect_attention_product_fields() from public, anon, authenticated;

revoke all on function public.place_attention_bid(uuid, integer) from public;
grant execute on function public.place_attention_bid(uuid, integer) to anon, authenticated;
revoke all on function public.record_attention_visit(uuid) from public;
grant execute on function public.record_attention_visit(uuid) to anon, authenticated;
revoke all on function public.publish_attention_listing(text, text, text, text, text, text, integer, text, text, text, text, numeric) from public;
grant execute on function public.publish_attention_listing(text, text, text, text, text, text, integer, text, text, text, text, numeric) to anon, authenticated;
revoke all on function public.attention_product_is_public(uuid) from public;
grant execute on function public.attention_product_is_public(uuid) to anon, authenticated;

-- Direct table writes remain RPC-only. Reassert grants.
revoke insert, update, delete, truncate on table public.attention_products from anon, public;
revoke insert, update, delete, truncate on table public.attention_bids from anon, public;
revoke insert, update, delete, truncate on table public.attention_activity from anon, public;
grant select on table public.attention_products to anon, authenticated;
grant select on table public.attention_bids to anon, authenticated;
grant select on table public.attention_activity to anon, authenticated;
grant update (
  name,
  logo,
  color,
  website_url,
  description,
  category,
  tags,
  campaign_title,
  campaign_description,
  campaign_requirements,
  campaign_budget
) on table public.attention_products to authenticated;
