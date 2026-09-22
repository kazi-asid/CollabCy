-- Brands may browse the creator directory only after creating at least one
-- campaign. current_user_is_brand() stays unchanged so Attention Marketplace
-- and other brand-only features are not affected.

create or replace function public.current_brand_can_browse_creators()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_brand()
    and exists (
      select 1
      from public.campaigns
      where user_id = auth.uid()
    );
$$;

revoke all on function public.current_brand_can_browse_creators() from public, anon;
grant execute on function public.current_brand_can_browse_creators() to authenticated;

drop policy if exists "social_accounts_select_discoverable" on public.social_accounts;
create policy "social_accounts_select_discoverable"
  on public.social_accounts
  for select
  to authenticated
  using (
    public.current_brand_can_browse_creators()
    and public.creator_is_publicly_listed(social_accounts.user_id)
  );

drop view if exists public.public_creators;
create view public.public_creators
with (security_invoker = false)
as
select
  p.user_id,
  p.role,
  p.name,
  p.bio,
  p.handle,
  p.website,
  p.niche,
  p.platforms,
  p.followers,
  p.impressions,
  p.rate,
  p.location,
  p.available,
  p.avatar,
  p.portfolio,
  p.created_at
from public.profiles p
where p.role = 'creator'
  and public.current_brand_can_browse_creators();

comment on view public.public_creators is
  'Brand-facing creator directory. Visible only to authenticated brands who have created at least one campaign. Omits email and auth metadata.';

revoke all on public.public_creators from anon, public;
grant select on public.public_creators to authenticated;
