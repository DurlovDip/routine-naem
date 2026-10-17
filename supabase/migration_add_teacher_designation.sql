-- ========================================================================
-- ROUTINE-NAEM Migration: Add Designation to Teachers Table
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard
-- ========================================================================

-- 1. Add designation column to public.teachers
alter table public.teachers add column if not exists designation text not null default '';

-- 2. Ensure any existing teachers have a fallback designation
update public.teachers
set designation = 'Assistant Director'
where designation is null or designation = '';

-- 3. Notify realtime publication
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'teachers') then
    alter publication supabase_realtime add table public.teachers;
  end if;
end $$;
