-- Designation titles for the super-admin role list.
-- Safe to run more than once. Run after supabase/migration_add_auth_roles.sql
-- so effective_role() exists for the write policy.

create table if not exists public.designations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table public.designations enable row level security;

drop policy if exists "designations read all" on public.designations;
create policy "designations read all"
  on public.designations
  for select
  to anon, authenticated
  using (true);

drop policy if exists "designations write super admin" on public.designations;
create policy "designations write super admin"
  on public.designations
  for all
  to authenticated
  using (public.effective_role() = 'super_admin')
  with check (public.effective_role() = 'super_admin');

grant select on public.designations to anon, authenticated;
grant insert, update, delete on public.designations to authenticated;

insert into public.designations (name)
values
  ('Director General'),
  ('Director'),
  ('Deputy Director'),
  ('Assistant Director'),
  ('Professor'),
  ('Associate Professor'),
  ('Assistant Professor'),
  ('Lecturer'),
  ('Research Officer'),
  ('Guest Speaker')
on conflict (name) do nothing;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'teachers'
      and column_name = 'designation'
  ) then
    insert into public.designations (name)
    select distinct btrim(designation)
    from public.teachers
    where designation is not null
      and btrim(designation) <> ''
    on conflict (name) do nothing;
  end if;
end $$;
