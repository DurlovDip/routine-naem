-- ========================================================================
-- ROUTINE-NAEM: Accounts, roles, and row level security
-- Run this in the Supabase SQL Editor AFTER schema.sql (or the relational
-- and backup migrations). It does not drop teachers, modules, batches,
-- schedules, or backups.
--
-- Before creating accounts, in the Supabase dashboard open
-- Authentication → Providers → Email and turn OFF "Confirm email".
-- Accounts use a synthetic address, username@routine.local, so there is
-- no inbox to confirm.
--
-- The first account created becomes super_admin. To promote someone else:
--   update public.profiles
--   set base_role = 'super_admin'
--   where username = 'their-username';
-- ========================================================================

create or replace function public.app_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Dhaka')::date
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  teacher_id text not null unique references public.teachers (id) on delete restrict,
  base_role text not null default 'teacher' check (base_role in ('super_admin', 'teacher')),
  created_at timestamptz not null default now(),
  constraint profiles_username_lower check (username = lower(username)),
  constraint profiles_username_shape check (username ~ '^[a-z0-9][a-z0-9._-]{1,31}$')
);

create unique index if not exists profiles_username_key on public.profiles (username);

create table if not exists public.coordinations (
  id uuid primary key default gen_random_uuid(),
  teacher_id text not null references public.teachers (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('permanent', 'temporary')),
  starts_on date,
  ends_on date,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint coordination_dates check (
    (kind = 'permanent' and starts_on is null and ends_on is null)
    or (kind = 'temporary' and starts_on is not null and ends_on is not null and ends_on >= starts_on)
  )
);

create index if not exists coordinations_teacher_open_idx
  on public.coordinations (teacher_id)
  where revoked_at is null;

alter table public.profiles enable row level security;
alter table public.coordinations enable row level security;

create or replace function public.effective_role(uid uuid default auth.uid())
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  prof public.profiles;
  today date := public.app_today();
begin
  if uid is null then
    return null;
  end if;
  select * into prof from public.profiles where id = uid;
  if not found then
    return null;
  end if;
  if prof.base_role = 'super_admin' then
    return 'super_admin';
  end if;
  if exists (
    select 1
    from public.coordinations c
    where c.teacher_id = prof.teacher_id
      and c.revoked_at is null
      and (
        c.kind = 'permanent'
        or (c.kind = 'temporary' and today between c.starts_on and c.ends_on)
      )
  ) then
    return 'coordinator';
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
  select t.id, t.name
  from public.teachers t
  where not exists (select 1 from public.profiles p where p.teacher_id = t.id)
  order by t.name;
$$;

create or replace function public.username_available(uname text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles p where p.username = lower(trim(uname))
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
  tid text;
  make_admin boolean;
begin
  perform pg_advisory_xact_lock(87421001);
  uname := lower(trim(coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email, ''), '@', 1))));
  tid := nullif(trim(coalesce(new.raw_user_meta_data->>'teacher_id', '')), '');
  if uname is null or uname !~ '^[a-z0-9][a-z0-9._-]{1,31}$' then
    raise exception 'Choose a username of 2–32 letters, numbers, dots, or dashes.';
  end if;
  if tid is null or not exists (select 1 from public.teachers where id = tid) then
    raise exception 'Choose your name from the teacher list.';
  end if;
  if exists (select 1 from public.profiles where teacher_id = tid) then
    raise exception 'That teacher already has an account.';
  end if;
  if exists (select 1 from public.profiles where username = uname) then
    raise exception 'That username is already taken.';
  end if;
  select not exists (select 1 from public.profiles) into make_admin;
  insert into public.profiles (id, username, teacher_id, base_role)
  values (new.id, uname, tid, case when make_admin then 'super_admin' else 'teacher' end);
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
  base_role text,
  effective text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  return query
  select p.username, p.teacher_id, t.name, p.base_role, public.effective_role(p.id)
  from public.profiles p
  left join public.teachers t on t.id = p.teacher_id
  where p.id = auth.uid();
end;
$$;

create or replace function public.access_directory()
returns table (
  teacher_id text,
  teacher_name text,
  username text,
  base_role text,
  effective text,
  has_permanent boolean,
  temporary_until date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := public.app_today();
begin
  if public.effective_role() not in ('super_admin', 'coordinator') then
    raise exception 'Not allowed';
  end if;
  return query
  select
    t.id,
    t.name,
    p.username,
    p.base_role,
    case when p.id is null then null else public.effective_role(p.id) end,
    exists (
      select 1 from public.coordinations c
      where c.teacher_id = t.id and c.revoked_at is null and c.kind = 'permanent'
    ),
    (
      select max(c.ends_on)
      from public.coordinations c
      where c.teacher_id = t.id
        and c.revoked_at is null
        and c.kind = 'temporary'
        and today between c.starts_on and c.ends_on
    )
  from public.teachers t
  left join public.profiles p on p.teacher_id = t.id
  order by t.name;
end;
$$;

create or replace function public.list_delegations()
returns table (
  id uuid,
  teacher_id text,
  teacher_name text,
  granted_by uuid,
  kind text,
  starts_on date,
  ends_on date,
  active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := public.app_today();
begin
  if public.effective_role() not in ('super_admin', 'coordinator') then
    raise exception 'Not allowed';
  end if;
  return query
  select
    c.id,
    c.teacher_id,
    t.name,
    c.granted_by,
    c.kind,
    c.starts_on,
    c.ends_on,
    (
      c.revoked_at is null
      and (
        c.kind = 'permanent'
        or today between c.starts_on and c.ends_on
      )
    )
  from public.coordinations c
  join public.teachers t on t.id = c.teacher_id
  where c.revoked_at is null
  order by c.created_at desc;
end;
$$;

create or replace function public.assign_coordinator(target_teacher text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.effective_role() <> 'super_admin' then
    raise exception 'Only a super admin can assign coordinators.';
  end if;
  if not exists (select 1 from public.teachers where id = target_teacher) then
    raise exception 'Unknown teacher.';
  end if;
  if exists (
    select 1 from public.coordinations
    where teacher_id = target_teacher and kind = 'permanent' and revoked_at is null
  ) then
    return;
  end if;
  insert into public.coordinations (teacher_id, granted_by, kind)
  values (target_teacher, auth.uid(), 'permanent');
end;
$$;

create or replace function public.revoke_coordinator(target_teacher text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.effective_role() <> 'super_admin' then
    raise exception 'Only a super admin can end coordination.';
  end if;
  update public.coordinations
  set revoked_at = now()
  where teacher_id = target_teacher and revoked_at is null;
end;
$$;

create or replace function public.transfer_coordination(target_teacher text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mine text;
begin
  if public.effective_role() not in ('super_admin', 'coordinator') then
    raise exception 'Only a coordinator can hand off coordination.';
  end if;
  if not exists (select 1 from public.teachers where id = target_teacher) then
    raise exception 'Unknown teacher.';
  end if;
  select teacher_id into mine from public.profiles where id = auth.uid();
  if target_teacher = mine then
    raise exception 'Choose another teacher.';
  end if;
  if mine is not null then
    update public.coordinations
    set revoked_at = now()
    where teacher_id = mine and kind = 'permanent' and revoked_at is null;
  end if;
  if not exists (
    select 1 from public.coordinations
    where teacher_id = target_teacher and kind = 'permanent' and revoked_at is null
  ) then
    insert into public.coordinations (teacher_id, granted_by, kind)
    values (target_teacher, auth.uid(), 'permanent');
  end if;
end;
$$;

create or replace function public.delegate_coordination(
  target_teacher text,
  start_on date,
  end_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mine text;
begin
  if public.effective_role() not in ('super_admin', 'coordinator') then
    raise exception 'Only a coordinator can delegate.';
  end if;
  if start_on is null or end_on is null or end_on < start_on then
    raise exception 'Choose a start and end date.';
  end if;
  if not exists (select 1 from public.teachers where id = target_teacher) then
    raise exception 'Unknown teacher.';
  end if;
  select teacher_id into mine from public.profiles where id = auth.uid();
  if target_teacher = mine then
    raise exception 'Choose another teacher.';
  end if;
  insert into public.coordinations (teacher_id, granted_by, kind, starts_on, ends_on)
  values (target_teacher, auth.uid(), 'temporary', start_on, end_on);
end;
$$;

create or replace function public.cancel_delegation(delegation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if public.effective_role() not in ('super_admin', 'coordinator') then
    raise exception 'Not allowed';
  end if;
  update public.coordinations
  set revoked_at = now()
  where id = delegation_id
    and revoked_at is null
    and (
      public.effective_role() = 'super_admin'
      or granted_by = auth.uid()
    );
  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'That delegation is already closed.';
  end if;
end;
$$;

revoke all on function public.effective_role(uuid) from public, anon, authenticated;
revoke all on function public.unclaimed_teachers() from public, anon, authenticated;
revoke all on function public.username_available(text) from public, anon, authenticated;
revoke all on function public.my_access() from public, anon, authenticated;
revoke all on function public.access_directory() from public, anon, authenticated;
revoke all on function public.list_delegations() from public, anon, authenticated;
revoke all on function public.assign_coordinator(text) from public, anon, authenticated;
revoke all on function public.revoke_coordinator(text) from public, anon, authenticated;
revoke all on function public.transfer_coordination(text) from public, anon, authenticated;
revoke all on function public.delegate_coordination(text, date, date) from public, anon, authenticated;
revoke all on function public.cancel_delegation(uuid) from public, anon, authenticated;
revoke all on function public.app_today() from public, anon, authenticated;

grant execute on function public.effective_role(uuid) to authenticated;
grant execute on function public.unclaimed_teachers() to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.my_access() to authenticated;
grant execute on function public.access_directory() to authenticated;
grant execute on function public.list_delegations() to authenticated;
grant execute on function public.assign_coordinator(text) to authenticated;
grant execute on function public.revoke_coordinator(text) to authenticated;
grant execute on function public.transfer_coordination(text) to authenticated;
grant execute on function public.delegate_coordination(text, date, date) to authenticated;
grant execute on function public.cancel_delegation(uuid) to authenticated;

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin"
  on public.profiles for select
  using (id = auth.uid() or public.effective_role() = 'super_admin');

drop policy if exists "coordinations read editors" on public.coordinations;
create policy "coordinations read editors"
  on public.coordinations for select
  using (
    public.effective_role() in ('super_admin', 'coordinator')
    or teacher_id = (select p.teacher_id from public.profiles p where p.id = auth.uid())
  );

-- Replace the open policies. Reads need a signed-in user.
-- Writes need a super admin or a coordinator whose dates are current.
drop policy if exists "Allow public all teachers" on public.teachers;
drop policy if exists "teachers select authenticated" on public.teachers;
drop policy if exists "teachers write editors" on public.teachers;
create policy "teachers select authenticated"
  on public.teachers for select
  using (auth.role() = 'authenticated');
create policy "teachers write editors"
  on public.teachers for all
  using (public.effective_role() in ('super_admin', 'coordinator'))
  with check (public.effective_role() in ('super_admin', 'coordinator'));

drop policy if exists "Allow public all modules" on public.modules;
drop policy if exists "modules select authenticated" on public.modules;
drop policy if exists "modules write editors" on public.modules;
create policy "modules select authenticated"
  on public.modules for select
  using (auth.role() = 'authenticated');
create policy "modules write editors"
  on public.modules for all
  using (public.effective_role() in ('super_admin', 'coordinator'))
  with check (public.effective_role() in ('super_admin', 'coordinator'));

drop policy if exists "Allow public all batches" on public.batches;
drop policy if exists "batches select authenticated" on public.batches;
drop policy if exists "batches write editors" on public.batches;
create policy "batches select authenticated"
  on public.batches for select
  using (auth.role() = 'authenticated');
create policy "batches write editors"
  on public.batches for all
  using (public.effective_role() in ('super_admin', 'coordinator'))
  with check (public.effective_role() in ('super_admin', 'coordinator'));

drop policy if exists "Allow public all schedules" on public.schedules;
drop policy if exists "schedules select authenticated" on public.schedules;
drop policy if exists "schedules write editors" on public.schedules;
create policy "schedules select authenticated"
  on public.schedules for select
  using (auth.role() = 'authenticated');
create policy "schedules write editors"
  on public.schedules for all
  using (public.effective_role() in ('super_admin', 'coordinator'))
  with check (public.effective_role() in ('super_admin', 'coordinator'));

drop policy if exists "Allow public read backups" on public.backups;
drop policy if exists "Allow public insert backups" on public.backups;
drop policy if exists "backups select editors" on public.backups;
create policy "backups select editors"
  on public.backups for select
  using (public.effective_role() in ('super_admin', 'coordinator'));
-- No insert, update, or delete policy. The backup trigger is security definer
-- and still mirrors rows. Clients cannot change or erase backups.
