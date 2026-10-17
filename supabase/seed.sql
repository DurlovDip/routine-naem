-- ========================================================================
-- ROUTINE-NAEM: Seed Data Script
-- Populates Teachers, Modules, Batches, and the Schedule Document.
-- ========================================================================

-- 1. Ensure Relational Tables Exist
create table if not exists public.teachers (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.teachers enable row level security;
drop policy if exists "Allow public all teachers" on public.teachers;
create policy "Allow public all teachers" on public.teachers for all using (true) with check (true);

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

-- Recreate Batches table with integer id, default blank name, and default 40 number_of_students
drop table if exists public.batches cascade;

create table public.batches (
  id integer primary key,
  name text not null default '',
  number_of_students integer not null default 40,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.batches enable row level security;
drop policy if exists "Allow public all batches" on public.batches;
create policy "Allow public all batches" on public.batches for all using (true) with check (true);

create table if not exists public.schedules (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.schedules enable row level security;
drop policy if exists "Allow public all schedules" on public.schedules;
create policy "Allow public all schedules" on public.schedules for all using (true) with check (true);

-- 2. Ensure Realtime publication is configured
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
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'schedules') then
    alter publication supabase_realtime add table public.schedules;
  end if;
end $$;


-- 3. Seed Teachers Table
insert into public.teachers (id, name) values
  ('teacher-1', 'Prof. Asisul'),
  ('teacher-2', 'Md. Sazzad Ali'),
  ('teacher-3', 'Muhammad Yeakub Ali'),
  ('teacher-4', 'Mst. Arifa Tazrimin'),
  ('teacher-5', 'Md. Jahangir Alom'),
  ('teacher-6', 'Prof. Rukhshana'),
  ('teacher-7', 'Prof. Nilufar'),
  ('teacher-8', 'Ms. Ayesa'),
  ('teacher-9', 'Mr. S. Mahbub'),
  ('teacher-10', 'Dr. Rahman'),
  ('teacher-11', 'Mr. M. Ali'),
  ('teacher-12', 'Mr. Ariful'),
  ('teacher-13', 'Dr. Nuruzzaman'),
  ('teacher-14', 'Ms. Zinan'),
  ('teacher-15', 'Ms. Arifa'),
  ('teacher-16', 'Dr. Ayet')
on conflict (id) do update set name = excluded.name, updated_at = now();


-- 4. Seed Modules Table
insert into public.modules (id, code, title) values
  ('module-1', 'M- 7.04', '(Theory)'),
  ('module-2', 'M- 7.04', 'TPP (Theory & Practice)'),
  ('module-3', 'M- 7.04', '(Practice & Presentation)'),
  ('module-4', 'M- 1.06', ''),
  ('module-5', 'M- 1.08', ''),
  ('module-6', 'M- 3.02', ''),
  ('module-7', 'M- 3.05', ''),
  ('module-8', 'M- 5.01', ''),
  ('module-9', 'M- 5.06', ''),
  ('module-10', 'M- 6.01', ''),
  ('module-11', 'M- 8.03', ''),
  ('module-12', 'M- 8.07', ''),
  ('module-13', 'M- 8.08', ''),
  ('module-14', 'M- 8.10', '')
on conflict (id) do update set code = excluded.code, title = excluded.title, updated_at = now();


-- 5. Seed Batches Table (id: number, name: default blank, number_of_students: 40)
insert into public.batches (id, name, number_of_students) values
  (9, '', 40),
  (10, '', 40),
  (11, '', 40),
  (12, '', 40),
  (13, '', 40)
on conflict (id) do update set
  name = excluded.name,
  number_of_students = excluded.number_of_students,
  updated_at = now();
