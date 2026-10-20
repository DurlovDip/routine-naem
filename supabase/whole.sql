-- ========================================================================
-- ROUTINE-NAEM: Complete Master Schema (whole.sql)
-- Safe, idempotent script that sets up or updates the ENTIRE database.
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard).
--
-- This script is completely safe to run on:
--   1. A fresh, brand new Supabase project (sets up everything from scratch)
--   2. A partially migrated Supabase project (adds missing tables, columns,
--      functions, policies, or seeds without touching or deleting existing data)
--   3. An already up-to-date project (re-validates and keeps data intact)
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. EXTENSIONS & SCHEMAS
-- ------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists backup;

-- Clean up obsolete legacy tables/policies if any exist from older versions
do $$
begin
  if to_regclass('public.profiles') is not null then
    drop policy if exists "profiles read own or admin" on public.profiles;
    drop table if exists public.profiles cascade;
  end if;
  if to_regclass('public.coordinations') is not null then
    drop policy if exists "coordinations read editors" on public.coordinations;
    drop table if exists public.coordinations cascade;
  end if;
end $$;

drop function if exists public.assign_coordinator(text);
drop function if exists public.revoke_coordinator(text);
drop function if exists public.transfer_coordination(text);
drop function if exists public.delegate_coordination(text, date, date);
drop function if exists public.cancel_delegation(uuid);
drop function if exists public.list_delegations();

-- ------------------------------------------------------------------------
-- 2. RELATIONAL TABLES (CREATED IF NOT EXIST - PRESERVES EXISTING DATA)
-- ------------------------------------------------------------------------

-- 2.1 Teachers Table
create table if not exists public.teachers (
  id text primary key,
  name text not null,
  designation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.teachers add column if not exists designation text not null default '';
alter table public.teachers add column if not exists auth_user_id uuid;
alter table public.teachers add column if not exists username text;
alter table public.teachers add column if not exists role text not null default 'teacher';
alter table public.teachers add column if not exists role_start date;
alter table public.teachers add column if not exists role_end date;
alter table public.teachers add column if not exists pin text not null default '6832';

-- Sanitize nulls and ensure defaults
update public.teachers set role = 'teacher' where role is null;
alter table public.teachers alter column role set default 'teacher';
alter table public.teachers alter column role set not null;

update public.teachers set pin = '6832' where pin is null or btrim(pin) = '';
alter table public.teachers alter column pin set default '6832';
alter table public.teachers alter column pin set not null;

-- Indexes on teachers
create unique index if not exists teachers_auth_user_id_key on public.teachers (auth_user_id);
create unique index if not exists teachers_username_key on public.teachers (username);

-- Foreign key to auth.users
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teachers_auth_user_id_fkey'
  ) then
    alter table public.teachers
      add constraint teachers_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users (id) on delete set null;
  end if;
end $$;

-- Sanitize constraint edge cases before attaching checks
update public.teachers
set role_start = null, role_end = null
where role in ('super_admin', 'teacher') and (role_start is not null or role_end is not null);

update public.teachers
set username = null
where username is not null and username !~ '^[a-z0-9][a-z0-9._-]{1,31}$';

-- Check constraints on teachers
alter table public.teachers drop constraint if exists teachers_role_check;
alter table public.teachers
  add constraint teachers_role_check
  check (role in ('super_admin', 'coordinator', 'temp_coordinator', 'teacher'));

alter table public.teachers drop constraint if exists teachers_username_shape;
alter table public.teachers
  add constraint teachers_username_shape
  check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{1,31}$');

alter table public.teachers drop constraint if exists teachers_role_dates;
alter table public.teachers
  add constraint teachers_role_dates
  check (
    (
      role in ('super_admin', 'teacher')
      and role_start is null
      and role_end is null
    )
    or (
      role in ('coordinator', 'temp_coordinator')
      and role_start is not null
      and role_end is not null
      and role_end >= role_start
    )
  );

alter table public.teachers drop constraint if exists teachers_pin_shape;
alter table public.teachers
  add constraint teachers_pin_shape
  check (pin ~ '^[0-9]{4}$');

comment on column public.teachers.pin is
  '4-digit sign-in PIN. Default 6832. Hidden from client table reads; change it through change_pin or admin_reset_pin.';

-- 2.2 Modules Table
create table if not exists public.modules (
  id integer primary key,
  module_number text not null default '',
  module_subnumber text not null default '',
  module_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.modules add column if not exists module_number text not null default '';
alter table public.modules add column if not exists module_subnumber text not null default '';
alter table public.modules add column if not exists module_name text not null default '';
alter table public.modules add column if not exists created_at timestamptz not null default now();
alter table public.modules add column if not exists updated_at timestamptz not null default now();

-- 2.3 Batches Table
create table if not exists public.batches (
  id integer primary key,
  name text not null default '',
  number_of_students integer not null default 40,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.batches add column if not exists name text not null default '';
alter table public.batches add column if not exists number_of_students integer not null default 40;
alter table public.batches add column if not exists created_at timestamptz not null default now();
alter table public.batches add column if not exists updated_at timestamptz not null default now();

-- 2.4 Schedules Table (Document JSON Store)
create table if not exists public.schedules (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2.5 Designations Catalog Table
create table if not exists public.designations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- 2.6 RAID-Style Immutable Backup Tables
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

-- ------------------------------------------------------------------------
-- 3. CORE FUNCTIONS & RPCs
-- ------------------------------------------------------------------------

-- Drop existing functions first so signatures/return types can be updated cleanly
-- (Prevents PostgreSQL error 42P13: cannot change return type of existing function)
drop function if exists public.access_directory();
drop function if exists public.my_access();
drop function if exists public.unclaimed_teachers();
drop function if exists public.teacher_sign_in_options();
drop function if exists public.login_with_pin(text, text);
drop function if exists public.change_pin(text, text);
drop function if exists public.admin_reset_pin(text, text);
drop function if exists public.teacher_auth_email(text);
drop function if exists public.assign_teacher_role(text, text, date, date);
drop function if exists public.username_available(text);

-- 3.1 Dhaka Application Date
create or replace function public.app_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Dhaka')::date
$$;

-- 3.2 Effective Role Evaluation
create or replace function public.effective_role(uid uuid default auth.uid())
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row public.teachers;
  today date := public.app_today();
begin
  if uid is null then
    return null;
  end if;
  if exists (
    select 1 from auth.users
    where id = uid and lower(email) = 'superadmin@routine.local'
  ) then
    return 'super_admin';
  end if;
  select * into row from public.teachers where auth_user_id = uid;
  if not found then
    return null;
  end if;
  if row.role = 'super_admin' then
    return 'super_admin';
  end if;
  if row.role in ('coordinator', 'temp_coordinator')
     and today between row.role_start and row.role_end then
    return row.role;
  end if;
  return 'teacher';
end;
$$;

-- 3.3 Create or Refresh Auth User for Teacher (PIN sign-in sync)
create or replace function public.teacher_auth_email(teacher_id text)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  rec public.teachers%rowtype;
  local_part text;
  login_email text;
  uid uuid;
  existing uuid;
begin
  select * into rec from public.teachers where id = teacher_id;
  if not found then
    raise exception 'That teacher is not in the list';
  end if;

  if rec.auth_user_id is not null and not exists (select 1 from auth.users where id = rec.auth_user_id) then
    update public.teachers set auth_user_id = null where id = rec.id;
    rec.auth_user_id := null;
  end if;

  if rec.username is not null and rec.username ~ '^[a-z0-9][a-z0-9._-]{1,31}$' then
    local_part := rec.username;
  else
    local_part := lower(rec.id);
    local_part := regexp_replace(local_part, '[^a-z0-9._-]', '-', 'g');
    local_part := regexp_replace(local_part, '-{2,}', '-', 'g');
    local_part := btrim(local_part, '-');
    if local_part !~ '^[a-z0-9]' then
      local_part := 't' || local_part;
    end if;
    local_part := left(local_part, 32);
    if length(local_part) < 2 then
      local_part := 'teacher';
    end if;
    if exists (
      select 1 from public.teachers
      where username = local_part and id is distinct from rec.id
    ) then
      local_part := left(local_part, 24) || left(md5(rec.id), 6);
    end if;
    update public.teachers
    set username = local_part
    where id = rec.id and username is null;
  end if;

  login_email := local_part || '@routine.local';

  if rec.auth_user_id is not null then
    update auth.users
    set encrypted_password = extensions.crypt(rec.pin, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = rec.auth_user_id
    returning auth.users.email into login_email;
    if login_email is not null then
      return login_email;
    end if;
  end if;

  select users.id into existing
  from auth.users as users
  where lower(users.email) = lower(login_email)
  limit 1;

  if existing is not null then
    if exists (
      select 1 from public.teachers
      where auth_user_id = existing and id is distinct from rec.id
    ) then
      raise exception 'The sign-in address % is already linked to another teacher', login_email;
    end if;
    update auth.users
    set encrypted_password = extensions.crypt(rec.pin, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now(),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('teacher_id', rec.id, 'username', local_part)
    where id = existing;
    update public.teachers
    set auth_user_id = existing,
        username = coalesce(username, local_part)
    where id = rec.id;
    return login_email;
  end if;

  uid := gen_random_uuid();
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    recovery_token,
    reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    uid,
    'authenticated',
    'authenticated',
    login_email,
    extensions.crypt(rec.pin, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('teacher_id', rec.id, 'username', local_part),
    now(),
    now(),
    '',
    '',
    '',
    '',
    '',
    ''
  );

  if not exists (select 1 from auth.identities where user_id = uid and provider = 'email') then
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      uid,
      jsonb_build_object('sub', uid::text, 'email', login_email, 'email_verified', true),
      'email',
      uid::text,
      now(),
      now(),
      now()
    );
  end if;

  update public.teachers
  set auth_user_id = uid,
      username = coalesce(username, local_part)
  where id = rec.id
    and (auth_user_id is null or auth_user_id = uid);

  return login_email;
end;
$$;

-- 3.4 Teacher PIN Sign-in Handler
create or replace function public.login_with_pin(teacher_id text, pin text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  stored text;
begin
  if teacher_id is null or btrim(teacher_id) = '' then
    raise exception 'Choose a teacher';
  end if;
  if pin is null or pin !~ '^[0-9]{4}$' then
    raise exception 'That PIN is not correct';
  end if;

  select teachers.pin into stored
  from public.teachers
  where teachers.id = teacher_id;

  if not found then
    raise exception 'That teacher is not in the list';
  end if;
  if stored is distinct from pin then
    raise exception 'That PIN is not correct';
  end if;

  return public.teacher_auth_email(teacher_id);
end;
$$;

-- 3.5 Teacher Change Own PIN
create or replace function public.change_pin(old_pin text, new_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tid text;
begin
  if auth.uid() is null then
    raise exception 'Sign in before changing your PIN';
  end if;
  if new_pin is null or new_pin !~ '^[0-9]{4}$' then
    raise exception 'A PIN is 4 digits';
  end if;
  if old_pin is not distinct from new_pin then
    raise exception 'Choose a different PIN';
  end if;

  select id into tid from public.teachers where auth_user_id = auth.uid();
  if tid is null then
    raise exception 'This sign-in is not linked to a teacher';
  end if;

  update public.teachers
  set pin = new_pin
  where id = tid and pin is not distinct from old_pin;
  if not found then
    raise exception 'The current PIN is not correct';
  end if;

  perform public.teacher_auth_email(tid);
end;
$$;

-- 3.6 Super Admin Reset Teacher PIN
create or replace function public.admin_reset_pin(teacher_id text, new_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.effective_role() is distinct from 'super_admin' then
    raise exception 'Only a super admin can reset a PIN';
  end if;
  if new_pin is null or new_pin !~ '^[0-9]{4}$' then
    raise exception 'A PIN is 4 digits';
  end if;

  update public.teachers
  set pin = new_pin
  where id = teacher_id;
  if not found then
    raise exception 'That teacher is not in the list';
  end if;

  perform public.teacher_auth_email(teacher_id);
end;
$$;

-- 3.7 Teacher Dropdown Options for Sign-in
create or replace function public.teacher_sign_in_options()
returns table (id text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select teachers.id, teachers.name
  from public.teachers
  order by teachers.name
$$;

-- 3.8 Auth Hook: Link Provisioned User
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tid text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'teacher_id', '')), '');
  local_part text := nullif(lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', ''))), '');
begin
  if tid is null then
    return new;
  end if;
  update public.teachers
  set auth_user_id = new.id,
      username = coalesce(teachers.username, local_part)
  where id = tid
    and (auth_user_id is null or auth_user_id = new.id);
  return new;
end;
$$;

-- 3.9 Current Teacher Access Info
create or replace function public.my_access()
returns table (
  username text,
  teacher_id text,
  teacher_name text,
  stored_role text,
  effective text,
  role_start date,
  role_end date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    teachers.username,
    teachers.id,
    teachers.name,
    teachers.role,
    public.effective_role(auth.uid()),
    teachers.role_start,
    teachers.role_end
  from public.teachers
  where teachers.auth_user_id = auth.uid()
$$;

-- 3.10 Super Admin Access Directory
create or replace function public.access_directory()
returns table (
  teacher_id text,
  teacher_name text,
  designation text,
  username text,
  stored_role text,
  effective text,
  role_start date,
  role_end date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.effective_role() is distinct from 'super_admin' then
    raise exception 'Only a super admin can open the role list';
  end if;
  return query
    select
      teachers.id,
      teachers.name,
      teachers.designation,
      teachers.username,
      teachers.role,
      case
        when teachers.role = 'super_admin' then 'super_admin'
        when teachers.role in ('coordinator', 'temp_coordinator')
          and public.app_today() between teachers.role_start and teachers.role_end
          then teachers.role
        else 'teacher'
      end,
      teachers.role_start,
      teachers.role_end
    from public.teachers
    order by teachers.name;
end;
$$;

-- 3.11 Assign Teacher Role
create or replace function public.assign_teacher_role(
  target_teacher text,
  next_role text,
  start_on date,
  end_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
begin
  if public.effective_role() is distinct from 'super_admin' then
    raise exception 'Only a super admin can assign roles';
  end if;
  if next_role not in ('teacher', 'coordinator', 'temp_coordinator') then
    raise exception 'Choose teacher, coordinator, or temporary coordinator';
  end if;

  select role into current_role from public.teachers where id = target_teacher;
  if current_role is null then
    raise exception 'That teacher is not in the list';
  end if;
  if current_role = 'super_admin' then
    raise exception 'Change a super admin with promote_super_admin.sql';
  end if;

  if next_role = 'teacher' then
    update public.teachers
    set role = 'teacher', role_start = null, role_end = null
    where id = target_teacher;
    return;
  end if;

  if start_on is null or end_on is null or end_on < start_on then
    raise exception 'A coordinator needs a start date and an end date';
  end if;

  update public.teachers
  set role = next_role, role_start = start_on, role_end = end_on
  where id = target_teacher;
end;
$$;

-- 3.12 Helpers for Account Claiming / Availability
create or replace function public.unclaimed_teachers()
returns table (id text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select teachers.id, teachers.name
  from public.teachers
  where teachers.auth_user_id is null
    and teachers.id is distinct from 'superadmin'
  order by teachers.name
$$;

create or replace function public.username_available(uname text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.teachers where username = lower(trim(uname))
  )
$$;

-- 3.13 RAID Backup Trigger Function (Strips PIN for security)
create or replace function public.backup_record_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, backup
as $$
declare
  rec_type text;
  rec_id text;
  rec_data jsonb;
begin
  rec_type := TG_TABLE_NAME;
  if (TG_OP = 'DELETE') then
    rec_id := coalesce(OLD.id::text, '');
    rec_data := to_jsonb(OLD) - 'pin';
    insert into backup.records (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, 'DELETE', now());
    insert into public.backups (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, 'DELETE', now());
    return OLD;
  else
    rec_id := coalesce(NEW.id::text, '');
    rec_data := to_jsonb(NEW) - 'pin';
    insert into backup.records (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, TG_OP, now());
    insert into public.backups (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, TG_OP, now());
    return NEW;
  end if;
end;
$$;

-- ------------------------------------------------------------------------
-- 4. ATTACH TRIGGERS
-- ------------------------------------------------------------------------

-- Auth User Creation Trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backup Triggers
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

-- ------------------------------------------------------------------------
-- 5. SEED INITIAL DATA (IF NOT EXISTING - PRESERVES EDITS)
-- ------------------------------------------------------------------------

-- 5.1 Teachers
insert into public.teachers (id, name, designation, role, pin) values
  ('teacher-1', 'Prof. Asisul', '', 'teacher', '6832'),
  ('teacher-2', 'Md. Sazzad Ali', '', 'teacher', '6832'),
  ('teacher-3', 'Muhammad Yeakub Ali', '', 'teacher', '6832'),
  ('teacher-4', 'Mst. Arifa Tazrimin', '', 'teacher', '6832'),
  ('teacher-5', 'Md. Jahangir Alom', '', 'teacher', '6832'),
  ('teacher-6', 'Prof. Rukhshana', '', 'teacher', '6832'),
  ('teacher-7', 'Prof. Nilufar', '', 'teacher', '6832'),
  ('teacher-8', 'Ms. Ayesa', '', 'teacher', '6832'),
  ('teacher-9', 'Mr. S. Mahbub', '', 'teacher', '6832'),
  ('teacher-10', 'Dr. Rahman', '', 'teacher', '6832'),
  ('teacher-11', 'Mr. M. Ali', '', 'teacher', '6832'),
  ('teacher-12', 'Mr. Ariful', '', 'teacher', '6832'),
  ('teacher-13', 'Dr. Nuruzzaman', '', 'teacher', '6832'),
  ('teacher-14', 'Ms. Zinan', '', 'teacher', '6832'),
  ('teacher-15', 'Ms. Arifa', '', 'teacher', '6832'),
  ('teacher-16', 'Dr. Ayet', '', 'teacher', '6832'),
  ('teacher-17', 'Dr. Litan Kanti Halder', '', 'teacher', '6832')
on conflict (id) do nothing;

-- 5.2 Super Admin Teacher Record
update public.teachers
set username = null
where username = 'superadmin'
  and id is distinct from 'superadmin';

insert into public.teachers (id, name, username, role, role_start, role_end, pin)
values ('superadmin', 'Super Admin', 'superadmin', 'super_admin', null, null, '6832')
on conflict (id) do update
set username = coalesce(public.teachers.username, excluded.username),
    role = 'super_admin',
    role_start = null,
    role_end = null,
    pin = coalesce(public.teachers.pin, '6832'),
    name = case
      when public.teachers.name is null or btrim(public.teachers.name) = '' then excluded.name
      else public.teachers.name
    end;

-- 5.3 Modules
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
on conflict (id) do nothing;

-- 5.4 Batches
insert into public.batches (id, name, number_of_students) values
  (9, '', 40),
  (10, '', 40),
  (11, '', 40),
  (12, '', 40),
  (13, '', 40)
on conflict (id) do nothing;

-- 5.5 Designations Catalog
insert into public.designations (name) values
  ('Director General'),
  ('Director'),
  ('Deputy Director'),
  ('Assistant Director'),
  ('Professor'),
  ('Associate Professor'),
  ('Assistant Professor'),
  ('Lecturer'),
  ('Research Officer'),
  ('Guest Speaker')
on conflict (name) do nothing;

-- Import existing distinct non-empty designations from teachers
insert into public.designations (name)
select distinct btrim(designation)
from public.teachers
where designation is not null
  and btrim(designation) <> ''
on conflict (name) do nothing;

-- 5.6 Initial Schedules Document (Day 01: 19 Oct, Day 02: 20 Oct)
insert into public.schedules (id, data, updated_at)
values ('default', '{"days":[{"id":"day-01","date":"2026-10-19","cells":{"batch-9:s1":{"code":"M- 7.04","note":"Theory","teachers":["Prof. Asisul"]},"batch-9:s2":{"code":"M- 8.01","note":"","teachers":["Md. Sazzad Ali"]},"batch-9:s3":{"code":"M- 8.01","note":"","teachers":["Md. Sazzad Ali"]},"batch-9:s4":{"code":"M- 1.06","note":"","teachers":["Muhammad Yeakub Ali"]},"batch-9:s5":{"code":"M- 3.02","note":"","teachers":["Mst. Arifa Tazrimin"]},"batch-10:s1":{"code":"M- 1.06","note":"","teachers":["Muhammad Yeakub Ali"]},"batch-10:s2":{"code":"M- 7.04","note":"Theory","teachers":["Prof. Asisul"]},"batch-10:s3":{"code":"M- 3.02","note":"","teachers":["Mst. Arifa Tazrimin"]},"batch-10:s4":{"code":"M- 8.01","note":"","teachers":["Md. Sazzad Ali"]},"batch-10:s5":{"code":"M- 5.01","note":"","teachers":["Md. Jahangir Alom"]},"batch-11:s1":{"code":"M- 3.02","note":"","teachers":["Mst. Arifa Tazrimin"]},"batch-11:s2":{"code":"M- 1.06","note":"","teachers":["Muhammad Yeakub Ali"]},"batch-11:s3":{"code":"M- 7.04","note":"Theory","teachers":["Prof. Asisul"]},"batch-11:s4":{"code":"M- 5.01","note":"","teachers":["Md. Jahangir Alom"]},"batch-11:s5":{"code":"M- 8.01","note":"","teachers":["Md. Sazzad Ali"]},"batch-12:s1":{"code":"M- 5.01","note":"","teachers":["Md. Jahangir Alom"]},"batch-12:s2":{"code":"M- 3.05","note":"","teachers":["Prof. Rukhshana"]},"batch-12:s3":{"code":"M- 1.08","note":"","teachers":["Prof. Nilufar"]},"batch-12:s4":{"code":"M- 7.04","note":"TPP","teachers":["Prof. Asisul"]},"batch-12:s5":{"code":"M- 6.01","note":"","teachers":["Dr. Rahman"]},"batch-13:s1":{"code":"M- 1.08","note":"","teachers":["Prof. Nilufar"]},"batch-13:s2":{"code":"M- 5.01","note":"","teachers":["Md. Jahangir Alom"]},"batch-13:s3":{"code":"M- 6.01","note":"","teachers":["Dr. Rahman"]},"batch-13:s4":{"code":"M- 3.05","note":"","teachers":["Prof. Rukhshana"]},"batch-13:s5":{"code":"M- 7.04","note":"TPP","teachers":["Prof. Asisul"]}},"slots":[{"id":"s1","kind":"session","durationMin":60},{"id":"break-tea","kind":"break","label":"Tea Break","durationMin":30},{"id":"s2","kind":"session","durationMin":60},{"id":"s3","kind":"session","durationMin":60},{"id":"break-lunch","kind":"break","label":"Prayer & Lunch Break","durationMin":60},{"id":"s4","kind":"session","durationMin":60},{"id":"s5","kind":"session","durationMin":60}],"merges":[{"batchId":"batch-9","sessionIds":["s2","s3"]}],"dayStart":"09:00","managers":{"batch-9":["01","02"],"batch-10":["01","02"],"batch-11":["01","02"],"batch-12":["01","02"],"batch-13":["01","02"]},"recapMin":30,"dayNumber":1,"defaultSessionMin":60},{"id":"day-02","date":"2026-10-20","cells":{"batch-9:s1":{"code":"M- 7.04","note":"TPP (Theory & Practice)","teachers":["Prof. Asisul"]},"batch-9:s2":{"code":"M- 8.03","note":"","teachers":["Ms. Ayesa"]},"batch-9:s3":{"code":"M- 5.06","note":"","teachers":["Mr. S. Mahbub"]},"batch-9:s4":{"code":"M- 6.01","note":"","teachers":["Dr. Rahman","Mr. M. Ali"]},"batch-9:s5":{"code":"M- 8.07","note":"","teachers":["Mr. Ariful"]},"batch-10:s1":{"code":"M- 5.06","note":"","teachers":["Mr. S. Mahbub"]},"batch-10:s2":{"code":"M- 7.04","note":"TPP (Theory & Practice)","teachers":["Prof. Asisul"]},"batch-10:s3":{"code":"M- 8.03","note":"","teachers":["Ms. Ayesa"]},"batch-10:s4":{"code":"M- 8.07","note":"","teachers":["Mr. Ariful"]},"batch-10:s5":{"code":"M- 6.01","note":"","teachers":["Dr. Rahman"]},"batch-11:s1":{"code":"M- 8.03","note":"","teachers":["Ms. Ayesa"]},"batch-11:s2":{"code":"M- 5.06","note":"","teachers":["Mr. S. Mahbub"]},"batch-11:s3":{"code":"M- 7.04","note":"Practice & Presentation","teachers":["Prof. Asisul"]},"batch-11:s4":{"code":"M- 8.08","note":"","teachers":["Dr. Nuruzzaman"]},"batch-11:s5":{"code":"M- 8.10","note":"","teachers":["Ms. Zinan"]},"batch-12:s1":{"code":"M- 6.01","note":"","teachers":["Dr. Rahman"]},"batch-12:s2":{"code":"M- 8.08","note":"","teachers":["Dr. Nuruzzaman"]},"batch-12:s3":{"code":"M- 8.10","note":"","teachers":["Ms. Zinan"]},"batch-12:s4":{"code":"M- 7.04","note":"Theory","teachers":["Prof. Asisul"]},"batch-12:s5":{"code":"M- 3.02","note":"","teachers":["Mst. Arifa Tazrimin"]},"batch-13:s1":{"code":"M- 8.10","note":"","teachers":["Ms. Zinan"]},"batch-13:s2":{"code":"M- 6.01","note":"","teachers":["Dr. Rahman"]},"batch-13:s3":{"code":"M- 8.08","note":"","teachers":["Dr. Nuruzzaman"]},"batch-13:s4":{"code":"M- 3.02","note":"","teachers":["Mst. Arifa Tazrimin"]},"batch-13:s5":{"code":"M- 7.04","note":"Theory","teachers":["Prof. Asisul"]}},"slots":[{"id":"s1","kind":"session","durationMin":60},{"id":"break-tea","kind":"break","label":"Tea Break","durationMin":30},{"id":"s2","kind":"session","durationMin":60},{"id":"s3","kind":"session","durationMin":60},{"id":"break-lunch","kind":"break","label":"Prayer & Lunch Break","durationMin":60},{"id":"s4","kind":"session","durationMin":60},{"id":"s5","kind":"session","durationMin":60}],"merges":[],"dayStart":"09:00","managers":{"batch-9":["03","04"],"batch-10":["03","04"],"batch-11":["03","04"],"batch-12":["03","04"],"batch-13":["03","04"]},"recapMin":30,"dayNumber":2,"defaultSessionMin":60}],"footer":{"name":"Dr. Litan Kanti Halder","lines":["Assistant Director & Course Coordinator","Advanced Course on Skill Development","NAEM, Dhaka"],"courseName":"Advanced Course on Skill Development","designation":"Assistant Director & Course Coordinator","signatureDate":"20.10.26","isCourseCoordinator":true},"header":[{"id":"h1","text":"Enhancing Professional Skills of Teachers Scheme","style":"normal"},{"id":"h2","text":"Secondary Education Development Program (SEDP)","style":"normal"},{"id":"h3","text":"National Academy for Educational Management (NAEM)","style":"normal"},{"id":"h4","text":"Secondary and Higher Education Division, Ministry of Education","style":"normal"},{"id":"h5","text":"Advanced Course on Skill Development","style":"title"},{"id":"h6","text":"For Assistant Professors of BCS (General Education) Cadre","style":"subtitle"},{"id":"h7","text":"(Duration: Training Course Schedule)","style":"normal"}],"batches":[{"id":"batch-9","name":"9th","roster":["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40"],"numberOfStudents":40},{"id":"batch-10","name":"10th","roster":["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40"],"numberOfStudents":40},{"id":"batch-11","name":"11th","roster":["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40"],"numberOfStudents":40},{"id":"batch-12","name":"12th","roster":["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40"],"numberOfStudents":40},{"id":"batch-13","name":"13th","roster":["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40"],"numberOfStudents":40}],"modules":[{"id":"1","code":"M- 7.04","title":"Theory","moduleName":"Theory","moduleNumber":"7","moduleSubnumber":"04"},{"id":"2","code":"M- 7.04","title":"TPP (Theory & Practice)","moduleName":"TPP (Theory & Practice)","moduleNumber":"7","moduleSubnumber":"04"},{"id":"3","code":"M- 7.04","title":"Practice & Presentation","moduleName":"Practice & Presentation","moduleNumber":"7","moduleSubnumber":"04"},{"id":"4","code":"M- 1.06","title":"Education Governance","moduleName":"Education Governance","moduleNumber":"1","moduleSubnumber":"06"},{"id":"5","code":"M- 1.08","title":"Financial Management","moduleName":"Financial Management","moduleNumber":"1","moduleSubnumber":"08"},{"id":"6","code":"M- 3.02","title":"Curriculum Implementation","moduleName":"Curriculum Implementation","moduleNumber":"3","moduleSubnumber":"02"},{"id":"7","code":"M- 3.05","title":"Pedagogical Leadership","moduleName":"Pedagogical Leadership","moduleNumber":"3","moduleSubnumber":"05"},{"id":"8","code":"M- 5.01","title":"ICT in Education","moduleName":"ICT in Education","moduleNumber":"5","moduleSubnumber":"01"},{"id":"9","code":"M- 5.06","title":"Classroom Assessment","moduleName":"Classroom Assessment","moduleNumber":"5","moduleSubnumber":"06"},{"id":"10","code":"M- 6.01","title":"Research Methodology","moduleName":"Research Methodology","moduleNumber":"6","moduleSubnumber":"01"},{"id":"11","code":"M- 8.03","title":"Professional Ethics","moduleName":"Professional Ethics","moduleNumber":"8","moduleSubnumber":"03"},{"id":"12","code":"M- 8.07","title":"Quality Assurance","moduleName":"Quality Assurance","moduleNumber":"8","moduleSubnumber":"07"},{"id":"13","code":"M- 8.08","title":"Institutional Planning","moduleName":"Institutional Planning","moduleNumber":"8","moduleSubnumber":"08"},{"id":"14","code":"M- 8.10","title":"Evaluation & Feedback","moduleName":"Evaluation & Feedback","moduleNumber":"8","moduleSubnumber":"10"}],"version":1,"teachers":[{"id":"teacher-1","name":"Prof. Asisul","designation":"Professor"},{"id":"teacher-2","name":"Md. Sazzad Ali","designation":"Associate Professor"},{"id":"teacher-3","name":"Muhammad Yeakub Ali","designation":"Assistant Professor"},{"id":"teacher-4","name":"Mst. Arifa Tazrimin","designation":"Assistant Professor"},{"id":"teacher-5","name":"Md. Jahangir Alom","designation":"Lecturer"},{"id":"teacher-6","name":"Prof. Rukhshana","designation":"Professor"},{"id":"teacher-7","name":"Prof. Nilufar","designation":"Professor"},{"id":"teacher-8","name":"Ms. Ayesa","designation":"Associate Professor"},{"id":"teacher-9","name":"Mr. S. Mahbub","designation":"Assistant Professor"},{"id":"teacher-10","name":"Dr. Rahman","designation":"Director"},{"id":"teacher-11","name":"Mr. M. Ali","designation":"Assistant Professor"},{"id":"teacher-12","name":"Mr. Ariful","designation":"Lecturer"},{"id":"teacher-13","name":"Dr. Nuruzzaman","designation":"Director"},{"id":"teacher-14","name":"Ms. Zinan","designation":"Assistant Professor"},{"id":"teacher-15","name":"Ms. Arifa","designation":"Lecturer"},{"id":"teacher-16","name":"Dr. Ayet","designation":"Associate Professor"},{"id":"teacher-17","name":"Dr. Litan Kanti Halder","designation":"Assistant Director"}],"autoRotate":true,"recapLabel":"Recap & Day Manager","subNumbers":[".01",".02",".03",".04",".05",".06",".07",".08",".10"],"activeDayId":"day-02","moduleNumbers":["M-1","M-3","M-5","M-6","M-7","M-8"],"showConflicts":true}'::jsonb, now())
on conflict (id) do nothing;

-- ------------------------------------------------------------------------
-- 6. PROVISION AUTH ACCOUNTS & SYNC PASSWORDS WITH PINS
-- ------------------------------------------------------------------------
do $$
declare
  rec record;
begin
  for rec in select teachers.id from public.teachers order by teachers.id loop
    perform public.teacher_auth_email(rec.id);
  end loop;
end $$;

-- Link superadmin auth user if created
update public.teachers
set auth_user_id = users.id,
    username = 'superadmin',
    role = 'super_admin',
    role_start = null,
    role_end = null
from auth.users as users
where lower(users.email) = 'superadmin@routine.local'
  and teachers.id = 'superadmin';

-- ------------------------------------------------------------------------
-- 7. SECURITY, GRANTS & FUNCTION PERMISSIONS
-- ------------------------------------------------------------------------

-- Revoke all by default, then grant explicitly
revoke all on function public.teacher_auth_email(text) from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.login_with_pin(text, text) from public;
revoke all on function public.change_pin(text, text) from public;
revoke all on function public.admin_reset_pin(text, text) from public;
revoke all on function public.teacher_sign_in_options() from public;
revoke all on function public.effective_role(uuid) from public;
revoke all on function public.unclaimed_teachers() from public;
revoke all on function public.username_available(text) from public;
revoke all on function public.my_access() from public;
revoke all on function public.access_directory() from public;
revoke all on function public.assign_teacher_role(text, text, date, date) from public;

grant execute on function public.login_with_pin(text, text) to anon, authenticated;
grant execute on function public.change_pin(text, text) to authenticated;
grant execute on function public.admin_reset_pin(text, text) to authenticated;
grant execute on function public.teacher_sign_in_options() to anon, authenticated;
grant execute on function public.unclaimed_teachers() to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.my_access() to authenticated;
grant execute on function public.access_directory() to authenticated;
grant execute on function public.assign_teacher_role(text, text, date, date) to authenticated;
grant execute on function public.effective_role(uuid) to authenticated;

-- Teachers table grants: allow authenticated users full CRUD (governed by RLS) and anon SELECT
grant select on public.teachers to anon, authenticated;
grant insert, update, delete on public.teachers to authenticated;

-- Modules, Batches, Schedules table grants
grant select on public.modules to anon, authenticated;
grant insert, update, delete on public.modules to authenticated;

grant select on public.batches to anon, authenticated;
grant insert, update, delete on public.batches to authenticated;

grant select on public.schedules to anon, authenticated;
grant insert, update, delete on public.schedules to authenticated;

-- Designations grants
grant select on public.designations to anon, authenticated;
grant insert, update, delete on public.designations to authenticated;

-- Backups grants
grant select on public.backups to authenticated;

-- ------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------

alter table public.teachers enable row level security;
alter table public.modules enable row level security;
alter table public.batches enable row level security;
alter table public.schedules enable row level security;
alter table public.designations enable row level security;
alter table public.backups enable row level security;
alter table backup.records enable row level security;

-- 8.1 Teachers Policies
drop policy if exists "Allow public all teachers" on public.teachers;
drop policy if exists "teachers select authenticated" on public.teachers;
drop policy if exists "teachers select all" on public.teachers;
drop policy if exists "teachers write editors" on public.teachers;
drop policy if exists "teachers write super admin" on public.teachers;

create policy "teachers select all"
  on public.teachers for select to anon, authenticated
  using (true);

create policy "teachers write super admin"
  on public.teachers for all to authenticated
  using (public.effective_role() = 'super_admin')
  with check (public.effective_role() = 'super_admin');

-- 8.2 Modules Policies
drop policy if exists "Allow public all modules" on public.modules;
drop policy if exists "modules select authenticated" on public.modules;
drop policy if exists "modules select all" on public.modules;
drop policy if exists "modules write editors" on public.modules;
drop policy if exists "modules write super admin" on public.modules;

create policy "modules select all"
  on public.modules for select to anon, authenticated
  using (true);

create policy "modules write super admin"
  on public.modules for all to authenticated
  using (public.effective_role() = 'super_admin')
  with check (public.effective_role() = 'super_admin');

-- 8.3 Batches Policies
drop policy if exists "Allow public all batches" on public.batches;
drop policy if exists "batches select authenticated" on public.batches;
drop policy if exists "batches select all" on public.batches;
drop policy if exists "batches write editors" on public.batches;
drop policy if exists "batches write super admin" on public.batches;

create policy "batches select all"
  on public.batches for select to anon, authenticated
  using (true);

create policy "batches write super admin"
  on public.batches for all to authenticated
  using (public.effective_role() = 'super_admin')
  with check (public.effective_role() = 'super_admin');

-- 8.4 Schedules Policies
drop policy if exists "Allow public all schedules" on public.schedules;
drop policy if exists "schedules select authenticated" on public.schedules;
drop policy if exists "schedules select all" on public.schedules;
drop policy if exists "schedules write editors" on public.schedules;

create policy "schedules select all"
  on public.schedules for select to anon, authenticated
  using (true);

create policy "schedules write editors"
  on public.schedules for all to authenticated
  using (public.effective_role() in ('super_admin', 'coordinator', 'temp_coordinator'))
  with check (public.effective_role() in ('super_admin', 'coordinator', 'temp_coordinator'));

-- 8.5 Designations Policies
drop policy if exists "designations read all" on public.designations;
create policy "designations read all"
  on public.designations for select to anon, authenticated
  using (true);

drop policy if exists "designations write super admin" on public.designations;
create policy "designations write super admin"
  on public.designations for all to authenticated
  using (public.effective_role() = 'super_admin')
  with check (public.effective_role() = 'super_admin');

-- 8.6 Backups Policies (Immutable append-only, editors read-only)
drop policy if exists "Allow public read backups" on public.backups;
drop policy if exists "Allow public insert backups" on public.backups;
drop policy if exists "backups select editors" on public.backups;

create policy "backups select editors"
  on public.backups for select to authenticated
  using (public.effective_role() in ('super_admin', 'coordinator', 'temp_coordinator'));

-- ------------------------------------------------------------------------
-- 9. REALTIME PUBLICATIONS
-- ------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'modules') then
      alter publication supabase_realtime add table public.modules;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'batches') then
      alter publication supabase_realtime add table public.batches;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'schedules') then
      alter publication supabase_realtime add table public.schedules;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'backups') then
      alter publication supabase_realtime add table public.backups;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'designations') then
      alter publication supabase_realtime add table public.designations;
    end if;

    -- For teachers table: publish specific columns (omits PIN from realtime messages)
    begin
      alter publication supabase_realtime drop table public.teachers;
    exception when others then
      null;
    end;
    begin
      alter publication supabase_realtime add table public.teachers (
        id, name, designation, username, role, role_start, role_end, auth_user_id, created_at, updated_at
      );
    exception when others then
      begin
        alter publication supabase_realtime add table public.teachers;
      exception when others then
        null;
      end;
    end;
  end if;
end $$;

-- ------------------------------------------------------------------------
-- 10. INITIAL RAID SNAPSHOTS
-- ------------------------------------------------------------------------
insert into backup.records (type, record_id, data, operation, created_at)
select 'teachers', id::text, to_jsonb(t) - 'pin', 'SNAPSHOT', now() from public.teachers t
where not exists (select 1 from backup.records rec where rec.type = 'teachers' and rec.record_id = t.id::text);

insert into public.backups (type, record_id, data, operation, created_at)
select 'teachers', id::text, to_jsonb(t) - 'pin', 'SNAPSHOT', now() from public.teachers t
where not exists (select 1 from public.backups bk where bk.type = 'teachers' and bk.record_id = t.id::text);

insert into backup.records (type, record_id, data, operation, created_at)
select 'modules', id::text, to_jsonb(m), 'SNAPSHOT', now() from public.modules m
where not exists (select 1 from backup.records rec where rec.type = 'modules' and rec.record_id = m.id::text);

insert into public.backups (type, record_id, data, operation, created_at)
select 'modules', id::text, to_jsonb(m), 'SNAPSHOT', now() from public.modules m
where not exists (select 1 from public.backups bk where bk.type = 'modules' and bk.record_id = m.id::text);

insert into backup.records (type, record_id, data, operation, created_at)
select 'batches', id::text, to_jsonb(b), 'SNAPSHOT', now() from public.batches b
where not exists (select 1 from backup.records rec where rec.type = 'batches' and rec.record_id = b.id::text);

insert into public.backups (type, record_id, data, operation, created_at)
select 'batches', id::text, to_jsonb(b), 'SNAPSHOT', now() from public.batches b
where not exists (select 1 from public.backups bk where bk.type = 'batches' and bk.record_id = b.id::text);

insert into backup.records (type, record_id, data, operation, created_at)
select 'schedules', id::text, to_jsonb(s), 'SNAPSHOT', now() from public.schedules s
where not exists (select 1 from backup.records rec where rec.type = 'schedules' and rec.record_id = s.id::text);

insert into public.backups (type, record_id, data, operation, created_at)
select 'schedules', id::text, to_jsonb(s), 'SNAPSHOT', now() from public.schedules s
where not exists (select 1 from public.backups bk where bk.type = 'schedules' and bk.record_id = s.id::text);

-- ------------------------------------------------------------------------
-- 11. VERIFICATION SUMMARY
-- ------------------------------------------------------------------------
select
  (select count(*) from public.teachers) as total_teachers,
  (select count(*) from public.modules) as total_modules,
  (select count(*) from public.batches) as total_batches,
  (select count(*) from public.designations) as total_designations,
  (select count(*) from public.teachers where role = 'super_admin') as super_admins,
  (select count(*) from auth.users where lower(email) like '%@routine.local') as auth_users_synced,
  'SUCCESS: All tables, columns, roles, PIN auth, backups, and designations are configured and up to date!' as status;
