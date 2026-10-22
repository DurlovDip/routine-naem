-- ========================================================================
-- ROUTINE-NAEM: Courses
-- Run this once in the Supabase SQL editor on the LIVE project.
-- Safe to run again. It does not rewrite schedules.data, PINs, or passwords.
--
-- Do not run supabase/whole.sql or supabase/seed.sql on that project.
-- whole.sql is for a brand-new database and already includes this model.
--
-- Decisions (see docs/courses-design.md):
--   * schedules keeps its text id. course_id is unique, so one routine per course.
--     The existing id = 'default' row is kept and linked, not copied.
--   * Printed batches, header, and footer stay inside that course's JSON.
--     public.batches gains course_id and primary key (course_id, id).
--   * Coordinators are assigned per course in course_assignments
--     (Durlov: switch to a single teachers.course_id if one course per person).
-- ========================================================================

-- ------------------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------------------

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  status text not null default 'active',
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text
);

alter table public.courses add column if not exists code text;
alter table public.courses add column if not exists status text not null default 'active';
alter table public.courses add column if not exists start_date date;
alter table public.courses add column if not exists end_date date;
alter table public.courses add column if not exists created_at timestamptz not null default now();
alter table public.courses add column if not exists updated_at timestamptz not null default now();
alter table public.courses add column if not exists created_by text;

alter table public.schedules add column if not exists course_id uuid;
alter table public.batches add column if not exists course_id uuid;

create table if not exists public.course_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id text not null,
  course_id uuid not null,
  role text not null,
  role_start date not null,
  role_end date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.course_assignments add column if not exists created_at timestamptz not null default now();
alter table public.course_assignments add column if not exists updated_at timestamptz not null default now();

-- ------------------------------------------------------------------------
-- 2. CHECKS, KEYS, TRIGGERS (shape only; NOT NULL follows the backfill)
-- ------------------------------------------------------------------------

alter table public.courses drop constraint if exists courses_status_check;
alter table public.courses
  add constraint courses_status_check
  check (status in ('active', 'inactive', 'ended'));

alter table public.courses drop constraint if exists courses_name_not_blank;
alter table public.courses
  add constraint courses_name_not_blank
  check (btrim(name) <> '');

alter table public.courses drop constraint if exists courses_dates;
alter table public.courses
  add constraint courses_dates
  check (end_date is null or start_date is null or end_date >= start_date);

alter table public.course_assignments drop constraint if exists course_assignments_role_check;
alter table public.course_assignments
  add constraint course_assignments_role_check
  check (role in ('coordinator', 'temp_coordinator'));

alter table public.course_assignments drop constraint if exists course_assignments_dates;
alter table public.course_assignments
  add constraint course_assignments_dates
  check (role_end >= role_start);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'courses_created_by_fkey') then
    alter table public.courses
      add constraint courses_created_by_fkey
      foreign key (created_by) references public.teachers (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_assignments_teacher_id_fkey') then
    alter table public.course_assignments
      add constraint course_assignments_teacher_id_fkey
      foreign key (teacher_id) references public.teachers (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_assignments_course_id_fkey') then
    alter table public.course_assignments
      add constraint course_assignments_course_id_fkey
      foreign key (course_id) references public.courses (id) on delete cascade;
  end if;
end $$;

create unique index if not exists course_assignments_teacher_course_key
  on public.course_assignments (teacher_id, course_id);
create index if not exists course_assignments_course_id_idx
  on public.course_assignments (course_id);

create or replace function public.courses_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.name := btrim(new.name);
  if new.code is not null then
    new.code := nullif(btrim(new.code), '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_courses_before_write on public.courses;
create trigger trg_courses_before_write
  before insert or update on public.courses
  for each row execute function public.courses_before_write();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_course_assignments_touch on public.course_assignments;
create trigger trg_course_assignments_touch
  before update on public.course_assignments
  for each row execute function public.touch_updated_at();

comment on table public.courses is
  'A training course. Several rows may be active at once. Status inactive is hidden from teachers; ended is read-only except for a super admin.';
comment on column public.schedules.course_id is
  'The one routine document for this course. Unique. The legacy row keeps id = default.';

-- ------------------------------------------------------------------------
-- 3. HELPERS USED BY THE BACKFILL
-- ------------------------------------------------------------------------

create or replace function public.course_title_from_schedule(doc jsonb)
returns text
language sql
immutable
as $$
  select coalesce(
    (
      select btrim(line->>'text')
      from jsonb_array_elements(coalesce(doc->'header', '[]'::jsonb)) as line
      where line->>'style' = 'title'
        and btrim(coalesce(line->>'text', '')) <> ''
      limit 1
    ),
    nullif(btrim(coalesce(doc->'footer'->>'courseName', '')), ''),
    'Advanced Course on Skill Development'
  )
$$;

-- ------------------------------------------------------------------------
-- 4. BACKFILL (does not rewrite schedules.data)
-- ------------------------------------------------------------------------

do $$
declare
  rec record;
  cid uuid;
  first_course uuid;
begin
  for rec in
    select id, data
    from public.schedules
    where course_id is null
    order by case when id = 'default' then 0 else 1 end, id
  loop
    insert into public.courses (name, status)
    values (public.course_title_from_schedule(rec.data), 'active')
    returning id into cid;
    update public.schedules set course_id = cid where id = rec.id;
    if rec.id = 'default' then
      first_course := cid;
    end if;
  end loop;

  if first_course is null then
    select course_id into first_course from public.schedules where id = 'default';
  end if;

  if first_course is not null then
    insert into public.course_assignments (teacher_id, course_id, role, role_start, role_end)
    select teachers.id, first_course, teachers.role, teachers.role_start, teachers.role_end
    from public.teachers
    where teachers.role in ('coordinator', 'temp_coordinator')
      and teachers.role_start is not null
      and teachers.role_end is not null
      and teachers.role_end >= teachers.role_start
    on conflict (teacher_id, course_id) do nothing;

    update public.batches
    set course_id = first_course
    where course_id is null;
  end if;

  if exists (select 1 from public.batches where course_id is null) then
    select id into cid from public.courses order by created_at limit 1;
    if cid is null then
      insert into public.courses (name, status)
      values ('Advanced Course on Skill Development', 'active')
      returning id into cid;
    end if;
    update public.batches set course_id = cid where course_id is null;
  end if;
end $$;

do $$
begin
  if exists (select 1 from public.schedules where course_id is null) then
    raise exception 'schedules.course_id is still null after backfill';
  end if;
  if exists (select 1 from public.batches where course_id is null) then
    raise exception 'batches.course_id is still null after backfill';
  end if;
end $$;

-- ------------------------------------------------------------------------
-- 5. REQUIRED LINKS
-- ------------------------------------------------------------------------

alter table public.schedules alter column course_id set not null;
alter table public.batches alter column course_id set not null;

create unique index if not exists schedules_course_id_key on public.schedules (course_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'schedules_course_id_fkey') then
    alter table public.schedules
      add constraint schedules_course_id_fkey
      foreign key (course_id) references public.courses (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'batches_course_id_fkey') then
    alter table public.batches
      add constraint batches_course_id_fkey
      foreign key (course_id) references public.courses (id) on delete cascade;
  end if;
end $$;

do $$
declare
  cols text;
begin
  if exists (
    select 1
    from public.batches
    group by course_id, id
    having count(*) > 1
  ) then
    raise exception 'batches has duplicate (course_id, id); resolve them before changing the primary key';
  end if;

  select string_agg(attribute.attname, ',' order by key.ord)
  into cols
  from pg_constraint constraint_row
  join lateral unnest(constraint_row.conkey) with ordinality as key(attnum, ord) on true
  join pg_attribute attribute
    on attribute.attrelid = constraint_row.conrelid
   and attribute.attnum = key.attnum
  where constraint_row.conrelid = 'public.batches'::regclass
    and constraint_row.contype = 'p';

  if cols is distinct from 'course_id,id' then
    alter table public.batches drop constraint if exists batches_pkey;
    alter table public.batches add constraint batches_pkey primary key (course_id, id);
  end if;
end $$;

-- ------------------------------------------------------------------------
-- 6. FUNCTIONS
-- ------------------------------------------------------------------------

-- Policies from a previous run of this file call these functions.
drop policy if exists "courses select visible" on public.courses;
drop policy if exists "courses write super admin" on public.courses;
drop policy if exists "course assignments select" on public.course_assignments;
drop policy if exists "course assignments write super admin" on public.course_assignments;
drop policy if exists "schedules select all" on public.schedules;
drop policy if exists "schedules select visible" on public.schedules;
drop policy if exists "schedules write editors" on public.schedules;
drop policy if exists "Allow public all schedules" on public.schedules;
drop policy if exists "batches select all" on public.batches;
drop policy if exists "batches select visible" on public.batches;
drop policy if exists "batches write super admin" on public.batches;
drop policy if exists "batches write editors" on public.batches;
drop policy if exists "Allow public all batches" on public.batches;

drop function if exists public.my_courses();
drop function if exists public.list_course_assignments();
drop function if exists public.create_course(text, text, text, date, date);
drop function if exists public.blank_course_schedule(text);
drop function if exists public.assign_course_role(text, text, date, date, uuid);
drop function if exists public.refresh_teacher_role_summary(text);
drop function if exists public.can_read_course(uuid);
drop function if exists public.can_edit_course(uuid);

create or replace function public.can_read_course(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor text := public.effective_role();
begin
  if auth.uid() is null or target is null or actor is null then
    return false;
  end if;
  if actor = 'super_admin' then
    return exists (select 1 from public.courses where id = target);
  end if;
  if actor in ('coordinator', 'temp_coordinator') then
    return exists (
      select 1
      from public.course_assignments assigned
      join public.teachers teacher on teacher.id = assigned.teacher_id
      where assigned.course_id = target
        and teacher.auth_user_id = auth.uid()
    );
  end if;
  return exists (
    select 1 from public.courses
    where id = target
      and status in ('active', 'ended')
  );
end;
$$;

create or replace function public.can_edit_course(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or target is null then
    return false;
  end if;
  if public.effective_role() = 'super_admin' then
    return exists (select 1 from public.courses where id = target);
  end if;
  return exists (
    select 1
    from public.courses course
    join public.course_assignments assigned on assigned.course_id = course.id
    join public.teachers teacher on teacher.id = assigned.teacher_id
    where course.id = target
      and teacher.auth_user_id = auth.uid()
      and course.status = 'active'
      and public.app_today() between assigned.role_start and assigned.role_end
  );
end;
$$;

create or replace function public.refresh_teacher_role_summary(target_teacher text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  picked public.course_assignments%rowtype;
  today date := public.app_today();
begin
  if coalesce((select role from public.teachers where id = target_teacher), '') = 'super_admin' then
    return;
  end if;

  select * into picked
  from public.course_assignments
  where teacher_id = target_teacher
    and today between role_start and role_end
  order by case when role = 'coordinator' then 0 else 1 end, role_start
  limit 1;

  if not found then
    select * into picked
    from public.course_assignments
    where teacher_id = target_teacher
      and role_start > today
    order by role_start
    limit 1;
  end if;

  if not found then
    select * into picked
    from public.course_assignments
    where teacher_id = target_teacher
      and role_end < today
    order by role_end desc
    limit 1;
  end if;

  if not found then
    update public.teachers
    set role = 'teacher', role_start = null, role_end = null, updated_at = now()
    where id = target_teacher
      and role is distinct from 'super_admin';
    return;
  end if;

  update public.teachers
  set role = picked.role,
      role_start = picked.role_start,
      role_end = picked.role_end,
      updated_at = now()
  where id = target_teacher
    and role is distinct from 'super_admin';
end;
$$;

create or replace function public.blank_course_schedule(course_name text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'version', 1,
    'header', jsonb_build_array(
      jsonb_build_object('id', 'h1', 'style', 'normal', 'text', 'Enhancing Professional Skills of Teachers Scheme'),
      jsonb_build_object('id', 'h2', 'style', 'normal', 'text', 'Secondary Education Development Program (SEDP)'),
      jsonb_build_object('id', 'h3', 'style', 'normal', 'text', 'National Academy for Educational Management (NAEM)'),
      jsonb_build_object('id', 'h4', 'style', 'normal', 'text', 'Secondary and Higher Education Division, Ministry of Education'),
      jsonb_build_object('id', 'h5', 'style', 'title', 'text', btrim(course_name)),
      jsonb_build_object('id', 'h6', 'style', 'subtitle', 'text', 'For Assistant Professors of BCS (General Education) Cadre'),
      jsonb_build_object('id', 'h7', 'style', 'normal', 'text', '(Duration: Training Course Schedule)')
    ),
    'footer', jsonb_build_object(
      'signature', null,
      'signatureDate', '',
      'name', '',
      'designation', 'Assistant Director',
      'isCourseCoordinator', true,
      'courseName', btrim(course_name),
      'lines', jsonb_build_array('Assistant Director & Course Coordinator', btrim(course_name))
    ),
    'recapLabel', 'Recap & Day Manager',
    'batches', '[]'::jsonb,
    'teachers', '[]'::jsonb,
    'modules', '[]'::jsonb,
    'moduleNumbers', '[]'::jsonb,
    'subNumbers', '[]'::jsonb,
    'days', jsonb_build_array(jsonb_build_object(
      'id', 'day-01',
      'date', to_char(public.app_today(), 'YYYY-MM-DD'),
      'dayNumber', 1,
      'dayStart', '09:00',
      'recapMin', 30,
      'defaultSessionMin', 60,
      'slots', jsonb_build_array(
        jsonb_build_object('id', 's1', 'kind', 'session', 'durationMin', 60),
        jsonb_build_object('id', 'break-tea', 'kind', 'break', 'label', 'Tea Break', 'durationMin', 30),
        jsonb_build_object('id', 's2', 'kind', 'session', 'durationMin', 60),
        jsonb_build_object('id', 's3', 'kind', 'session', 'durationMin', 60),
        jsonb_build_object('id', 'break-lunch', 'kind', 'break', 'label', 'Prayer & Lunch Break', 'durationMin', 60),
        jsonb_build_object('id', 's4', 'kind', 'session', 'durationMin', 60),
        jsonb_build_object('id', 's5', 'kind', 'session', 'durationMin', 60)
      ),
      'managers', '{}'::jsonb,
      'cells', '{}'::jsonb,
      'merges', '[]'::jsonb
    )),
    'activeDayId', 'day-01',
    'autoRotate', true,
    'showConflicts', true
  )
$$;

create or replace function public.create_course(
  course_name text,
  course_code text,
  course_status text,
  course_start date,
  course_end date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  actor text;
  next_status text := coalesce(nullif(btrim(course_status), ''), 'active');
begin
  if public.effective_role() is distinct from 'super_admin' then
    raise exception 'Only a super admin can create a course';
  end if;
  if course_name is null or btrim(course_name) = '' then
    raise exception 'A course needs a name';
  end if;
  if next_status not in ('active', 'inactive', 'ended') then
    raise exception 'Status must be active, inactive, or ended';
  end if;
  if course_start is not null and course_end is not null and course_end < course_start then
    raise exception 'The end date cannot be before the start date';
  end if;

  select id into actor from public.teachers where auth_user_id = auth.uid();

  insert into public.courses (name, code, status, start_date, end_date, created_by)
  values (
    btrim(course_name),
    nullif(btrim(coalesce(course_code, '')), ''),
    next_status,
    course_start,
    course_end,
    actor
  )
  returning id into cid;

  insert into public.schedules (id, course_id, data, updated_at)
  values (cid::text, cid, public.blank_course_schedule(course_name), now());

  return cid;
end;
$$;

create or replace function public.assign_course_role(
  target_teacher text,
  next_role text,
  start_on date,
  end_on date,
  target_course uuid
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
    if target_course is null then
      delete from public.course_assignments where teacher_id = target_teacher;
    else
      delete from public.course_assignments
      where teacher_id = target_teacher
        and course_id = target_course;
    end if;
    perform public.refresh_teacher_role_summary(target_teacher);
    return;
  end if;

  if target_course is null or not exists (select 1 from public.courses where id = target_course) then
    raise exception 'Choose a course';
  end if;
  if start_on is null or end_on is null or end_on < start_on then
    raise exception 'A coordinator needs a start date and an end date';
  end if;

  insert into public.course_assignments (teacher_id, course_id, role, role_start, role_end)
  values (target_teacher, target_course, next_role, start_on, end_on)
  on conflict (teacher_id, course_id) do update
  set role = excluded.role,
      role_start = excluded.role_start,
      role_end = excluded.role_end,
      updated_at = now();

  perform public.refresh_teacher_role_summary(target_teacher);
end;
$$;

create or replace function public.my_courses()
returns table (
  id uuid,
  name text,
  code text,
  status text,
  start_date date,
  end_date date,
  schedule_id text,
  can_edit boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    course.id,
    course.name,
    course.code,
    course.status,
    course.start_date,
    course.end_date,
    schedule.id,
    public.can_edit_course(course.id),
    greatest(course.updated_at, coalesce(schedule.updated_at, course.updated_at))
  from public.courses course
  join public.schedules schedule on schedule.course_id = course.id
  where public.can_read_course(course.id)
  order by
    case course.status when 'active' then 0 when 'inactive' then 1 else 2 end,
    greatest(course.updated_at, coalesce(schedule.updated_at, course.updated_at)) desc,
    course.name
$$;

create or replace function public.list_course_assignments()
returns table (
  teacher_id text,
  course_id uuid,
  course_name text,
  role text,
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
    raise exception 'Only a super admin can open course assignments';
  end if;
  return query
    select
      assigned.teacher_id,
      assigned.course_id,
      course.name,
      assigned.role,
      assigned.role_start,
      assigned.role_end
    from public.course_assignments assigned
    join public.courses course on course.id = assigned.course_id
    order by course.name, assigned.teacher_id;
end;
$$;

-- ------------------------------------------------------------------------
-- 7. GRANTS (pin stays revoked)
-- ------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.courses from anon';
    execute 'revoke all on table public.course_assignments from anon';
    execute 'revoke all on table public.schedules from anon';
    execute 'revoke all on table public.batches from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select, insert, update, delete on table public.courses to authenticated';
    execute 'grant select, insert, update, delete on table public.course_assignments to authenticated';
    execute 'grant select, insert, update, delete on table public.schedules to authenticated';
    execute 'grant select, insert, update, delete on table public.batches to authenticated';
  end if;
end $$;

-- A table-level SELECT still includes pin. Revoke it and grant every other column back.
-- Same shape as supabase/lock_teacher_pin.sql. PIN values are not changed.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'teachers' and column_name = 'pin'
  ) and exists (select 1 from pg_roles where rolname = 'anon')
    and exists (select 1 from pg_roles where rolname = 'authenticated')
  then
    revoke all on table public.teachers from anon, authenticated;
    grant select (
      id, name, designation, username, role, role_start, role_end, auth_user_id, created_at, updated_at
    ) on public.teachers to anon, authenticated;
    grant insert (id, name, designation, updated_at) on public.teachers to authenticated;
    grant update (name, designation, updated_at) on public.teachers to authenticated;
    grant delete on public.teachers to authenticated;
  end if;
end $$;

revoke all on function public.course_title_from_schedule(jsonb) from public;
revoke all on function public.can_read_course(uuid) from public;
revoke all on function public.can_edit_course(uuid) from public;
revoke all on function public.refresh_teacher_role_summary(text) from public;
revoke all on function public.blank_course_schedule(text) from public;
revoke all on function public.create_course(text, text, text, date, date) from public;
revoke all on function public.assign_course_role(text, text, date, date, uuid) from public;
revoke all on function public.my_courses() from public;
revoke all on function public.list_course_assignments() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.can_read_course(uuid) to authenticated';
    execute 'grant execute on function public.can_edit_course(uuid) to authenticated';
    execute 'grant execute on function public.create_course(text, text, text, date, date) to authenticated';
    execute 'grant execute on function public.assign_course_role(text, text, date, date, uuid) to authenticated';
    execute 'grant execute on function public.my_courses() to authenticated';
    execute 'grant execute on function public.list_course_assignments() to authenticated';
  end if;
end $$;

-- ------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ------------------------------------------------------------------------

alter table public.courses enable row level security;
alter table public.course_assignments enable row level security;
alter table public.schedules enable row level security;
alter table public.batches enable row level security;

create policy "courses select visible"
  on public.courses for select to authenticated
  using (public.can_read_course(id));

create policy "courses write super admin"
  on public.courses for all to authenticated
  using (public.effective_role() = 'super_admin')
  with check (public.effective_role() = 'super_admin');

create policy "course assignments select"
  on public.course_assignments for select to authenticated
  using (
    public.effective_role() = 'super_admin'
    or exists (
      select 1 from public.teachers teacher
      where teacher.id = course_assignments.teacher_id
        and teacher.auth_user_id = auth.uid()
    )
  );

create policy "course assignments write super admin"
  on public.course_assignments for all to authenticated
  using (public.effective_role() = 'super_admin')
  with check (public.effective_role() = 'super_admin');

create policy "schedules select visible"
  on public.schedules for select to authenticated
  using (public.can_read_course(course_id));

-- Same policy name as before. The check is now the course, not only the global role.
create policy "schedules write editors"
  on public.schedules for all to authenticated
  using (public.can_edit_course(course_id))
  with check (public.can_edit_course(course_id));

create policy "batches select visible"
  on public.batches for select to authenticated
  using (public.can_read_course(course_id));

create policy "batches write editors"
  on public.batches for all to authenticated
  using (public.can_edit_course(course_id))
  with check (public.can_edit_course(course_id));

-- ------------------------------------------------------------------------
-- 9. BACKUPS AND REALTIME
-- ------------------------------------------------------------------------

do $$
declare
  constraint_row record;
begin
  if to_regclass('public.backups') is not null then
    for constraint_row in
      select conname
      from pg_constraint
      where conrelid = 'public.backups'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%type%'
    loop
      execute format('alter table public.backups drop constraint %I', constraint_row.conname);
    end loop;
    alter table public.backups
      add constraint backups_type_check
      check (type in ('teachers', 'batches', 'modules', 'schedules', 'courses'));
  end if;

  if to_regclass('backup.records') is not null then
    for constraint_row in
      select conname
      from pg_constraint
      where conrelid = 'backup.records'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%type%'
    loop
      execute format('alter table backup.records drop constraint %I', constraint_row.conname);
    end loop;
    alter table backup.records
      add constraint records_type_check
      check (type in ('teachers', 'batches', 'modules', 'schedules', 'courses'));
  end if;
end $$;

do $$
begin
  if to_regclass('public.backups') is not null
     and exists (
       select 1 from pg_proc
       where proname = 'backup_record_trigger' and pronamespace = 'public'::regnamespace
     ) then
    drop trigger if exists trg_backup_courses on public.courses;
    create trigger trg_backup_courses
      after insert or update or delete on public.courses
      for each row execute function public.backup_record_trigger();
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'courses'
    ) then
      alter publication supabase_realtime add table public.courses;
    end if;
  end if;
end $$;

-- ------------------------------------------------------------------------
-- 10. SUMMARY
-- ------------------------------------------------------------------------

select
  (select count(*) from public.courses) as courses,
  (select count(*) from public.schedules where course_id is not null) as schedules_linked,
  (
    select course.name
    from public.courses course
    join public.schedules schedule on schedule.course_id = course.id
    where schedule.id = 'default'
  ) as default_course_name,
  (select count(*) from public.course_assignments) as assignments,
  (select count(*) from public.batches where course_id is not null) as batches_linked;
