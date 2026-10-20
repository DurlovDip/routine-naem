-- ========================================================================
-- ROUTINE-NAEM: Hide teacher PINs from the API
--
-- Run this in the SQL editor of the EXISTING live project
-- (https://cbvtuztqnfjinvwhdvif.supabase.co). It is the only script to run
-- there after commit ea5d0ed.
--
-- It does not change pin values, passwords, teacher rows, or the schedule.
-- It does not drop tables. A table-level SELECT includes pin, so this
-- revokes that and grants every other teachers column back.
--
-- Do not run supabase/whole.sql, supabase/seed.sql, or
-- supabase/migration_add_teacher_pin.sql on that project.
-- migration_add_teacher_pin.sql sets every PIN back to 6832.
-- ========================================================================

revoke all on table public.teachers from anon, authenticated;

grant select (
  id, name, designation, username, role, role_start, role_end, auth_user_id, created_at, updated_at
) on public.teachers to anon, authenticated;

grant insert (id, name, designation, updated_at) on public.teachers to authenticated;
grant update (name, designation, updated_at) on public.teachers to authenticated;
grant delete on public.teachers to authenticated;
