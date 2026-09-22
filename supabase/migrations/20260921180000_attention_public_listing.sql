-- Attention Marketplace: public/anonymous listing. No login required.
-- Apply after 20260921170000_attention_bid_increment.sql.
-- Does not recreate tables. Payment/Stripe is not implemented.

alter table public.attention_products
  alter column owner_id drop not null;

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
  v_categories text[] := array[
    'AI Tools','SaaS','Developer Tools','Marketing','Productivity','Apps','Finance','Design','Education','Gaming','Other'
  ];
begin
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

  v_brand := coalesce(nullif(trim(coalesce(p_brand_name, '')), ''), nullif(trim(p_name), ''), 'Brand');
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
    v_id, null, v_brand, trim(p_name), v_slug, v_logo, v_color, p_website_url, trim(p_description), p_category, '{}',
    'active', v_now, v_now + interval '7 days', p_initial_bid, 0,
    case when v_has_campaign then trim(p_campaign_title) else null end,
    case when v_has_campaign then trim(p_campaign_description) else null end,
    case when v_has_campaign then trim(p_campaign_requirements) else null end,
    case when v_has_campaign then p_campaign_budget else null end,
    v_now, v_now
  );

  insert into public.attention_bids (product_id, bidder_id, amount, created_at)
  values (v_id, null, p_initial_bid, v_now);

  v_rank := public.attention_resulting_rank(v_id, p_initial_bid, v_now);

  insert into public.attention_activity (product_id, type, amount, rank, created_at)
  values (v_id, 'listing', p_initial_bid, v_rank, v_now);

  return jsonb_build_object(
    'id', v_id,
    'owner_id', null,
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

revoke all on function public.publish_attention_listing(text, text, text, text, text, text, integer, text, text, text, text, numeric) from public;
grant execute on function public.publish_attention_listing(text, text, text, text, text, text, integer, text, text, text, text, numeric) to anon, authenticated;
