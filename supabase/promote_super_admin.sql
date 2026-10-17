-- Promote an existing account to super admin.
-- Replace the username, then run this in the Supabase SQL Editor.
-- A super admin has no start or end date.

update public.teachers
set role = 'super_admin',
    role_start = null,
    role_end = null
where username = 'their-username';
