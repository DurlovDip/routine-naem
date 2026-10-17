-- ========================================================================
-- INCREMENTAL MIGRATION: Add Teachers, Modules & Batches
-- Run this if you already executed the previous schema.sql for schedules.
-- ========================================================================

-- 1. Teachers Table
create table if not exists public.teachers (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.teachers enable row level security;
drop policy if exists "Allow public all teachers" on public.teachers;
create policy "Allow public all teachers" on public.teachers for all using (true) with check (true);

-- 2. Modules Table
create table if not exists public.modules (
  id text primary key,
  code text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.modules enable row level security;
drop policy if exists "Allow public all modules" on public.modules;
create policy "Allow public all modules" on public.modules for all using (true) with check (true);

-- 3. Batches Table
create table if not exists public.batches (
  id text primary key,
  name text not null,
  roster text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.batches enable row level security;
drop policy if exists "Allow public all batches" on public.batches;
create policy "Allow public all batches" on public.batches for all using (true) with check (true);

-- 4. Enable Realtime for the new tables safely
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'teachers') then
    alter publication supabase_realtime add table public.teachers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'modules') then
    alter publication supabase_realtime add table public.modules;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'batches') then
    alter publication supabase_realtime add table public.batches;
  end if;
end $$;
