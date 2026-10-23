-- Let a signed-in teacher set their own designation. Safe to run more than once.
-- teachers.designation already exists. RLS still lets only a super admin update the row,
-- so this function is the only new grant: it writes designation for auth.uid() and nothing else.
-- Do not run this against a database you have not reviewed. It does not change PINs or routines.

alter table public.teachers add column if not exists designation text not null default '';

create or replace function public.set_my_designation(next_designation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  update public.teachers
  set designation = coalesce(btrim(next_designation), ''),
      updated_at = now()
  where auth_user_id = auth.uid();
  if not found then
    raise exception 'No teacher row for this account';
  end if;
end;
$$;

revoke all on function public.set_my_designation(text) from public;
grant execute on function public.set_my_designation(text) to authenticated;
