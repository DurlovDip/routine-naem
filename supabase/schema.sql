-- ========================================================================
-- ROUTINE-NAEM: Supabase Relational Schema
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ========================================================================

-- 1. Teachers Table
create table if not exists public.teachers (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.teachers enable row level security;

drop policy if exists "Allow public read teachers" on public.teachers;
create policy "Allow public read teachers"
  on public.teachers for select using (true);

drop policy if exists "Allow public insert teachers" on public.teachers;
create policy "Allow public insert teachers"
  on public.teachers for insert with check (true);

drop policy if exists "Allow public update teachers" on public.teachers;
create policy "Allow public update teachers"
  on public.teachers for update using (true) with check (true);

drop policy if exists "Allow public delete teachers" on public.teachers;
create policy "Allow public delete teachers"
  on public.teachers for delete using (true);


-- 2. Modules Table
create table if not exists public.modules (
  id text primary key,
  code text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.modules enable row level security;

drop policy if exists "Allow public read modules" on public.modules;
create policy "Allow public read modules"
  on public.modules for select using (true);

drop policy if exists "Allow public insert modules" on public.modules;
create policy "Allow public insert modules"
  on public.modules for insert with check (true);

drop policy if exists "Allow public update modules" on public.modules;
create policy "Allow public update modules"
  on public.modules for update using (true) with check (true);

drop policy if exists "Allow public delete modules" on public.modules;
create policy "Allow public delete modules"
  on public.modules for delete using (true);


-- 3. Batches Table
create table if not exists public.batches (
  id text primary key,
  name text not null,
  roster text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.batches enable row level security;

drop policy if exists "Allow public read batches" on public.batches;
create policy "Allow public read batches"
  on public.batches for select using (true);

drop policy if exists "Allow public insert batches" on public.batches;
create policy "Allow public insert batches"
  on public.batches for insert with check (true);

drop policy if exists "Allow public update batches" on public.batches;
create policy "Allow public update batches"
  on public.batches for update using (true) with check (true);

drop policy if exists "Allow public delete batches" on public.batches;
create policy "Allow public delete batches"
  on public.batches for delete using (true);


-- 4. Schedules Table (stores the full routine schedule, days, grid cells, and headers)
create table if not exists public.schedules (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.schedules enable row level security;

drop policy if exists "Allow public read schedules" on public.schedules;
create policy "Allow public read schedules"
  on public.schedules for select using (true);

drop policy if exists "Allow public insert schedules" on public.schedules;
create policy "Allow public insert schedules"
  on public.schedules for insert with check (true);

drop policy if exists "Allow public update schedules" on public.schedules;
create policy "Allow public update schedules"
  on public.schedules for update using (true) with check (true);

drop policy if exists "Allow public delete schedules" on public.schedules;
create policy "Allow public delete schedules"
  on public.schedules for delete using (true);


-- 5. Safe Realtime publication addition (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teachers'
  ) then
    alter publication supabase_realtime add table public.teachers;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'modules'
  ) then
    alter publication supabase_realtime add table public.modules;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'batches'
  ) then
    alter publication supabase_realtime add table public.batches;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'schedules'
  ) then
    alter publication supabase_realtime add table public.schedules;
  end if;
end $$;
