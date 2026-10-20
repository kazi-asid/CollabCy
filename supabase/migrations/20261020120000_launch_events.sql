-- Anonymous LaunchEvent drafts use a server-issued, hashed owner token.
-- Apply only after reviewing this migration against the target Supabase project.

create table if not exists public.launch_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  product_name text not null,
  website_url text not null,
  description text not null default '',
  category text not null default 'Other',
  logo text not null default '',
  banner_url text not null default '',
  video_url text not null default '',
  screenshots text[] not null default '{}',
  launch_at timestamptz not null,
  duration_days integer not null check (duration_days between 7 and 90),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'live', 'ended', 'hidden')),
  manage_token_hash text not null check (manage_token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists launch_events_public_idx on public.launch_events (launch_at, status) where status in ('scheduled', 'live', 'ended');

create or replace function public.set_launch_events_updated_at() returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists launch_events_set_updated_at on public.launch_events;
create trigger launch_events_set_updated_at before update on public.launch_events for each row execute procedure public.set_launch_events_updated_at();

alter table public.launch_events enable row level security;
drop policy if exists "launch_events_public_select" on public.launch_events;
create policy "launch_events_public_select" on public.launch_events for select to anon, authenticated using (status in ('scheduled', 'live', 'ended'));
revoke all on table public.launch_events from public, anon, authenticated;
grant select (id, slug, product_name, website_url, description, category, logo, banner_url, video_url, screenshots, launch_at, duration_days, status, created_at, updated_at) on table public.launch_events to anon, authenticated;
grant all on table public.launch_events to service_role;
