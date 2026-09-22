-- CollabCy Attention Marketplace: products, bids, activity, and guest-capable RPCs.
-- Apply this in the Supabase SQL editor. Does not alter existing tables.
-- Bids are database-backed simulated bids. Payment/Stripe is not implemented.

create table if not exists public.attention_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  brand_name text not null,
  name text not null,
  slug text not null unique,
  logo text,
  color text,
  website_url text not null,
  description text not null,
  category text not null,
  tags text[] not null default '{}',
  status text not null default 'draft',
  listing_starts_at timestamptz,
  listing_ends_at timestamptz,
  current_bid integer not null default 0,
  click_count integer not null default 0,
  campaign_title text,
  campaign_description text,
  campaign_requirements text,
  campaign_budget numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attention_products_status_check check (status in ('draft', 'active', 'expired', 'hidden')),
  constraint attention_products_current_bid_check check (current_bid >= 0),
  constraint attention_products_click_count_check check (click_count >= 0)
);

create index if not exists attention_products_status_ends_idx
  on public.attention_products (status, listing_ends_at);
create index if not exists attention_products_owner_id_idx
  on public.attention_products (owner_id);
create index if not exists attention_products_category_idx
  on public.attention_products (category);
create index if not exists attention_products_current_bid_idx
  on public.attention_products (current_bid desc);

create table if not exists public.attention_bids (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.attention_products (id) on delete cascade,
  bidder_id uuid null references auth.users (id) on delete set null,
  amount integer not null,
  created_at timestamptz not null default now(),
  constraint attention_bids_amount_check check (amount >= 1 and amount <= 100000)
);

create index if not exists attention_bids_product_created_idx
  on public.attention_bids (product_id, created_at desc);

create table if not exists public.attention_activity (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.attention_products (id) on delete cascade,
  type text not null,
  amount integer null,
  rank integer null,
  created_at timestamptz not null default now(),
  constraint attention_activity_type_check check (type in ('listing', 'bid', 'visit'))
);

create index if not exists attention_activity_created_idx
  on public.attention_activity (created_at desc);
create index if not exists attention_activity_product_created_idx
  on public.attention_activity (product_id, created_at desc);

create or replace function public.set_attention_products_updated_at()
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

drop trigger if exists attention_products_set_updated_at on public.attention_products;
create trigger attention_products_set_updated_at
before update on public.attention_products
for each row
execute procedure public.set_attention_products_updated_at();

create or replace function public.protect_attention_product_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
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

drop trigger if exists attention_products_protect_fields on public.attention_products;
create trigger attention_products_protect_fields
before update on public.attention_products
for each row
execute procedure public.protect_attention_product_fields();

create or replace function public.attention_product_is_live(p public.attention_products, p_now timestamptz default now())
returns boolean
language sql
stable
set search_path = public
as $$
  select p.status = 'active'
     and p.listing_starts_at is not null
     and p.listing_ends_at is not null
     and p.listing_starts_at <= p_now
     and p.listing_ends_at > p_now;
$$;

create or replace function public.attention_product_is_public(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attention_products
    where id = p_id
      and status in ('active', 'expired')
  );
$$;

revoke all on function public.attention_product_is_public(uuid) from public;
grant execute on function public.attention_product_is_public(uuid) to anon, authenticated;

create or replace function public.attention_resulting_rank(p_product_id uuid, p_amount integer, p_now timestamptz default now())
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer + 1
  from public.attention_products p
  where p.id is distinct from p_product_id
    and p.status = 'active'
    and p.listing_starts_at is not null
    and p.listing_ends_at is not null
    and p.listing_starts_at <= p_now
    and p.listing_ends_at > p_now
    and p.current_bid >= p_amount;
$$;

create or replace function public.attention_minimum_bid(p_product_id uuid, p_now timestamptz default now())
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_own integer;
  v_prev integer;
  v_rn integer;
begin
  with live as (
    select
      p.id,
      p.current_bid,
      coalesce(
        (select max(b.created_at) from public.attention_bids b where b.product_id = p.id),
        p.listing_starts_at
      ) as tie_ts
    from public.attention_products p
    where p.status = 'active'
      and p.listing_starts_at is not null
      and p.listing_ends_at is not null
      and p.listing_starts_at <= p_now
      and p.listing_ends_at > p_now
  ),
  ranked as (
    select
      id,
      current_bid,
      row_number() over (order by current_bid desc, tie_ts asc, id::text asc) as rn
    from live
  )
  select r.current_bid, r.rn, prev.current_bid
    into v_own, v_rn, v_prev
  from ranked r
  left join ranked prev on prev.rn = r.rn - 1
  where r.id = p_product_id;

  if v_rn is null then
    return null;
  end if;

  return greatest(v_own, coalesce(v_prev, 0)) + 1;
end;
$$;

create or replace function public.place_attention_bid(p_product_id uuid, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.attention_products;
  v_min integer;
  v_now timestamptz := now();
  v_bid_id uuid;
  v_rank integer;
begin
  if p_product_id is null then
    raise exception 'This listing has expired and cannot receive bids.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter a valid bid amount.';
  end if;
  if p_amount > 100000 then
    raise exception 'Demo bids must be $100,000 or less.';
  end if;

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

  v_min := public.attention_minimum_bid(p_product_id, v_now);
  if v_min is null then
    raise exception 'This listing has expired and cannot receive bids.';
  end if;
  if p_amount < v_min then
    raise exception 'Enter at least $% to improve this product’s position.', v_min;
  end if;

  insert into public.attention_bids (product_id, bidder_id, amount, created_at)
  values (p_product_id, auth.uid(), p_amount, v_now)
  returning id into v_bid_id;

  update public.attention_products
  set current_bid = p_amount,
      updated_at = v_now
  where id = p_product_id;

  v_rank := public.attention_resulting_rank(p_product_id, p_amount, v_now);

  insert into public.attention_activity (product_id, type, amount, rank, created_at)
  values (p_product_id, 'bid', p_amount, v_rank, v_now);

  return jsonb_build_object(
    'product_id', p_product_id,
    'bid_id', v_bid_id,
    'amount', p_amount,
    'current_bid', p_amount,
    'resulting_rank', v_rank,
    'created_at', v_now
  );
end;
$$;

revoke all on function public.place_attention_bid(uuid, integer) from public;
grant execute on function public.place_attention_bid(uuid, integer) to anon, authenticated;

create or replace function public.record_attention_visit(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_now timestamptz := now();
begin
  if p_product_id is null or not public.attention_product_is_public(p_product_id) then
    raise exception 'Product not found.';
  end if;

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

revoke all on function public.record_attention_visit(uuid) from public;
grant execute on function public.record_attention_visit(uuid) to anon, authenticated;

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
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_id uuid := gen_random_uuid();
  v_base text;
  v_slug text;
  v_logo text;
  v_color text;
  v_brand text;
  v_rank integer;
  v_has_campaign boolean;
  v_categories text[] := array[
    'AI Tools','SaaS','Developer Tools','Marketing','Productivity','Apps','Finance','Design','Education','Gaming','Other'
  ];
begin
  if v_user is null then
    raise exception 'Sign in as a brand to list a product.';
  end if;
  if not public.current_user_is_brand() then
    raise exception 'Only brand accounts can list Attention products.';
  end if;

  if p_name is null or length(trim(p_name)) = 0 or p_description is null or length(trim(p_description)) = 0 then
    raise exception 'Add a product name, description, category, and valid website.';
  end if;
  if p_website_url is null
     or (p_website_url not like 'http://%' and p_website_url not like 'https://%') then
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
    if p_campaign_title is null or length(trim(p_campaign_title)) = 0
       or p_campaign_description is null or length(trim(p_campaign_description)) = 0
       or p_campaign_requirements is null or length(trim(p_campaign_requirements)) = 0
       or p_campaign_budget is null or p_campaign_budget < 1 then
      raise exception 'Complete the optional creator opportunity, including its budget.';
    end if;
  end if;

  v_brand := nullif(trim(coalesce(p_brand_name, '')), '');
  if v_brand is null then
    select nullif(trim(name), '') into v_brand
    from public.profiles
    where user_id = v_user and role = 'brand'
    limit 1;
  end if;
  v_brand := coalesce(v_brand, 'Brand');

  v_logo := nullif(trim(coalesce(p_logo, '')), '');
  if v_logo is null then
    v_logo := left(trim(p_name), 1);
  end if;
  v_color := coalesce(nullif(trim(coalesce(p_color, '')), ''), '#3267e8');

  v_base := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_base is null or v_base = '' then
    v_base := 'product';
  end if;
  v_slug := v_base;
  if exists (select 1 from public.attention_products where slug = v_slug) then
    v_slug := v_base || '-' || substr(replace(v_id::text, '-', ''), 1, 8);
  end if;

  insert into public.attention_products (
    id, owner_id, brand_name, name, slug, logo, color, website_url, description, category, tags,
    status, listing_starts_at, listing_ends_at, current_bid, click_count,
    campaign_title, campaign_description, campaign_requirements, campaign_budget,
    created_at, updated_at
  ) values (
    v_id, v_user, v_brand, trim(p_name), v_slug, v_logo, v_color, p_website_url, trim(p_description), p_category, '{}',
    'active', v_now, v_now + interval '7 days', p_initial_bid, 0,
    case when v_has_campaign then trim(p_campaign_title) else null end,
    case when v_has_campaign then trim(p_campaign_description) else null end,
    case when v_has_campaign then trim(p_campaign_requirements) else null end,
    case when v_has_campaign then p_campaign_budget else null end,
    v_now, v_now
  );

  insert into public.attention_bids (product_id, bidder_id, amount, created_at)
  values (v_id, v_user, p_initial_bid, v_now);

  v_rank := public.attention_resulting_rank(v_id, p_initial_bid, v_now);

  insert into public.attention_activity (product_id, type, amount, rank, created_at)
  values (v_id, 'listing', p_initial_bid, v_rank, v_now);

  return jsonb_build_object(
    'id', v_id,
    'owner_id', v_user,
    'brand_name', v_brand,
    'name', trim(p_name),
    'slug', v_slug,
    'logo', v_logo,
    'color', v_color,
    'website_url', p_website_url,
    'description', trim(p_description),
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

revoke all on function public.publish_attention_listing(text, text, text, text, text, text, integer, text, text, text, text, numeric) from public, anon;
grant execute on function public.publish_attention_listing(text, text, text, text, text, text, integer, text, text, text, text, numeric) to authenticated;

alter table public.attention_products enable row level security;
alter table public.attention_bids enable row level security;
alter table public.attention_activity enable row level security;

drop policy if exists "attention_products_select_public" on public.attention_products;
create policy "attention_products_select_public"
  on public.attention_products
  for select
  to anon, authenticated
  using (status in ('active', 'expired') or owner_id = auth.uid());

drop policy if exists "attention_products_update_owner" on public.attention_products;
create policy "attention_products_update_owner"
  on public.attention_products
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "attention_bids_select_public" on public.attention_bids;
create policy "attention_bids_select_public"
  on public.attention_bids
  for select
  to anon, authenticated
  using (public.attention_product_is_public(product_id) or exists (
    select 1 from public.attention_products p
    where p.id = product_id and p.owner_id = auth.uid()
  ));

drop policy if exists "attention_activity_select_public" on public.attention_activity;
create policy "attention_activity_select_public"
  on public.attention_activity
  for select
  to anon, authenticated
  using (public.attention_product_is_public(product_id) or exists (
    select 1 from public.attention_products p
    where p.id = product_id and p.owner_id = auth.uid()
  ));

revoke all on table public.attention_products from anon, public;
revoke all on table public.attention_bids from anon, public;
revoke all on table public.attention_activity from anon, public;

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

do $$
begin
  begin
    alter publication supabase_realtime add table public.attention_products;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.attention_bids;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.attention_activity;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
