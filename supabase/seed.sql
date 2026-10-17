-- ========================================================================
-- ROUTINE-NAEM: Seed Data Script
-- Populates Teachers, Modules, Batches, and the Schedule Document.
-- ========================================================================

-- 1. Ensure Relational Tables Exist
create table if not exists public.teachers (
  id text primary key,
  name text not null,
  designation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.teachers add column if not exists designation text not null default '';
alter table public.teachers enable row level security;
drop policy if exists "Allow public all teachers" on public.teachers;
create policy "Allow public all teachers" on public.teachers for all using (true) with check (true);

-- Recreate Modules table with id, module_number, module_subnumber, module_name
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


-- 4. Seed Modules Table (id: integer, module_number, module_subnumber, module_name)
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

-- 6. RAID-Style Immutable Backup Schema & Table
create schema if not exists backup;

-- Disk 1: backup.records (in dedicated backup schema)
create table if not exists backup.records (
  id bigserial primary key,
  type text not null check (type in ('teachers', 'batches', 'modules', 'schedules')),
  record_id text,
  data jsonb not null,
  operation text not null default 'SNAPSHOT',
  created_at timestamptz not null default now()
);

create index if not exists idx_backup_records_type on backup.records (type);
create index if not exists idx_backup_records_record_id on backup.records (record_id);
create index if not exists idx_backup_records_created_at on backup.records (created_at desc);

-- Disk 2: public.backups (in public schema for Supabase Table Editor & UI access)
create table if not exists public.backups (
  id bigserial primary key,
  type text not null check (type in ('teachers', 'batches', 'modules', 'schedules')),
  record_id text,
  data jsonb not null,
  operation text not null default 'SNAPSHOT',
  created_at timestamptz not null default now()
);

create index if not exists idx_public_backups_type on public.backups (type);
create index if not exists idx_public_backups_record_id on public.backups (record_id);
create index if not exists idx_public_backups_created_at on public.backups (created_at desc);

-- Row Level Security: Immutable append-only design
alter table backup.records enable row level security;

alter table public.backups enable row level security;
drop policy if exists "Allow public read backups" on public.backups;
create policy "Allow public read backups" on public.backups for select using (true);
drop policy if exists "Allow public insert backups" on public.backups;
create policy "Allow public insert backups" on public.backups for insert with check (true);
-- No UPDATE or DELETE policies: Cannot be deleted without direct database access.

create or replace function public.backup_record_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  rec_type text;
  rec_id text;
  rec_data jsonb;
begin
  rec_type := TG_TABLE_NAME;
  if (TG_OP = 'DELETE') then
    rec_id := coalesce(OLD.id::text, '');
    rec_data := to_jsonb(OLD);
    insert into backup.records (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, 'DELETE', now());
    insert into public.backups (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, 'DELETE', now());
    return OLD;
  else
    rec_id := coalesce(NEW.id::text, '');
    rec_data := to_jsonb(NEW);
    insert into backup.records (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, TG_OP, now());
    insert into public.backups (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, TG_OP, now());
    return NEW;
  end if;
end;
$$;

drop trigger if exists trg_backup_teachers on public.teachers;
create trigger trg_backup_teachers after insert or update or delete on public.teachers
  for each row execute function public.backup_record_trigger();

drop trigger if exists trg_backup_modules on public.modules;
create trigger trg_backup_modules after insert or update or delete on public.modules
  for each row execute function public.backup_record_trigger();

drop trigger if exists trg_backup_batches on public.batches;
create trigger trg_backup_batches after insert or update or delete on public.batches
  for each row execute function public.backup_record_trigger();

drop trigger if exists trg_backup_schedules on public.schedules;
create trigger trg_backup_schedules after insert or update or delete on public.schedules
  for each row execute function public.backup_record_trigger();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'backups') then
    alter publication supabase_realtime add table public.backups;
  end if;
end $$;

-- 7. Snapshot existing data into backups
insert into backup.records (type, record_id, data, operation, created_at)
select 'teachers', id::text, to_jsonb(t), 'SNAPSHOT', now() from public.teachers t
where not exists (select 1 from backup.records b where b.type = 'teachers' and b.record_id = t.id::text);

insert into public.backups (type, record_id, data, operation, created_at)
select 'teachers', id::text, to_jsonb(t), 'SNAPSHOT', now() from public.teachers t
where not exists (select 1 from public.backups b where b.type = 'teachers' and b.record_id = t.id::text);

insert into backup.records (type, record_id, data, operation, created_at)
select 'modules', id::text, to_jsonb(m), 'SNAPSHOT', now() from public.modules m
where not exists (select 1 from backup.records b where b.type = 'modules' and b.record_id = m.id::text);

insert into public.backups (type, record_id, data, operation, created_at)
select 'modules', id::text, to_jsonb(m), 'SNAPSHOT', now() from public.modules m
where not exists (select 1 from public.backups b where b.type = 'modules' and b.record_id = m.id::text);

insert into backup.records (type, record_id, data, operation, created_at)
select 'batches', id::text, to_jsonb(b), 'SNAPSHOT', now() from public.batches b
where not exists (select 1 from backup.records b where b.type = 'batches' and b.record_id = b.id::text);

insert into public.backups (type, record_id, data, operation, created_at)
select 'batches', id::text, to_jsonb(b), 'SNAPSHOT', now() from public.batches b
where not exists (select 1 from public.backups b where b.type = 'batches' and b.record_id = b.id::text);

insert into backup.records (type, record_id, data, operation, created_at)
select 'schedules', id::text, to_jsonb(s), 'SNAPSHOT', now() from public.schedules s
where not exists (select 1 from backup.records b where b.type = 'schedules' and b.record_id = s.id::text);

insert into public.backups (type, record_id, data, operation, created_at)
select 'schedules', id::text, to_jsonb(s), 'SNAPSHOT', now() from public.schedules s
where not exists (select 1 from public.backups b where b.type = 'schedules' and b.record_id = s.id::text);


