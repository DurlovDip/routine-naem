-- ========================================================================
-- INCREMENTAL MIGRATION: Relational Tables (Teachers, Modules & Batches)
-- Modules schema: id (integer), module_number, module_subnumber, module_name (default blank)
-- Batches schema: id (integer), name (default blank), number_of_students (default 40)
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
-- id: number, module_number, module_subnumber, module_name (can be blank initially)
drop table if exists public.modules cascade;

create table public.modules (
  id integer primary key,
  module_number text not null,
  module_subnumber text not null default '',
  module_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.modules enable row level security;
drop policy if exists "Allow public all modules" on public.modules;
create policy "Allow public all modules" on public.modules for all using (true) with check (true);

-- 3. Batches Table
-- id is integer, name is default blank, number_of_students default 40
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

-- 4. Enable Realtime Replication
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

-- 5. Seed Teachers
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

-- 6. Seed Modules (id: number, module_number, module_subnumber, module_name)
insert into public.modules (id, module_number, module_subnumber, module_name) values
  (1, '7', '04', 'Theory'),
  (2, '7', '04', 'TPP (Theory & Practice)'),
  (3, '7', '04', 'Practice & Presentation'),
  (4, '1', '06', ''),
  (5, '1', '08', ''),
  (6, '3', '02', ''),
  (7, '3', '05', ''),
  (8, '5', '01', ''),
  (9, '5', '06', ''),
  (10, '6', '01', ''),
  (11, '8', '03', ''),
  (12, '8', '07', ''),
  (13, '8', '08', ''),
  (14, '8', '10', '')
on conflict (id) do update set
  module_number = excluded.module_number,
  module_subnumber = excluded.module_subnumber,
  module_name = excluded.module_name,
  updated_at = now();

-- 7. Seed Batches (id: number, name: default blank, number_of_students: 40)
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
