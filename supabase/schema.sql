-- ========================================================================
-- ROUTINE-NAEM: Supabase Schema for Schedule Storage
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ========================================================================

-- 1. Create the schedules table
create table if not exists public.schedules (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2. Enable Row Level Security (RLS)
alter table public.schedules enable row level security;

-- 3. Create RLS Policies allowing public read & write access
-- (You can restrict these policies later if you add user authentication)
drop policy if exists "Allow public read schedules" on public.schedules;
create policy "Allow public read schedules"
  on public.schedules
  for select
  using (true);

drop policy if exists "Allow public insert schedules" on public.schedules;
create policy "Allow public insert schedules"
  on public.schedules
  for insert
  with check (true);

drop policy if exists "Allow public update schedules" on public.schedules;
create policy "Allow public update schedules"
  on public.schedules
  for update
  using (true)
  with check (true);

-- 4. Enable Realtime updates (enables live sync across multiple tabs/devices)
alter publication supabase_realtime add table public.schedules;
