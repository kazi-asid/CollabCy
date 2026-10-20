-- Public creator records contain only creator-approved profile fields.
-- Ownership is enforced by RLS and the server additionally validates the bearer token.

create table if not exists public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,32}$'),
  display_name text not null,
  bio text not null default '',
  niche text not null default 'Other',
  location text not null default '',
  x_handle text not null default '',
  avatar_url text not null default '',
  available boolean not null default true,
  starting_rate integer check (starting_rate is null or starting_rate between 0 and 100000),
  platforms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_profiles_directory_idx on public.creator_profiles (created_at desc);
create or replace function public.set_creator_profiles_updated_at() returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists creator_profiles_set_updated_at on public.creator_profiles;
create trigger creator_profiles_set_updated_at before update on public.creator_profiles for each row execute procedure public.set_creator_profiles_updated_at();

alter table public.creator_profiles enable row level security;
drop policy if exists "creator_profiles_public_select" on public.creator_profiles;
create policy "creator_profiles_public_select" on public.creator_profiles for select to anon, authenticated using (true);
drop policy if exists "creator_profiles_insert_own" on public.creator_profiles;
create policy "creator_profiles_insert_own" on public.creator_profiles for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "creator_profiles_update_own" on public.creator_profiles;
create policy "creator_profiles_update_own" on public.creator_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on table public.creator_profiles from public;
grant select (id, handle, display_name, bio, niche, location, x_handle, avatar_url, available, starting_rate, platforms, created_at) on table public.creator_profiles to anon, authenticated;
grant insert, update on table public.creator_profiles to authenticated;
grant all on table public.creator_profiles to service_role;
