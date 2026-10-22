# Courses

A course is the thing a routine belongs to. Today every day, batch row, session, header line, and footer lives in one document: `public.schedules` where `id = 'default'`. Coordinators are a dated role on `public.teachers` (`role`, `role_start`, `role_end`, evaluated in `Asia/Dhaka` by `effective_role()`), and that role can edit the only schedule.

This design gives each course its own routine, lets more than one course be active, and limits a coordinator to the courses they are assigned to. Super admins create courses and change status. Teachers read active and ended courses. Ended courses stay readable and are read-only except for a super admin.

## Domain

| Thing | Meaning |
| --- | --- |
| Course | A named training course. Status is `active`, `inactive`, or `ended`. Many courses may be `active` at once. |
| Schedule | The routine document for exactly one course: days, sessions, merges, header, footer, and the batch rows printed on the sheet. |
| Batch row | One row of that sheet (name, headcount, roster). It belongs to the course because it lives in that course's schedule. |
| Batch catalog | `public.batches`, the integer mirror (id, name, headcount) the table editor and super-admin sync already use. It is not the sheet. |
| Assignment | A teacher is coordinator or temporary coordinator of one course for a start–end date window. |

Teachers, modules, and designations stay global. They are the academy's people and module list, not a property of one course.

## Tables

### `public.courses`

| Column | Notes |
| --- | --- |
| `id uuid` | Primary key, `gen_random_uuid()`. |
| `name text` | Required, trimmed, not blank. |
| `code text` | Optional short name. Blank becomes null. Not unique. |
| `status text` | `active` (default), `inactive`, or `ended`. No partial unique index: several rows may be `active`. |
| `start_date date` | Nullable. |
| `end_date date` | Nullable. When both are set, `end_date >= start_date`. These are the course's own dates, not the coordinator window. |
| `created_at`, `updated_at` | `timestamptz`, `updated_at` maintained by trigger. |
| `created_by text` | Nullable FK to `teachers(id)` `on delete set null`. |

### One schedule per course

`schedules` keeps its text primary key. A new column `course_id uuid not null unique references courses(id) on delete cascade` is the 1:1 link.

Why this, and not "the schedule id is the course id":

- The live row is `id = 'default'`. Rewriting that primary key changes the key every client, realtime filter, and backup row already uses.
- A unique `course_id` is the same one-schedule-per-course rule, and it is additive.
- The backfilled course keeps `id = 'default'`, so the JSON is not copied and nothing is dropped.
- A course created later gets `schedules.id = course id::text`, which is stable and does not collide with `default`.

Header lines and the footer (signature, signee, course name line) stay inside `schedules.data`. They are per course because each course has its own row. The app does not gain a second header table.

### Batches stay in the schedule JSON

The sheet's batches are already an array on the document (`id`, `name`, `numberOfStudents`, `roster`), tied to day managers and cell keys such as `batch-9:s1`. That array is the course's batch list. Splitting it into its own table would duplicate the document the editor already saves, and a failed catalog write would disagree with the printed sheet.

`public.batches` is a different object: integer `id`, `name`, `number_of_students`, no roster. On the live project that table is empty, and the app keeps the document's batches (see the note in PR #2). It still needs a course, or a super-admin save of course A would upsert batch `9` and the next load of course B would paint A's catalog over B's sheet.

Repair:

- Add `batches.course_id uuid not null references courses(id) on delete cascade`.
- Replace the primary key `(id)` with `(course_id, id)`. The sheet JSON for two courses may both have a 9th batch.
- Keep a unique index on `batches.id` (`batches_id_legacy_key`) so the installed app's `on conflict (id)` still runs. The integer catalog cannot repeat an id until that index is dropped. The printed sheet does not use this index.
- Backfill existing catalog rows onto the course created from `schedules.id = 'default'`.
- Reads and the super-admin mirror write filter by `course_id`. The document remains the sheet. An empty catalog does not replace the document's batches, which is the behavior the live project already depends on.

### Assignments, not a single `teachers.course_id`

**Decision for Durlov.** Change this if one person must only ever coordinate one course.

A coordinator is assigned to a course in `public.course_assignments`:

| Column | Notes |
| --- | --- |
| `id uuid` | Primary key. |
| `teacher_id text` | FK to `teachers(id)` `on delete cascade`. |
| `course_id uuid` | FK to `courses(id)` `on delete cascade`. |
| `role text` | `coordinator` or `temp_coordinator`. |
| `role_start date`, `role_end date` | Both required, `role_end >= role_start`. Same window `effective_role()` already uses, now per course. |
| unique `(teacher_id, course_id)` | One assignment per person per course. Dates are edited in place. |

`teachers.role`, `role_start`, and `role_end` stay. They are the directory summary and the input to `effective_role()` for policies that are not course-shaped (teachers, modules, designations, backups). `assign_course_role` refreshes that summary from the assignments:

- If any assignment covers `app_today()`, copy that row (a `coordinator` row wins over `temp_coordinator`).
- Otherwise, if a future assignment exists, copy the soonest one (so `effective_role()` stays `teacher` until it starts).
- Otherwise, if only past assignments exist, copy the latest (the window is over, so `effective_role()` is `teacher`).
- If none remain, set `role = 'teacher'` and clear the dates.

A person may therefore be coordinator of course A and temporary coordinator of course B in overlapping windows. Schedule writes do not trust the summary. They call `can_edit_course`.

`assign_teacher_role` is unchanged for old callers. It does not attach a course. The role screen uses `assign_course_role`.

## Who can see and edit what

Helpers are `security definer`, `search_path = public`, so policies do not recurse. `anon` has no execute on them.

`can_read_course(id)`:

- No `auth.uid()`: false.
- `effective_role()` is `super_admin`: every status.
- `effective_role()` is `coordinator` or `temp_coordinator`: only courses with an assignment for that teacher, any status. They do not see courses they are not assigned to.
- Otherwise (teacher, including a coordinator outside their window): `active` and `ended` only. `inactive` is hidden.

`can_edit_course(id)`:

- Super admin: any status, including `ended` and `inactive`.
- Anyone else: an assignment for that course, `app_today()` inside `role_start`..`role_end`, and the course `status = 'active'`.

So an ended course is read-only for everyone except a super admin. An inactive course is hidden from teachers and not editable by coordinators. A coordinator cannot update another course's schedule.

Row policies:

| Table | Select | Write |
| --- | --- | --- |
| `courses` | `authenticated` and `can_read_course(id)` | `authenticated` and `effective_role() = 'super_admin'` for insert, update, delete |
| `schedules` | `authenticated` and `can_read_course(course_id)` | `authenticated` and `can_edit_course(course_id)` for insert, update, delete |
| `course_assignments` | super admin, or the assigned teacher | super admin only (the role screen calls `assign_course_role`) |
| `batches` | `authenticated` and `can_read_course(course_id)` | `authenticated` and `can_edit_course(course_id)` |

`anon` loses select on `schedules`, `courses`, `course_assignments`, and `batches`. Sign-in still uses `teacher_sign_in_options()`, which does not return `pin`.

`teachers.pin` stays hidden from `anon` and `authenticated`. A table-level `SELECT` still includes `pin`, so the migration repeats the column grant from `lock_teacher_pin.sql`: revoke every grant on `teachers`, then grant every column except `pin`. It does not change PIN values. New policies and RPCs return no PIN column. Backup snapshots of teachers continue to store `to_jsonb(t) - 'pin'`.

## RPCs

| Function | Who | What |
| --- | --- | --- |
| `my_courses()` | signed in | Courses `can_read_course` allows, plus `schedule_id`, `can_edit`, and `updated_at` (the later of the course and its schedule). |
| `create_course(name, code, status, start, end)` | super admin | Inserts the course and a one-day schedule whose title line and footer course name are the course name. `schedules.id` is the course uuid as text. Returns the course id. |
| `assign_course_role(teacher, role, start, end, course)` | super admin | Upserts or, when `role = 'teacher'`, deletes that pair, then refreshes the teacher summary. |
| `list_course_assignments()` | super admin | One row per assignment, with the course name, for the role screen. |

Renaming, dates, and status are ordinary updates of `courses`. RLS rejects anyone who is not a super admin. There is no delete button. Deleting a course would cascade the schedule.

## Backfill

Idempotent, and it does not rewrite `schedules.data`:

1. For each schedule with `course_id` null, insert a course and point the row at it. The `default` row is first.
2. The course name is the first header line with `style = 'title'` and non-blank text, then `footer.courseName`, then `Advanced Course on Skill Development`. Status is `active`.
3. Teachers whose stored role is `coordinator` or `temp_coordinator` and who have both dates get an assignment to that first course. `on conflict do nothing`, so a later edit is kept.
4. Catalog batches with a null `course_id` are attached to that same course.
5. Only then is `schedules.course_id` set `not null`, the FK and unique index added, and the batches primary key swapped.

Running the script twice does not create a second course for `default` and does not duplicate assignments.

## App

The client asks `my_courses()`, then loads `schedules` by `schedule_id` (not by the hard-coded `default`, except the shim below). The debounced save writes that same id and `course_id`. Switching course loads the other document and does not upsert the previous document into the new row.

Default course: the saved choice if it is still visible, else the only visible course, else the active course with the latest `updated_at`.

- **Web, super admin.** A Courses section: create, rename, code, dates, and Active / Inactive / Ended, with a status filter. A course switcher sits on the toolbar in the editor and the preview. The role row gains a course field and calls `assign_course_role`.
- **Web, coordinator.** The switcher lists assigned courses. The editor saves only when `can_edit` is true.
- **Web, teacher.** The switcher lists active and ended courses. The page stays view-only.
- **Mobile.** The same switcher is on the Routine tab and the Editor tab. The Routine banner stays the course title plus `Course Coordinator: name`. The Editor tab is hidden unless the selected course has `can_edit`. Course create / status is web-only; the Manage tab tells a super admin that courses are managed on the website.
- **Before the migration is applied.** If `my_courses` is missing, the app still reads and writes `schedules.id = 'default'` and shows that as one active course. It does not send `course_id`, so an old database is not broken by the new client.

## Legacy clients

The web build and Android 1.0.8 that are installed today read and write `schedules.id = 'default'`. They do not send `course_id`. Their batch catalog upsert is `on conflict (id)`.

`INSERT ... ON CONFLICT` checks `NOT NULL` before it takes the update path, so a missing `course_id` would reject the save. A before-insert trigger copies `course_id` from the existing `default` row (and, for a batch, from that course). `batches.id` stays unique so `on conflict (id)` still has an index to use. The printed batches inside each course's JSON can still repeat a number. The integer catalog cannot, until `batches_id_legacy_key` is dropped after 1.0.8 is gone.

A coordinator assigned to the backfilled course can still load and save that row while the course is active. A teacher still cannot write it.

## What Durlov runs on the live project

Run `supabase/migration_courses.sql` once in the Supabase SQL editor. It is safe to run a second time. Do this before creating a second course.

Order:

1. Run the migration. The current website and the installed 1.0.8 APK keep loading and saving the default routine.
2. Deploy this web build.
3. Install the 1.1.1 APK.

Do not run `supabase/whole.sql` or `supabase/seed.sql` on the live project. `whole.sql` is the fresh-install script and now includes this model so a new project does not need the migration file as a second step. It still rewrites Auth password hashes and replaces policies. Create the second course from the new website, not from the old app: the old app deletes catalog batches by id alone.

## Open questions

1. **One course per coordinator.** The default is many courses per person, via `course_assignments`. A single `teachers.course_id` would be a smaller change and would forbid coordinating two active courses. Say if that is what you want.
2. **Inactive courses and coordinators.** Assigned coordinators can see an inactive course and cannot edit it. Teachers cannot see it. Say if inactive should be super-admin-only.
3. **Deleting a course.** Super-admin RLS allows delete, and the schedule would go with it. The screen does not offer delete. Say if ended courses should be removable from the list.
4. **Catalog batches.** The sheet reads the JSON. The integer table is a per-course mirror. Say if the table should stop being written entirely.
