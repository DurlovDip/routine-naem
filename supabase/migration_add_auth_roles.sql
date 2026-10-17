-- ========================================================================
-- ROUTINE-NAEM: Accounts and roles on the teachers table
-- Run this in the Supabase SQL Editor AFTER schema.sql (or the relational
-- and backup migrations). Safe to run more than once.
--
-- The teachers table is the account table. There is no profiles table.
-- Columns added here:
--   auth_user_id  uuid unique, references auth.users
--   username      text unique
--   role          text, one of super_admin, coordinator, temp_coordinator, teacher
--   role_start    date
--   role_end      date
--
-- Before creating accounts, open Authentication → Providers → Email and
-- turn OFF "Confirm email". Accounts use username@routine.local.
--
-- The first teacher who claims an account becomes super_admin.
-- To promote someone else, run supabase/promote_super_admin.sql.
-- ========================================================================

-- Remove the earlier profile and delegation design if this file was run before.
do $$
begin
  if to_regclass('public.profiles') is not null then
    drop policy if exists "profiles read own or admin" on public.profiles;
  end if;
  if to_regclass('public.coordinations') is not null then
    drop policy if exists "coordinations read editors" on public.coordinations;
  end if;
end $$;
drop policy if exists "Allow public all teachers" on public.teachers;
drop policy if exists "teachers select authenticated" on public.teachers;
drop policy if exists "teachers write editors" on public.teachers;
drop policy if exists "teachers write super admin" on public.teachers;
drop policy if exists "Allow public all modules" on public.modules;
drop policy if exists "modules select authenticated" on public.modules;
drop policy if exists "modules write editors" on public.modules;
drop policy if exists "modules write super admin" on public.modules;
drop policy if exists "Allow public all batches" on public.batches;
drop policy if exists "batches select authenticated" on public.batches;
drop policy if exists "batches write editors" on public.batches;
drop policy if exists "batches write super admin" on public.batches;
drop policy if exists "Allow public all schedules" on public.schedules;
drop policy if exists "schedules select authenticated" on public.schedules;
drop policy if exists "schedules write editors" on public.schedules;
drop policy if exists "Allow public read backups" on public.backups;
drop policy if exists "Allow public insert backups" on public.backups;
drop policy if exists "backups select editors" on public.backups;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.assign_coordinator(text);
drop function if exists public.revoke_coordinator(text);
drop function if exists public.transfer_coordination(text);
drop function if exists public.delegate_coordination(text, date, date);
drop function if exists public.cancel_delegation(uuid);
drop function if exists public.list_delegations();
drop function if exists public.access_directory();
drop function if exists public.my_access();
drop function if exists public.unclaimed_teachers();
drop function if exists public.username_available(text);
drop function if exists public.effective_role(uuid);
drop function if exists public.assign_teacher_role(text, text, date, date);
drop table if exists public.coordinations;
drop table if exists public.profiles;

create or replace function public.app_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Dhaka')::date
$$;

alter table public.teachers add column if not exists auth_user_id uuid;
alter table public.teachers add column if not exists username text;
alter table public.teachers add column if not exists role text;
alter table public.teachers add column if not exists role_start date;
alter table public.teachers add column if not exists role_end date;
alter table public.teachers add column if not exists designation text not null default '';

update public.teachers
set role = 'teacher'
where role is null;

alter table public.teachers alter column role set default 'teacher';
alter table public.teachers alter column role set not null;

create unique index if not exists teachers_auth_user_id_key on public.teachers (auth_user_id);
create unique index if not exists teachers_username_key on public.teachers (username);

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

-- Stored role, or teacher when a dated role is outside today's Dhaka date.
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tid text := new.raw_user_meta_data ->> 'teacher_id';
  uname text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  first_account boolean;
begin
  if tid is null or tid = '' then
    raise exception 'Choose a teacher name before creating an account';
  end if;
  if uname !~ '^[a-z0-9][a-z0-9._-]{1,31}$' then
    raise exception 'Username must be 2–32 letters, numbers, dots, or dashes';
  end if;

  perform pg_advisory_xact_lock(814201);
  if exists (select 1 from public.teachers where username = uname and id is distinct from tid) then
    raise exception 'That username is already taken';
  end if;
  if not exists (select 1 from public.teachers where id = tid and auth_user_id is null) then
    raise exception 'That teacher name is already linked to an account';
  end if;

  select not exists (select 1 from public.teachers where auth_user_id is not null)
    into first_account;

  update public.teachers
  set auth_user_id = new.id,
      username = uname,
      role = case when first_account or uname = 'superadmin' then 'super_admin' else role end,
      role_start = case when first_account or uname = 'superadmin' then null else role_start end,
      role_end = case when first_account or uname = 'superadmin' then null else role_end end
  where id = tid
    and auth_user_id is null;

  if not found then
    raise exception 'That teacher name is already linked to an account';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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

revoke all on function public.effective_role(uuid) from public;
revoke all on function public.unclaimed_teachers() from public;
revoke all on function public.username_available(text) from public;
revoke all on function public.my_access() from public;
revoke all on function public.access_directory() from public;
revoke all on function public.assign_teacher_role(text, text, date, date) from public;
revoke all on function public.handle_new_user() from public;

grant execute on function public.unclaimed_teachers() to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.my_access() to authenticated;
grant execute on function public.access_directory() to authenticated;
grant execute on function public.assign_teacher_role(text, text, date, date) to authenticated;
grant execute on function public.effective_role(uuid) to authenticated;

alter table public.teachers enable row level security;
alter table public.modules enable row level security;
alter table public.batches enable row level security;
alter table public.schedules enable row level security;
alter table public.backups enable row level security;

drop policy if exists "Allow public all teachers" on public.teachers;
drop policy if exists "teachers select authenticated" on public.teachers;
drop policy if exists "teachers write editors" on public.teachers;
drop policy if exists "teachers write super admin" on public.teachers;
create policy "teachers select authenticated"
  on public.teachers for select to authenticated
  using (true);
create policy "teachers write super admin"
  on public.teachers for all to authenticated
  using (public.effective_role() = 'super_admin')
  with check (public.effective_role() = 'super_admin');

drop policy if exists "Allow public all modules" on public.modules;
drop policy if exists "modules select authenticated" on public.modules;
drop policy if exists "modules write editors" on public.modules;
drop policy if exists "modules write super admin" on public.modules;
create policy "modules select authenticated"
  on public.modules for select to authenticated
  using (true);
create policy "modules write super admin"
  on public.modules for all to authenticated
  using (public.effective_role() = 'super_admin')
  with check (public.effective_role() = 'super_admin');

drop policy if exists "Allow public all batches" on public.batches;
drop policy if exists "batches select authenticated" on public.batches;
drop policy if exists "batches write editors" on public.batches;
drop policy if exists "batches write super admin" on public.batches;
create policy "batches select authenticated"
  on public.batches for select to authenticated
  using (true);
create policy "batches write super admin"
  on public.batches for all to authenticated
  using (public.effective_role() = 'super_admin')
  with check (public.effective_role() = 'super_admin');

drop policy if exists "Allow public all schedules" on public.schedules;
drop policy if exists "schedules select authenticated" on public.schedules;
drop policy if exists "schedules write editors" on public.schedules;
create policy "schedules select authenticated"
  on public.schedules for select to authenticated
  using (true);
create policy "schedules write editors"
  on public.schedules for all to authenticated
  using (public.effective_role() in ('super_admin', 'coordinator', 'temp_coordinator'))
  with check (public.effective_role() in ('super_admin', 'coordinator', 'temp_coordinator'));

drop policy if exists "Allow public read backups" on public.backups;
drop policy if exists "Allow public insert backups" on public.backups;
drop policy if exists "backups select editors" on public.backups;
create policy "backups select editors"
  on public.backups for select to authenticated
  using (public.effective_role() in ('super_admin', 'coordinator', 'temp_coordinator'));
