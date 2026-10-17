-- Add teachers.designation. Safe to run more than once.
alter table public.teachers add column if not exists designation text not null default '';
