-- ========================================================================
-- ROUTINE-NAEM: Teacher PIN sign-in
-- Run this in the Supabase SQL Editor AFTER supabase/migration_add_auth_roles.sql
-- (and migration_superadmin_account.sql if you already use it). Safe to re-run.
-- Re-running sets EVERY teacher's PIN back to 6832 and syncs Auth passwords.
--
-- What Durlov runs
--   1. Open the Supabase dashboard → SQL Editor.
--   2. Paste this whole file and run it as the project database owner
--      (the SQL Editor session). That role can write auth.users.
--   3. Leave Authentication → Providers → Email → "Confirm email" as it is.
--      This script inserts @routine.local users with email_confirmed_at set,
--      so Auth never tries to mail those addresses. Do not create these
--      users with the app's old sign-up button.
--   4. The default PIN for every teacher, including Super Admin, is 6832.
--      A signed-in teacher changes their own PIN in the app. A super admin
--      resets any teacher from Roles / Manage.
--
-- If the script stops on auth.users or auth.identities, read the error,
-- fix nothing in the client, and run this file again from the SQL Editor.
-- The anon key cannot create Auth users while Confirm email is on.
-- ========================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Keep PINs out of the backup copies this trigger writes.
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

alter table public.teachers add column if not exists pin text;
update public.teachers set pin = '6832';
alter table public.teachers alter column pin set default '6832';
alter table public.teachers alter column pin set not null;

alter table public.teachers drop constraint if exists teachers_pin_shape;
alter table public.teachers
  add constraint teachers_pin_shape
  check (pin ~ '^[0-9]{4}$');

comment on column public.teachers.pin is
  '4-digit sign-in PIN. Default 6832. Hidden from client table reads; change it through change_pin or admin_reset_pin.';

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
    pin = '6832',
    name = case
      when public.teachers.name is null or btrim(public.teachers.name) = '' then excluded.name
      else public.teachers.name
    end;

-- Link a provisioned Auth user without turning the first PIN sign-in into a super admin.
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

-- Create or refresh the Auth user for one teacher. Password is the current PIN.
-- Email is username@routine.local, or a stable id local-part when username is empty.
-- Not granted to anon or authenticated. login_with_pin / change_pin / admin_reset_pin call it.
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

revoke all on function public.teacher_auth_email(text) from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.login_with_pin(text, text) from public;
revoke all on function public.change_pin(text, text) from public;
revoke all on function public.admin_reset_pin(text, text) from public;
revoke all on function public.teacher_sign_in_options() from public;

grant execute on function public.login_with_pin(text, text) to anon, authenticated;
grant execute on function public.change_pin(text, text) to authenticated;
grant execute on function public.admin_reset_pin(text, text) to authenticated;
grant execute on function public.teacher_sign_in_options() to anon, authenticated;

-- One Auth user per teacher, email confirmed, password equal to the current PIN.
do $$
declare
  rec record;
begin
  for rec in select teachers.id from public.teachers order by teachers.id loop
    perform public.teacher_auth_email(rec.id);
  end loop;
end $$;

revoke all on table public.teachers from anon, authenticated;
grant select (
  id, name, designation, username, role, role_start, role_end, auth_user_id, created_at, updated_at
) on public.teachers to authenticated;
grant insert (id, name, designation, updated_at) on public.teachers to authenticated;
grant update (name, designation, updated_at) on public.teachers to authenticated;
grant delete on public.teachers to authenticated;

alter table public.teachers enable row level security;
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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
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

do $$
declare
  found_name text;
  found_pin text;
  other_pins integer;
begin
  select count(*) into other_pins
  from public.teachers
  where pin is distinct from '6832';
  if other_pins > 0 then
    raise exception 'PIN seed check failed: % teacher(s) do not have PIN 6832', other_pins;
  end if;

  select name, pin into found_name, found_pin
  from public.teachers
  where name ilike '%litan%'
  order by (name ilike '%litan kanti halder%') desc, name
  limit 1;

  if found_name is null then
    raise exception 'PIN seed check failed: no teacher name matches Litan';
  end if;
  if found_pin is distinct from '6832' then
    raise exception 'PIN seed check failed: % has pin %', found_name, found_pin;
  end if;
  raise notice 'PIN seed check: % pin is 6832', found_name;
end $$;

select id, name, pin
from public.teachers
where name ilike '%litan%'
order by (name ilike '%litan kanti halder%') desc, name;
