-- Local proof for supabase/migration_courses.sql.
-- DO NOT RUN THIS ON THE LIVE PROJECT. It builds a throwaway schema,
-- loads a copy-shaped default schedule, runs the migration twice, and
-- checks backfill plus row-level security.
--
--   sudo -u postgres createdb routine_courses_test
--   sudo -u postgres psql -d routine_courses_test -v ON_ERROR_STOP=1 -f supabase/courses_rls_check.sql

create schema if not exists auth;
create schema if not exists backup;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant anon to postgres;
grant authenticated to postgres;

create table if not exists public.teachers (
  id text primary key,
  name text not null,
  designation text not null default '',
  username text,
  role text not null default 'teacher',
  role_start date,
  role_end date,
  auth_user_id uuid,
  pin text not null default '6832',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role in ('super_admin', 'coordinator', 'temp_coordinator', 'teacher')),
  check (
    (role in ('super_admin', 'teacher') and role_start is null and role_end is null)
    or (role in ('coordinator', 'temp_coordinator') and role_start is not null and role_end is not null and role_end >= role_start)
  )
);

create table if not exists public.schedules (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.batches (
  id integer primary key,
  name text not null default '',
  number_of_students integer not null default 40,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.backups (
  id bigserial primary key,
  type text not null check (type in ('teachers', 'batches', 'modules', 'schedules')),
  record_id text,
  data jsonb not null,
  operation text not null default 'SNAPSHOT',
  created_at timestamptz not null default now()
);

create or replace function public.app_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Dhaka')::date
$$;

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

create or replace function public.backup_record_trigger()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'DELETE' then
    insert into public.backups (type, record_id, data, operation)
    values (TG_TABLE_NAME, OLD.id::text, to_jsonb(OLD) - 'pin', 'DELETE');
    return OLD;
  end if;
  insert into public.backups (type, record_id, data, operation)
  values (TG_TABLE_NAME, NEW.id::text, to_jsonb(NEW) - 'pin', TG_OP);
  return NEW;
end;
$$;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'superadmin@routine.local'),
  ('22222222-2222-4222-8222-222222222222', 'coord@routine.local'),
  ('33333333-3333-4333-8333-333333333333', 'teacher@routine.local')
on conflict (id) do nothing;

insert into public.teachers (id, name, role, role_start, role_end, auth_user_id, pin) values
  ('superadmin', 'Super Admin', 'super_admin', null, null, '11111111-1111-4111-8111-111111111111', '1111'),
  ('coord-1', 'Course Coordinator', 'coordinator', public.app_today() - 1, public.app_today() + 30, '22222222-2222-4222-8222-222222222222', '2222'),
  ('teacher-1', 'A Teacher', 'teacher', null, null, '33333333-3333-4333-8333-333333333333', '6832')
on conflict (id) do nothing;

insert into public.schedules (id, data, updated_at)
values (
  'default',
  jsonb_build_object(
    'version', 1,
    'header', jsonb_build_array(
      jsonb_build_object('id', 'h1', 'style', 'normal', 'text', 'National Academy for Educational Management (NAEM)'),
      jsonb_build_object('id', 'h5', 'style', 'title', 'text', 'Advanced Course on Skill Development')
    ),
    'footer', jsonb_build_object(
      'name', 'Dr. Litan Kanti Halder',
      'courseName', 'Advanced Course on Skill Development'
    ),
    'batches', jsonb_build_array(
      jsonb_build_object('id', 'batch-9', 'name', '9th', 'numberOfStudents', 40, 'roster', jsonb_build_array('01', '02'))
    ),
    'days', jsonb_build_array(jsonb_build_object(
      'id', 'day-01',
      'date', '2026-10-19',
      'dayNumber', 1,
      'slots', jsonb_build_array(jsonb_build_object('id', 's1', 'kind', 'session', 'durationMin', 60)),
      'cells', jsonb_build_object('batch-9:s1', jsonb_build_object('code', 'M- 7.04', 'note', 'keep-me', 'teachers', jsonb_build_array('Prof. Asisul')))
    ))
  ),
  now()
)
on conflict (id) do nothing;

insert into public.batches (id, name, number_of_students) values (9, '', 40)
on conflict (id) do nothing;

create table if not exists public.test_schedule_fingerprint (
  id text primary key,
  digest text not null
);

insert into public.test_schedule_fingerprint (id, digest)
values ('default', (select md5(data::text) from public.schedules where id = 'default'))
on conflict (id) do nothing;

alter table public.teachers enable row level security;
drop policy if exists "teachers select all" on public.teachers;
create policy "teachers select all" on public.teachers for select to anon, authenticated using (true);

grant select on public.teachers to anon, authenticated;
grant select, insert, update, delete on public.schedules to anon, authenticated;
grant select, insert, update, delete on public.batches to anon, authenticated;

\ir migration_courses.sql
\ir migration_courses.sql

-- Proofs. A failed check raises and stops the script.
do $$
declare
  course_count int;
  course_name text;
  digest_now text;
  digest_before text;
  note text;
  batch_course uuid;
  assignment_count int;
  linked uuid;
  active_count int;
begin
  select count(*) into course_count from public.courses;
  if course_count <> 1 then
    raise exception 'backfill created % courses, expected 1', course_count;
  end if;

  select courses.name, schedules.course_id
  into course_name, linked
  from public.courses
  join public.schedules on schedules.course_id = courses.id
  where schedules.id = 'default';

  if course_name is distinct from 'Advanced Course on Skill Development' then
    raise exception 'default course name is %', course_name;
  end if;
  if linked is null then
    raise exception 'default schedule was not linked';
  end if;

  select digest into digest_before from public.test_schedule_fingerprint where id = 'default';
  select md5(data::text) into digest_now from public.schedules where id = 'default';
  if digest_now is distinct from digest_before then
    raise exception 'schedule JSON changed during backfill';
  end if;

  select data->'days'->0->'cells'->'batch-9:s1'->>'note'
  into note
  from public.schedules
  where id = 'default';
  if note is distinct from 'keep-me' then
    raise exception 'cell note was lost: %', note;
  end if;

  select course_id into batch_course from public.batches where id = 9;
  if batch_course is distinct from linked then
    raise exception 'catalog batch was not attached to the default course';
  end if;

  select count(*) into assignment_count
  from public.course_assignments
  where teacher_id = 'coord-1' and course_id = linked;
  if assignment_count <> 1 then
    raise exception 'coordinator assignment was not backfilled';
  end if;

  select count(*) into active_count from public.courses where status = 'active';
  if active_count <> 1 then
    raise exception 'expected the backfilled course to be active';
  end if;
end $$;

-- A second active course, an inactive course, and an ended course.
insert into public.courses (id, name, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Other Active Course', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Hidden Inactive Course', 'inactive'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'Ended Course', 'ended');

insert into public.schedules (id, course_id, data, updated_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '{"days":[{"id":"day-01","date":"2026-10-19","slots":[{"id":"s1","kind":"session","durationMin":60}]}],"batches":[]}'::jsonb, now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '{"days":[{"id":"day-01","date":"2026-10-19","slots":[{"id":"s1","kind":"session","durationMin":60}]}],"batches":[]}'::jsonb, now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '{"days":[{"id":"day-01","date":"2026-10-19","slots":[{"id":"s1","kind":"session","durationMin":60}]}],"batches":[]}'::jsonb, now());

do $$
declare
  n int;
  original_data jsonb;
  default_course uuid;
  other_course uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  inactive_course uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  ended_course uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  coord_uid text := '22222222-2222-4222-8222-222222222222';
  teacher_uid text := '33333333-3333-4333-8333-333333333333';
  admin_uid text := '11111111-1111-4111-8111-111111111111';
begin
  select course_id into default_course from public.schedules where id = 'default';

  perform set_config('request.jwt.claim.sub', coord_uid, true);
  execute 'set local role authenticated';

  update public.schedules set updated_at = now() where course_id = other_course;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'coordinator edited a course they are not assigned to (% rows)', n;
  end if;

  update public.schedules set updated_at = now() where course_id = default_course;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'coordinator could not edit their active course (% rows)', n;
  end if;

  select count(*) into n from public.courses where id = other_course;
  if n <> 0 then
    raise exception 'coordinator can see a course they are not assigned to';
  end if;

  execute 'reset role';
  update public.courses set status = 'ended' where id = default_course;

  perform set_config('request.jwt.claim.sub', coord_uid, true);
  execute 'set local role authenticated';
  update public.schedules set updated_at = now() where course_id = default_course;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'coordinator edited an ended course (% rows)', n;
  end if;

  select count(*) into n from public.courses where id = default_course;
  if n <> 1 then
    raise exception 'coordinator cannot read their ended course';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', admin_uid, true);
  execute 'set local role authenticated';
  update public.schedules set updated_at = now() where course_id = default_course;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'super admin could not edit an ended course (% rows)', n;
  end if;

  update public.courses set status = 'active' where id = default_course;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'super admin could not change course status';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', teacher_uid, true);
  execute 'set local role authenticated';

  update public.schedules set updated_at = now() where course_id = default_course;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'teacher wrote a schedule (% rows)', n;
  end if;

  update public.courses set name = 'Hacked' where id = default_course;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'teacher renamed a course';
  end if;

  select count(*) into n from public.courses where id = inactive_course;
  if n <> 0 then
    raise exception 'teacher can see an inactive course';
  end if;

  select count(*) into n from public.courses where status = 'active';
  if n <> 2 then
    raise exception 'teacher should see both active courses, saw %', n;
  end if;

  select count(*) into n from public.courses where id = ended_course;
  if n <> 1 then
    raise exception 'teacher cannot read an ended course';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin
    perform pin from public.teachers;
    raise exception 'anon read teachers.pin';
  exception
    when insufficient_privilege then
      null;
  end;
  begin
    perform 1 from public.courses;
    raise exception 'anon read courses';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', teacher_uid, true);
  execute 'set local role authenticated';
  perform name from public.teachers limit 1;
  begin
    perform pin from public.teachers;
    raise exception 'authenticated read teachers.pin';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  if (select name from public.courses where id = default_course) is distinct from 'Advanced Course on Skill Development' then
    raise exception 'course name was changed by a rejected update';
  end if;
  if (select count(*) from public.courses where status = 'active') < 2 then
    raise exception 'multiple active courses were not kept';
  end if;

  -- Installed web and 1.0.8 APK: read and upsert id = default with no course_id.
  perform set_config('request.jwt.claim.sub', coord_uid, true);
  execute 'set local role authenticated';

  select count(*) into n from public.schedules where id = 'default';
  if n <> 1 then
    raise exception 'legacy client could not load schedules.id = default';
  end if;

  select data into original_data from public.schedules where id = 'default';

  insert into public.schedules (id, data, updated_at)
  values (
    'default',
    jsonb_set(original_data, '{legacyProbe}', 'true'::jsonb),
    now()
  )
  on conflict (id) do update
  set data = excluded.data,
      updated_at = excluded.updated_at;

  if (select course_id from public.schedules where id = 'default') is distinct from default_course then
    raise exception 'legacy schedule upsert changed course_id';
  end if;
  if (select data -> 'legacyProbe' from public.schedules where id = 'default') is distinct from 'true'::jsonb then
    raise exception 'legacy schedule upsert did not save';
  end if;
  if (select data -> 'days' -> 0 -> 'cells' -> 'batch-9:s1' ->> 'note' from public.schedules where id = 'default') is distinct from 'keep-me' then
    raise exception 'legacy schedule upsert dropped existing cells';
  end if;

  insert into public.batches (id, name, number_of_students)
  values (9, 'legacy-name', 41)
  on conflict (id) do update
  set name = excluded.name,
      number_of_students = excluded.number_of_students;

  if (select course_id from public.batches where id = 9) is distinct from default_course then
    raise exception 'legacy batch upsert changed course_id';
  end if;
  if (select name from public.batches where id = 9) is distinct from 'legacy-name' then
    raise exception 'legacy batch upsert did not save';
  end if;

  insert into public.batches (id, name, number_of_students)
  values (99, 'legacy-new', 12)
  on conflict (id) do update
  set name = excluded.name;

  if (select course_id from public.batches where id = 99) is distinct from default_course then
    raise exception 'legacy batch insert did not attach the default course';
  end if;

  update public.schedules
  set data = original_data
  where id = 'default';
  update public.batches set name = '', number_of_students = 40 where id = 9;
  delete from public.batches where id = 99;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', teacher_uid, true);
  execute 'set local role authenticated';
  begin
    insert into public.schedules (id, data, updated_at)
    values ('default', '{"days":[]}'::jsonb, now())
    on conflict (id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at;
    raise exception 'teacher legacy upsert wrote the default schedule';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  if (select data -> 'legacyProbe' from public.schedules where id = 'default') is not null then
    raise exception 'legacy probe was left in the schedule';
  end if;
end $$;

select
  'ok' as result,
  (select name from public.courses c join public.schedules s on s.course_id = c.id where s.id = 'default') as default_course,
  (select md5(data::text) = (select digest from public.test_schedule_fingerprint where id = 'default') from public.schedules where id = 'default') as json_unchanged,
  (select count(*) from public.course_assignments where teacher_id = 'coord-1') as coordinator_assignments,
  (select count(*) from public.courses where status = 'active') as active_courses;
