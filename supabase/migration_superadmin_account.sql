-- Link the built-in shortcut (superadmin / the existing shortcut password)
-- to a real Supabase Auth user: superadmin@routine.local.
-- Safe to run more than once. Run after supabase/migration_add_auth_roles.sql.
--
-- This does not create the Auth user. The app signs that user in, or signs
-- them up, with the shortcut password. This file makes sure the matching
-- teachers row is super_admin with no dates, and that effective_role()
-- treats that email as super_admin.

update public.teachers
set username = null
where username = 'superadmin'
  and id is distinct from 'superadmin';

insert into public.teachers (id, name, username, role, role_start, role_end)
values ('superadmin', 'Super Admin', 'superadmin', 'super_admin', null, null)
on conflict (id) do update
set name = 'Super Admin',
    username = 'superadmin',
    role = 'super_admin',
    role_start = null,
    role_end = null;

update public.teachers as others
set auth_user_id = null
where others.auth_user_id in (
  select id from auth.users where lower(email) = 'superadmin@routine.local'
)
and others.id is distinct from 'superadmin';

update public.teachers
set auth_user_id = users.id,
    username = 'superadmin',
    role = 'super_admin',
    role_start = null,
    role_end = null,
    name = 'Super Admin'
from auth.users as users
where lower(users.email) = 'superadmin@routine.local'
  and teachers.id = 'superadmin';

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
  if lower(new.email) = 'superadmin@routine.local' then
    tid := 'superadmin';
    uname := 'superadmin';
  end if;
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
