-- place_attention_bid / record_attention_visit are SECURITY DEFINER. auth.role()
-- still returns the caller's JWT role (anon/authenticated) inside those functions,
-- so the hardening trigger blocked current_bid and click_count updates and the
-- bid transaction rolled back. current_user is the function owner during RPC
-- writes, and remains anon/authenticated for direct client UPDATEs.

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

revoke all on function public.protect_attention_product_fields() from public, anon, authenticated;

revoke all on function public.place_attention_bid(uuid, integer) from public;
grant execute on function public.place_attention_bid(uuid, integer) to anon, authenticated;
