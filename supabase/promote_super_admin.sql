-- Promote an existing account. Run in the Supabase SQL Editor.
-- Replace the username. This does not remove anyone else's admin role.
update public.profiles
set base_role = 'super_admin'
where username = 'their-username';
