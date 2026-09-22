-- CollabCy profiles: one row per (auth user, role).
-- Apply this in the Supabase SQL editor or with the Supabase CLI.
-- Public/anon key only from the browser; RLS enforces ownership.

create table if not exists public.profiles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('creator', 'brand')),
  name text not null default '',
  email text not null default '',
  bio text not null default '',
  handle text not null default '',
  website text not null default '',
  niche text not null default '',
  platforms text[] not null default '{}',
  followers integer not null default 0,
  impressions integer not null default 0,
  rate integer not null default 50,
  location text not null default '',
  available boolean not null default true,
  avatar text,
  portfolio text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.set_profiles_updated_at()
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

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute procedure public.set_profiles_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.profiles from anon, public;
grant select, insert, update on table public.profiles to authenticated;
