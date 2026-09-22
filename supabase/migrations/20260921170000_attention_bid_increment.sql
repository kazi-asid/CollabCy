-- Attention Marketplace: user-facing bids are increments; current_bid stays absolute.
-- Apply after 20260921160000_attention_marketplace.sql.
-- Does not alter table shapes. Payment/Stripe is not implemented.

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

  return coalesce(v_prev, v_own) - v_own + 1;
end;
$$;

drop function if exists public.place_attention_bid(uuid, integer);

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
begin
  if p_product_id is null then
    raise exception 'This listing has expired and cannot receive bids.';
  end if;
  if p_increment is null or p_increment <= 0 then
    raise exception 'Enter a valid bid amount.';
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

revoke all on function public.place_attention_bid(uuid, integer) from public;
grant execute on function public.place_attention_bid(uuid, integer) to anon, authenticated;
