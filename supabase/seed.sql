-- ========================================================================
-- ROUTINE-NAEM: Seed Data Script
-- Run this in your Supabase SQL Editor to populate Teachers, Modules,
-- Batches, and the Schedule Document with initial data.
-- ========================================================================

-- 1. Ensure Relational Tables Exist
create table if not exists public.teachers (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.teachers enable row level security;
drop policy if exists "Allow public all teachers" on public.teachers;
create policy "Allow public all teachers" on public.teachers for all using (true) with check (true);

create table if not exists public.modules (
  id text primary key,
  code text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.modules enable row level security;
drop policy if exists "Allow public all modules" on public.modules;
create policy "Allow public all modules" on public.modules for all using (true) with check (true);

create table if not exists public.batches (
  id text primary key,
  name text not null,
  roster text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.batches enable row level security;
drop policy if exists "Allow public all batches" on public.batches;
create policy "Allow public all batches" on public.batches for all using (true) with check (true);

create table if not exists public.schedules (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.schedules enable row level security;
drop policy if exists "Allow public all schedules" on public.schedules;
create policy "Allow public all schedules" on public.schedules for all using (true) with check (true);

-- 2. Ensure Realtime publication is configured
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'teachers') then
    alter publication supabase_realtime add table public.teachers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'modules') then
    alter publication supabase_realtime add table public.modules;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'batches') then
    alter publication supabase_realtime add table public.batches;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'schedules') then
    alter publication supabase_realtime add table public.schedules;
  end if;
end $$;


-- 3. Seed Teachers Table
insert into public.teachers (id, name) values
  ('teacher-1', 'Prof. Asisul'),
  ('teacher-2', 'Md. Sazzad Ali'),
  ('teacher-3', 'Muhammad Yeakub Ali'),
  ('teacher-4', 'Mst. Arifa Tazrimin'),
  ('teacher-5', 'Md. Jahangir Alom'),
  ('teacher-6', 'Prof. Rukhshana'),
  ('teacher-7', 'Prof. Nilufar'),
  ('teacher-8', 'Ms. Ayesa'),
  ('teacher-9', 'Mr. S. Mahbub'),
  ('teacher-10', 'Dr. Rahman'),
  ('teacher-11', 'Mr. M. Ali'),
  ('teacher-12', 'Mr. Ariful'),
  ('teacher-13', 'Dr. Nuruzzaman'),
  ('teacher-14', 'Ms. Zinan'),
  ('teacher-15', 'Ms. Arifa'),
  ('teacher-16', 'Dr. Ayet')
on conflict (id) do update set name = excluded.name, updated_at = now();


-- 4. Seed Modules Table
insert into public.modules (id, code, title) values
  ('module-1', 'M- 7.04', '(Theory)'),
  ('module-2', 'M- 7.04', 'TPP (Theory & Practice)'),
  ('module-3', 'M- 7.04', '(Practice & Presentation)'),
  ('module-4', 'M- 1.06', ''),
  ('module-5', 'M- 1.08', ''),
  ('module-6', 'M- 3.02', ''),
  ('module-7', 'M- 3.05', ''),
  ('module-8', 'M- 5.01', ''),
  ('module-9', 'M- 5.06', ''),
  ('module-10', 'M- 6.01', ''),
  ('module-11', 'M- 8.03', ''),
  ('module-12', 'M- 8.07', ''),
  ('module-13', 'M- 8.08', ''),
  ('module-14', 'M- 8.10', '')
on conflict (id) do update set code = excluded.code, title = excluded.title, updated_at = now();


-- 5. Seed Batches Table
insert into public.batches (id, name, roster) values
  ('batch-9', '9th Batch', array['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30']),
  ('batch-10', '10th Batch', array['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30']),
  ('batch-11', '11th Batch', array['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30']),
  ('batch-12', '12th Batch', array['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30']),
  ('batch-13', '13th Batch', array['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30'])
on conflict (id) do update set name = excluded.name, roster = excluded.roster, updated_at = now();


-- 6. Seed Schedules Table (initial daily routine state)
insert into public.schedules (id, data, updated_at) values (
  'default',
  '{
    "version": 1,
    "recapLabel": "Recap & Day Manager",
    "autoRotate": true,
    "showConflicts": true,
    "activeDayId": "day-07",
    "header": [
      { "id": "h1", "style": "normal", "text": "Enhancing Professional Skills of Teachers Scheme" },
      { "id": "h2", "style": "normal", "text": "Secondary Education Development Program (SEDP)" },
      { "id": "h3", "style": "normal", "text": "National Academy for Educational Management (NAEM)" },
      { "id": "h4", "style": "normal", "text": "Secondary and Higher Education Division, Ministry of Education" },
      { "id": "h5", "style": "title", "text": "Advanced Course on Skill Development" },
      { "id": "h6", "style": "subtitle", "text": "For Assistant Professors of BCS (General Education) Cadre (09th – 13th Batch)" },
      { "id": "h7", "style": "normal", "text": "(Duration: 12 October, 2026 – 10 November, 2026)" }
    ],
    "footer": {
      "signature": null,
      "signatureDate": "17.10.26",
      "name": "Dr. Litan Kanti Halder",
      "lines": ["Assistant Director & Course Coordinator", "12th ACSD Training Course"]
    },
    "days": [
      {
        "id": "day-07",
        "date": "2026-10-18",
        "dayNumber": 7,
        "dayStart": "09:00",
        "recapMin": 30,
        "defaultSessionMin": 60,
        "slots": [
          { "id": "s1", "kind": "session", "durationMin": 60 },
          { "id": "break-tea", "kind": "break", "label": "Tea Break", "durationMin": 30 },
          { "id": "s2", "kind": "session", "durationMin": 60 },
          { "id": "s3", "kind": "session", "durationMin": 60 },
          { "id": "break-lunch", "kind": "break", "label": "Prayer & Lunch Break", "durationMin": 60 },
          { "id": "s4", "kind": "session", "durationMin": 60 },
          { "id": "s5", "kind": "session", "durationMin": 60 }
        ],
        "managers": {
          "batch-9": ["09", "10"],
          "batch-10": ["09", "10"],
          "batch-11": ["09", "10"],
          "batch-12": ["09", "10"],
          "batch-13": ["09", "10"]
        },
        "merges": [
          { "batchId": "batch-9", "sessionIds": ["s2", "s3"] },
          { "batchId": "batch-9", "sessionIds": ["s4", "s5"] }
        ],
        "cells": {
          "batch-9:s1": { "code": "M- 7.04", "note": "(Theory)", "teachers": ["Prof. Asisul"] },
          "batch-9:s2": { "code": "M- 7.04", "note": "TPP (Theory & Practice)", "teachers": ["Prof. Asisul", "Md. Sazzad Ali", "Muhammad Yeakub Ali"] },
          "batch-9:s4": { "code": "M- 7.04", "note": "(Practice & Presentation)", "teachers": ["Mst. Arifa Tazrimin", "Md. Jahangir Alom"] },
          "batch-10:s1": { "code": "M- 1.06", "note": "", "teachers": ["Prof. Rukhshana"] },
          "batch-10:s2": { "code": "M- 3.05", "note": "", "teachers": ["Prof. Nilufar"] },
          "batch-10:s3": { "code": "M- 8.08", "note": "", "teachers": ["Ms. Ayesa"] },
          "batch-10:s4": { "code": "M- 8.10", "note": "", "teachers": ["Mr. S. Mahbub"] },
          "batch-10:s5": { "code": "M- 5.06", "note": "", "teachers": ["Dr. Rahman"] },
          "batch-11:s1": { "code": "M- 1.08", "note": "", "teachers": ["Mr. M. Ali"] },
          "batch-11:s2": { "code": "M- 3.02", "note": "", "teachers": ["Mr. Ariful"] },
          "batch-11:s3": { "code": "M- 8.07", "note": "", "teachers": ["Dr. Nuruzzaman"] },
          "batch-11:s4": { "code": "M- 5.06", "note": "", "teachers": ["Dr. Rahman"] },
          "batch-11:s5": { "code": "M- 6.01", "note": "", "teachers": ["Ms. Zinan"] },
          "batch-12:s1": { "code": "M- 3.05", "note": "", "teachers": ["Prof. Nilufar"] },
          "batch-12:s2": { "code": "M- 8.07", "note": "", "teachers": ["Dr. Nuruzzaman"] },
          "batch-12:s3": { "code": "M- 1.06", "note": "", "teachers": ["Prof. Rukhshana"] },
          "batch-12:s4": { "code": "M- 8.03", "note": "", "teachers": ["Ms. Arifa"] },
          "batch-12:s5": { "code": "M- 1.08", "note": "", "teachers": ["Mr. M. Ali"] },
          "batch-13:s1": { "code": "M- 5.01", "note": "", "teachers": ["Dr. Ayet"] },
          "batch-13:s2": { "code": "M- 5.06", "note": "", "teachers": ["Dr. Rahman"] },
          "batch-13:s3": { "code": "M- 6.01", "note": "", "teachers": ["Ms. Zinan"] },
          "batch-13:s4": { "code": "M- 1.06", "note": "", "teachers": ["Prof. Rukhshana"] },
          "batch-13:s5": { "code": "M- 3.02", "note": "", "teachers": ["Mr. Ariful"] }
        }
      }
    ]
  }'::jsonb,
  now()
)
on conflict (id) do update set data = excluded.data, updated_at = now();
