-- ========================================================================
-- ROUTINE-NAEM: RAID-Style Immutable Backup Schema & Triggers
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ========================================================================

-- 1. Create dedicated schema namespace for backups
create schema if not exists backup;

-- 2. Create Disk 1: backup.records (in dedicated backup schema)
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

-- 3. Create Disk 2: public.backups (in public schema for Supabase Table Editor & UI access)
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

-- 4. Row Level Security: Immutable append-only design
-- Disk 1 (backup.records): No public/anon policies whatsoever.
-- Direct database access only (Postgres superuser / Supabase dashboard).
alter table backup.records enable row level security;

-- Disk 2 (public.backups): Public can read backups and insert, but CANNOT update or delete.
alter table public.backups enable row level security;

drop policy if exists "Allow public read backups" on public.backups;
create policy "Allow public read backups"
  on public.backups for select using (true);

drop policy if exists "Allow public insert backups" on public.backups;
create policy "Allow public insert backups"
  on public.backups for insert with check (true);

-- CRITICAL IMMUTABILITY ENFORCEMENT:
-- NO UPDATE POLICY exists -> Cannot be modified via public/anon API.
-- NO DELETE POLICY exists -> Cannot be deleted via public/anon API.
-- Deletion is strictly impossible without direct database access.

-- 5. Automatic RAID Mirroring Trigger Function
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
    -- Mirror 1: Dedicated backup schema
    insert into backup.records (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, 'DELETE', now());
    -- Mirror 2: Public backups table
    insert into public.backups (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, 'DELETE', now());
    return OLD;
  else
    rec_id := coalesce(NEW.id::text, '');
    rec_data := to_jsonb(NEW);
    -- Mirror 1: Dedicated backup schema
    insert into backup.records (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, TG_OP, now());
    -- Mirror 2: Public backups table
    insert into public.backups (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, TG_OP, now());
    return NEW;
  end if;
end;
$$;

-- 6. Attach Mirror Triggers to Teachers, Modules, Batches, and Schedules
drop trigger if exists trg_backup_teachers on public.teachers;
create trigger trg_backup_teachers
  after insert or update or delete on public.teachers
  for each row execute function public.backup_record_trigger();

drop trigger if exists trg_backup_modules on public.modules;
create trigger trg_backup_modules
  after insert or update or delete on public.modules
  for each row execute function public.backup_record_trigger();

drop trigger if exists trg_backup_batches on public.batches;
create trigger trg_backup_batches
  after insert or update or delete on public.batches
  for each row execute function public.backup_record_trigger();

drop trigger if exists trg_backup_schedules on public.schedules;
create trigger trg_backup_schedules
  after insert or update or delete on public.schedules
  for each row execute function public.backup_record_trigger();

-- 7. Enable Realtime Replication for public.backups
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'backups') then
    alter publication supabase_realtime add table public.backups;
  end if;
end $$;

-- 8. Initial RAID snapshots of existing data
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
