-- ========================================================================
-- ROUTINE-NAEM: Seed Data Script
-- Inserts teachers, modules, batches, and the schedule document only when
-- those rows are missing. Re-running does not rename teachers, blank batch
-- names, or replace an existing schedule.
--
-- Do not run this on the live project. It is not the courses migration.
-- For a new project, run supabase/whole.sql. On the live project, run
-- supabase/migration_courses.sql once. lock_teacher_pin.sql is the PIN-only
-- script.
-- ========================================================================

-- 1. Ensure Relational Tables Exist
create table if not exists public.teachers (
  id text primary key,
  name text not null,
  designation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.teachers add column if not exists designation text not null default '';
alter table public.teachers enable row level security;

-- Ensure Modules table exists
create table if not exists public.modules (
  id integer primary key,
  module_number text not null,
  module_subnumber text not null default '',
  module_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.modules enable row level security;

-- Ensure Batches table exists
create table if not exists public.batches (
  id integer primary key,
  name text not null default '',
  number_of_students integer not null default 40,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.batches enable row level security;

create table if not exists public.schedules (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.schedules enable row level security;

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
insert into public.teachers (id, name, designation) values
  ('teacher-1', 'Prof. Asisul', 'Training Specialist'),
  ('teacher-2', 'Md. Sazzad Ali', 'Deputy Director'),
  ('teacher-3', 'Muhammad Yeakub Ali', 'Assistant Professor'),
  ('teacher-4', 'Mst. Arifa Tazrimin', 'Deputy Director (TS)'),
  ('teacher-5', 'Md. Jahangir Alom', 'Lecturer'),
  ('teacher-6', 'Prof. Rukhshana', 'Training Specialist'),
  ('teacher-7', 'Prof. Nilufar', 'Training Specialist'),
  ('teacher-8', 'Ms. Ayesa', 'Associate Professor'),
  ('teacher-9', 'Mr. S. Mahbub', 'Training Specialist'),
  ('teacher-10', 'Dr. Rahman', 'Director'),
  ('teacher-11', 'Mr. M. Ali', 'Training Specialist'),
  ('teacher-12', 'Mr. Ariful', 'Training Specialist'),
  ('teacher-13', 'Dr. Nuruzzaman', 'Director'),
  ('teacher-14', 'Ms. Zinan', 'Training Specialist'),
  ('teacher-15', 'Ms. Arifa', 'Deputy Director (TS)'),
  ('teacher-16', 'Dr. Ayet', 'Deputy Director'),
  ('teacher-17', 'Dr. Litan Kanti Halder', 'Assistant Director'),
  ('teacher-18', 'Dr. Musammet Tahmina Begum', 'Assistant Director'),
  ('teacher-19', 'Nahida Akter', 'Technical Officer'),
  ('teacher-20', 'Mohammed Amin Uddin', 'Technical Officer'),
  ('teacher-21', 'Dr. Md. Atiqul Islam Pathan', 'Director'),
  ('teacher-22', 'Dr. Saima Rahman', 'Deputy Director'),
  ('teacher-23', 'Shahida Sultana', 'Assistant Director'),
  ('teacher-24', 'Md. Rafiqul Islam Akand', 'Documentation Officer'),
  ('teacher-25', 'Prof. Md. Jahangir Kabir', 'Assistant Director (TS)'),
  ('teacher-26', 'Kazi Tanzila Jahan', 'Assistant Director'),
  ('teacher-27', 'Golam Mahmud', 'Assistant Director'),
  ('teacher-28', 'Sk. Saifur Rahman', 'Assistant Director'),
  ('teacher-29', 'Swaraj Chakraborty', 'Assistant Director'),
  ('teacher-30', 'Md. Ahsan Habib', 'Physical Instructor'),
  ('teacher-31', 'Prof. Dr. Nasima Khan', 'Training Specialist'),
  ('teacher-32', 'Prof. Asma Akter Khatun', 'Training Specialist'),
  ('teacher-33', 'Prof. Monoara Khatun', 'Training Specialist'),
  ('teacher-34', 'Prof. Rudaba Rahman', 'Training Specialist'),
  ('teacher-35', 'Prof. Md. Shoukat Ali Khan', 'Training Specialist'),
  ('teacher-36', 'Prof. Md. Sydur Rahman Kotowal', 'Training Specialist'),
  ('teacher-37', 'Prof. Shamsun Akhter Siddiqie', 'Training Specialist'),
  ('teacher-38', 'Prof. Dr. Anwarul Hoque', 'Training Specialist'),
  ('teacher-39', 'Prof. Joy Prakash Dey', 'Training Specialist'),
  ('teacher-40', 'Prof. Tapan Bhattacharjee', 'Training Specialist'),
  ('teacher-41', 'Mohammad Arifur Rahman', 'Training Specialist'),
  ('teacher-42', 'Mohammad Motiur Rahman khan Pathan', 'Training Specialist'),
  ('teacher-43', 'Sharmin Tamanna', 'Training Specialist'),
  ('teacher-44', 'Md. Rabiul Awal', 'Training Specialist'),
  ('teacher-45', 'Mustafizur Rahaman', 'Training Specialist'),
  ('teacher-46', 'Md. Manjurul Islam', 'Training Specialist'),
  ('teacher-47', 'Md. Shahidul Islam', 'Deputy Director'),
  ('teacher-48', 'Dr. Md. Arizul Islam Khan', 'Deputy Director'),
  ('teacher-49', 'Mozammel Hoque', 'Assistant Director'),
  ('teacher-50', 'Dr. Muhammad Abdur Rahman Miah', 'Assistant Director')
on conflict (id) do nothing;


-- 4. Seed Modules Table (id: integer, module_number, module_subnumber, module_name)
insert into public.modules (id, module_number, module_subnumber, module_name) values
  (1, '1', '01', 'Learning Theories (Bloom''s and others)'),
  (2, '1', '02', 'Managing the Learning Environment in the Classroom'),
  (3, '1', '03', '21st Century Skills in Education'),
  (4, '1', '04', 'Formulating Lesson Plan and Constructive Alignment'),
  (5, '1', '05', 'Active Learning Strategies'),
  (6, '1', '06', 'Assessment in Education'),
  (7, '1', '07', 'Assessment Rubrics'),
  (8, '1', '08', 'Teaching Practice/Micro Teaching'),
  (9, '2', '01', 'Leadership: Concepts, Skills for Facilitating Change'),
  (10, '2', '02', 'Leadership Models and their Implication in Education'),
  (11, '2', '03', 'Nature and Dimensions of Strategic Leadership in Teaching'),
  (12, '2', '04', 'Management: Conception, Functions and Styles'),
  (13, '2', '05', 'Concept of Strategic Management and Practice'),
  (14, '2', '06', 'Conflict Management and Negotiations'),
  (15, '2', '07', 'Building a Strong Team: Staff Management in Educational Institutions'),
  (16, '2', '08', 'SWOT Analysis and Decision Making in Institutions'),
  (17, '2', '09', 'Ethics and Integrity in Action: Promoting Transparency and Accountability'),
  (18, '3', '01', 'Introduction to ICT in Education and ICT Policy in Bangladesh'),
  (19, '3', '02', 'Introduction to AI and Generative AI'),
  (20, '3', '03', 'Artificial Intelligence in Education'),
  (21, '3', '04', 'Modern Pedagogical Software in Classroom Management in Education'),
  (22, '3', '05', 'Blended Learning through ICT'),
  (23, '3', '06', 'D-Nothi'),
  (24, '3', '07', 'Use of Social Media and Cyber Security'),
  (25, '3', '08', 'Digital Content Preparation Using AI'),
  (26, '4', '01', 'Overview of the Planning Process of Bangladesh'),
  (27, '4', '02', 'Annual Development Program (ADP)'),
  (28, '4', '03', 'Project: Concept, Classification, and Project Cycle'),
  (29, '4', '04', 'Feasibility Study of Project with Financial, Economic Analysis, and EIA'),
  (30, '4', '05', 'Project Design with Logical Framework Approach'),
  (31, '4', '06', 'Development Project Proposal (DPP)'),
  (32, '4', '07', 'Preparation of Development Project Proposal (DPP)'),
  (33, '4', '08', 'Project Approval Process'),
  (34, '4', '09', 'Monitoring, Evaluation, and Impact Analysis'),
  (35, '5', '01', 'Understanding the Nature & Types of Research'),
  (36, '5', '02', 'Action Research'),
  (37, '5', '03', 'Research Tools Development and Data Collection Procedure'),
  (38, '5', '04', 'Preparation of Research Report'),
  (39, '5', '05', 'Referencing, Bibliography, Footnotes in Research'),
  (40, '5', '06', 'How to Write a Research Proposal (Action Research)'),
  (41, '6', '01', 'Understanding Good Governance in Education'),
  (42, '6', '02', 'Office Procedure: Docketing, Filing, and Referencing'),
  (43, '6', '03', 'Writing Notes, Summary, Reports, and Meeting Minutes'),
  (44, '6', '04', 'Government Service Act 2018'),
  (45, '6', '05', 'The Government Servant (Discipline and Appeal Rules, 2018)'),
  (46, '6', '06', 'Performance Measurement and ACR Writing'),
  (47, '6', '07', 'Strategies for Career Planning and Continuous Professional Development'),
  (48, '6', '08', 'Administrative Tribunal'),
  (49, '6', '09', 'Store and Resource Management'),
  (50, '7', '01', 'General Financial Rules and Duties and Responsibilities of DDO'),
  (51, '7', '02', 'Audit Management: Audit Procedures, Objectives, and Response Mechanisms'),
  (52, '7', '03', 'Public Procurement Act 2006 and Public Procurement Rules 2025: Key Provisions, Schedules, and Recent Updates'),
  (53, '7', '04', 'Different Types of Procurement based on PPA 2006 and PPR 2025'),
  (54, '7', '05', 'Procurement Governance Structure: Committees, Stakeholders, and Assigned Responsibilities'),
  (55, '7', '06', 'Introduction to the e-GP Portal: Registration Process and Functional Components'),
  (56, '7', '07', 'Preparation and Submission of Tender Documents, Evaluation Process, and Electronic Contract Management Systems through e-GP (e-Tendering and e-CMS through e-GP)'),
  (57, '7', '08', 'Mid-Term Budgetary Framework (MTBF): Concepts, Processes, and Institutional Application'),
  (58, '8', '01', 'Education in Emergency'),
  (59, '8', '02', 'Physical and Mental Well-being'),
  (60, '8', '03', '4IR'),
  (61, '8', '04', 'Gender Awareness'),
  (62, '8', '05', 'Bangladesh National Qualifications Framework (BNQF)'),
  (63, '8', '06', 'Global Citizenship Education'),
  (64, '8', '07', 'Contagious and Non-contagious Diseases'),
  (65, '8', '08', 'Green Growth in Education'),
  (66, '8', '09', 'Higher Education Prospects and Communication'),
  (67, '8', '10', 'Bullying and Cyber Bullying')
on conflict (id) do nothing;


-- 5. Seed Batches Table (id: number, name: default blank, number_of_students: 40)
-- WHERE NOT EXISTS, not ON CONFLICT (id): courses change the primary key to
-- (course_id, id). Rows that already exist are left alone.
insert into public.batches (id, name, number_of_students)
select batch.id, batch.name, batch.number_of_students
from (
  values
    (9, '', 40),
    (10, '', 40),
    (11, '', 40),
    (12, '', 40),
    (13, '', 40)
) as batch(id, name, number_of_students)
where not exists (
  select 1 from public.batches existing where existing.id = batch.id
);

-- Initial schedule document. Kept only when no default row exists yet.
insert into public.schedules (id, data, updated_at)
values ('default', '{"days":[{"id":"day-01","date":"2026-10-19","cells":{"batch-9:s1":{"code":"M- 7.04","note":"Theory","teachers":["Prof. Asisul"]},"batch-9:s2":{"code":"M- 8.01","note":"","teachers":["Md. Sazzad Ali"]},"batch-9:s3":{"code":"M- 8.01","note":"","teachers":["Md. Sazzad Ali"]},"batch-9:s4":{"code":"M- 1.06","note":"","teachers":["Muhammad Yeakub Ali"]},"batch-9:s5":{"code":"M- 3.02","note":"","teachers":["Mst. Arifa Tazrimin"]},"batch-10:s1":{"code":"M- 1.06","note":"","teachers":["Muhammad Yeakub Ali"]},"batch-10:s2":{"code":"M- 7.04","note":"Theory","teachers":["Prof. Asisul"]},"batch-10:s3":{"code":"M- 3.02","note":"","teachers":["Mst. Arifa Tazrimin"]},"batch-10:s4":{"code":"M- 8.01","note":"","teachers":["Md. Sazzad Ali"]},"batch-10:s5":{"code":"M- 5.01","note":"","teachers":["Md. Jahangir Alom"]},"batch-11:s1":{"code":"M- 3.02","note":"","teachers":["Mst. Arifa Tazrimin"]},"batch-11:s2":{"code":"M- 1.06","note":"","teachers":["Muhammad Yeakub Ali"]},"batch-11:s3":{"code":"M- 7.04","note":"Theory","teachers":["Prof. Asisul"]},"batch-11:s4":{"code":"M- 5.01","note":"","teachers":["Md. Jahangir Alom"]},"batch-11:s5":{"code":"M- 8.01","note":"","teachers":["Md. Sazzad Ali"]},"batch-12:s1":{"code":"M- 5.01","note":"","teachers":["Md. Jahangir Alom"]},"batch-12:s2":{"code":"M- 3.05","note":"","teachers":["Prof. Rukhshana"]},"batch-12:s3":{"code":"M- 1.08","note":"","teachers":["Prof. Nilufar"]},"batch-12:s4":{"code":"M- 7.04","note":"TPP","teachers":["Prof. Asisul"]},"batch-12:s5":{"code":"M- 6.01","note":"","teachers":["Dr. Rahman"]},"batch-13:s1":{"code":"M- 1.08","note":"","teachers":["Prof. Nilufar"]},"batch-13:s2":{"code":"M- 5.01","note":"","teachers":["Md. Jahangir Alom"]},"batch-13:s3":{"code":"M- 6.01","note":"","teachers":["Dr. Rahman"]},"batch-13:s4":{"code":"M- 3.05","note":"","teachers":["Prof. Rukhshana"]},"batch-13:s5":{"code":"M- 7.04","note":"TPP","teachers":["Prof. Asisul"]}},"slots":[{"id":"s1","kind":"session","durationMin":60},{"id":"break-tea","kind":"break","label":"Tea Break","durationMin":30},{"id":"s2","kind":"session","durationMin":60},{"id":"s3","kind":"session","durationMin":60},{"id":"break-lunch","kind":"break","label":"Prayer & Lunch Break","durationMin":60},{"id":"s4","kind":"session","durationMin":60},{"id":"s5","kind":"session","durationMin":60}],"merges":[{"batchId":"batch-9","sessionIds":["s2","s3"]}],"dayStart":"09:00","managers":{"batch-9":["01","02"],"batch-10":["01","02"],"batch-11":["01","02"],"batch-12":["01","02"],"batch-13":["01","02"]},"recapMin":30,"dayNumber":1,"defaultSessionMin":60},{"id":"day-02","date":"2026-10-20","cells":{"batch-9:s1":{"code":"M- 7.04","note":"TPP (Theory & Practice)","teachers":["Prof. Asisul"]},"batch-9:s2":{"code":"M- 8.03","note":"","teachers":["Ms. Ayesa"]},"batch-9:s3":{"code":"M- 5.06","note":"","teachers":["Mr. S. Mahbub"]},"batch-9:s4":{"code":"M- 6.01","note":"","teachers":["Dr. Rahman","Mr. M. Ali"]},"batch-9:s5":{"code":"M- 8.07","note":"","teachers":["Mr. Ariful"]},"batch-10:s1":{"code":"M- 5.06","note":"","teachers":["Mr. S. Mahbub"]},"batch-10:s2":{"code":"M- 7.04","note":"TPP (Theory & Practice)","teachers":["Prof. Asisul"]},"batch-10:s3":{"code":"M- 8.03","note":"","teachers":["Ms. Ayesa"]},"batch-10:s4":{"code":"M- 8.07","note":"","teachers":["Mr. Ariful"]},"batch-10:s5":{"code":"M- 6.01","note":"","teachers":["Dr. Rahman"]},"batch-11:s1":{"code":"M- 8.03","note":"","teachers":["Ms. Ayesa"]},"batch-11:s2":{"code":"M- 5.06","note":"","teachers":["Mr. S. Mahbub"]},"batch-11:s3":{"code":"M- 7.04","note":"Practice & Presentation","teachers":["Prof. Asisul"]},"batch-11:s4":{"code":"M- 8.08","note":"","teachers":["Dr. Nuruzzaman"]},"batch-11:s5":{"code":"M- 8.10","note":"","teachers":["Ms. Zinan"]},"batch-12:s1":{"code":"M- 6.01","note":"","teachers":["Dr. Rahman"]},"batch-12:s2":{"code":"M- 8.08","note":"","teachers":["Dr. Nuruzzaman"]},"batch-12:s3":{"code":"M- 8.10","note":"","teachers":["Ms. Zinan"]},"batch-12:s4":{"code":"M- 7.04","note":"Theory","teachers":["Prof. Asisul"]},"batch-12:s5":{"code":"M- 3.02","note":"","teachers":["Mst. Arifa Tazrimin"]},"batch-13:s1":{"code":"M- 8.10","note":"","teachers":["Ms. Zinan"]},"batch-13:s2":{"code":"M- 6.01","note":"","teachers":["Dr. Rahman"]},"batch-13:s3":{"code":"M- 8.08","note":"","teachers":["Dr. Nuruzzaman"]},"batch-13:s4":{"code":"M- 3.02","note":"","teachers":["Mst. Arifa Tazrimin"]},"batch-13:s5":{"code":"M- 7.04","note":"Theory","teachers":["Prof. Asisul"]}},"slots":[{"id":"s1","kind":"session","durationMin":60},{"id":"break-tea","kind":"break","label":"Tea Break","durationMin":30},{"id":"s2","kind":"session","durationMin":60},{"id":"s3","kind":"session","durationMin":60},{"id":"break-lunch","kind":"break","label":"Prayer & Lunch Break","durationMin":60},{"id":"s4","kind":"session","durationMin":60},{"id":"s5","kind":"session","durationMin":60}],"merges":[],"dayStart":"09:00","managers":{"batch-9":["03","04"],"batch-10":["03","04"],"batch-11":["03","04"],"batch-12":["03","04"],"batch-13":["03","04"]},"recapMin":30,"dayNumber":2,"defaultSessionMin":60}],"footer":{"name":"Dr. Litan Kanti Halder","lines":["Assistant Director & Course Coordinator","Advanced Course on Skill Development","NAEM, Dhaka"],"courseName":"Advanced Course on Skill Development","designation":"Assistant Director & Course Coordinator","signatureDate":"20.10.26","isCourseCoordinator":true},"header":[{"id":"h1","text":"Enhancing Professional Skills of Teachers Scheme","style":"normal"},{"id":"h2","text":"Secondary Education Development Program (SEDP)","style":"normal"},{"id":"h3","text":"National Academy for Educational Management (NAEM)","style":"normal"},{"id":"h4","text":"Secondary and Higher Education Division, Ministry of Education","style":"normal"},{"id":"h5","text":"Advanced Course on Skill Development","style":"title"},{"id":"h6","text":"For Assistant Professors of BCS (General Education) Cadre","style":"subtitle"},{"id":"h7","text":"(Duration: Training Course Schedule)","style":"normal"}],"batches":[{"id":"batch-9","name":"9th","roster":["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40"],"numberOfStudents":40},{"id":"batch-10","name":"10th","roster":["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40"],"numberOfStudents":40},{"id":"batch-11","name":"11th","roster":["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40"],"numberOfStudents":40},{"id":"batch-12","name":"12th","roster":["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40"],"numberOfStudents":40},{"id":"batch-13","name":"13th","roster":["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40"],"numberOfStudents":40}],"modules":[{"id":"1","code":"M- 7.04","title":"Theory","moduleName":"Theory","moduleNumber":"7","moduleSubnumber":"04"},{"id":"2","code":"M- 7.04","title":"TPP (Theory & Practice)","moduleName":"TPP (Theory & Practice)","moduleNumber":"7","moduleSubnumber":"04"},{"id":"3","code":"M- 7.04","title":"Practice & Presentation","moduleName":"Practice & Presentation","moduleNumber":"7","moduleSubnumber":"04"},{"id":"4","code":"M- 1.06","title":"Education Governance","moduleName":"Education Governance","moduleNumber":"1","moduleSubnumber":"06"},{"id":"5","code":"M- 1.08","title":"Financial Management","moduleName":"Financial Management","moduleNumber":"1","moduleSubnumber":"08"},{"id":"6","code":"M- 3.02","title":"Curriculum Implementation","moduleName":"Curriculum Implementation","moduleNumber":"3","moduleSubnumber":"02"},{"id":"7","code":"M- 3.05","title":"Pedagogical Leadership","moduleName":"Pedagogical Leadership","moduleNumber":"3","moduleSubnumber":"05"},{"id":"8","code":"M- 5.01","title":"ICT in Education","moduleName":"ICT in Education","moduleNumber":"5","moduleSubnumber":"01"},{"id":"9","code":"M- 5.06","title":"Classroom Assessment","moduleName":"Classroom Assessment","moduleNumber":"5","moduleSubnumber":"06"},{"id":"10","code":"M- 6.01","title":"Research Methodology","moduleName":"Research Methodology","moduleNumber":"6","moduleSubnumber":"01"},{"id":"11","code":"M- 8.03","title":"Professional Ethics","moduleName":"Professional Ethics","moduleNumber":"8","moduleSubnumber":"03"},{"id":"12","code":"M- 8.07","title":"Quality Assurance","moduleName":"Quality Assurance","moduleNumber":"8","moduleSubnumber":"07"},{"id":"13","code":"M- 8.08","title":"Institutional Planning","moduleName":"Institutional Planning","moduleNumber":"8","moduleSubnumber":"08"},{"id":"14","code":"M- 8.10","title":"Evaluation & Feedback","moduleName":"Evaluation & Feedback","moduleNumber":"8","moduleSubnumber":"10"}],"version":1,"teachers":[{"id":"teacher-1","name":"Prof. Asisul","designation":"Professor"},{"id":"teacher-2","name":"Md. Sazzad Ali","designation":"Associate Professor"},{"id":"teacher-3","name":"Muhammad Yeakub Ali","designation":"Assistant Professor"},{"id":"teacher-4","name":"Mst. Arifa Tazrimin","designation":"Assistant Professor"},{"id":"teacher-5","name":"Md. Jahangir Alom","designation":"Lecturer"},{"id":"teacher-6","name":"Prof. Rukhshana","designation":"Professor"},{"id":"teacher-7","name":"Prof. Nilufar","designation":"Professor"},{"id":"teacher-8","name":"Ms. Ayesa","designation":"Associate Professor"},{"id":"teacher-9","name":"Mr. S. Mahbub","designation":"Assistant Professor"},{"id":"teacher-10","name":"Dr. Rahman","designation":"Director"},{"id":"teacher-11","name":"Mr. M. Ali","designation":"Assistant Professor"},{"id":"teacher-12","name":"Mr. Ariful","designation":"Lecturer"},{"id":"teacher-13","name":"Dr. Nuruzzaman","designation":"Director"},{"id":"teacher-14","name":"Ms. Zinan","designation":"Assistant Professor"},{"id":"teacher-15","name":"Ms. Arifa","designation":"Lecturer"},{"id":"teacher-16","name":"Dr. Ayet","designation":"Associate Professor"},{"id":"teacher-17","name":"Dr. Litan Kanti Halder","designation":"Assistant Director"}],"autoRotate":true,"recapLabel":"Recap & Day Manager","subNumbers":[".01",".02",".03",".04",".05",".06",".07",".08",".10"],"activeDayId":"day-02","moduleNumbers":["M-1","M-3","M-5","M-6","M-7","M-8"],"showConflicts":true}'::jsonb, now())
on conflict (id) do nothing;

-- 6. RAID-Style Immutable Backup Schema & Table
create schema if not exists backup;

-- Disk 1: backup.records (in dedicated backup schema)
create table if not exists backup.records (
  id bigserial primary key,
  type text not null check (type in ('teachers', 'batches', 'modules', 'schedules')),
  record_id text,
  data jsonb not null,
  operation text not null default 'SNAPSHOT',
  created_at timestamptz not null default now()
);

create index if not exists idx_backup_records_type on backup.records (type);
create index if not exists idx_backup_records_record_id on backup.records (record_id);
create index if not exists idx_backup_records_created_at on backup.records (created_at desc);

-- Disk 2: public.backups (in public schema for Supabase Table Editor & UI access)
create table if not exists public.backups (
  id bigserial primary key,
  type text not null check (type in ('teachers', 'batches', 'modules', 'schedules')),
  record_id text,
  data jsonb not null,
  operation text not null default 'SNAPSHOT',
  created_at timestamptz not null default now()
);

create index if not exists idx_public_backups_type on public.backups (type);
create index if not exists idx_public_backups_record_id on public.backups (record_id);
create index if not exists idx_public_backups_created_at on public.backups (created_at desc);

-- Row Level Security: Immutable append-only design
alter table backup.records enable row level security;

alter table public.backups enable row level security;
-- No UPDATE or DELETE policies: Cannot be deleted without direct database access.

create or replace function public.backup_record_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  rec_type text;
  rec_id text;
  rec_data jsonb;
begin
  rec_type := TG_TABLE_NAME;
  if (TG_OP = 'DELETE') then
    rec_id := coalesce(OLD.id::text, '');
    rec_data := to_jsonb(OLD);
    insert into backup.records (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, 'DELETE', now());
    insert into public.backups (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, 'DELETE', now());
    return OLD;
  else
    rec_id := coalesce(NEW.id::text, '');
    rec_data := to_jsonb(NEW);
    insert into backup.records (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, TG_OP, now());
    insert into public.backups (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, TG_OP, now());
    return NEW;
  end if;
end;
$$;

drop trigger if exists trg_backup_teachers on public.teachers;
create trigger trg_backup_teachers after insert or update or delete on public.teachers
  for each row execute function public.backup_record_trigger();

drop trigger if exists trg_backup_modules on public.modules;
create trigger trg_backup_modules after insert or update or delete on public.modules
  for each row execute function public.backup_record_trigger();

drop trigger if exists trg_backup_batches on public.batches;
create trigger trg_backup_batches after insert or update or delete on public.batches
  for each row execute function public.backup_record_trigger();

drop trigger if exists trg_backup_schedules on public.schedules;
create trigger trg_backup_schedules after insert or update or delete on public.schedules
  for each row execute function public.backup_record_trigger();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'backups') then
    alter publication supabase_realtime add table public.backups;
  end if;
end $$;

-- 7. Snapshot existing data into backups
insert into backup.records (type, record_id, data, operation, created_at)
select 'teachers', id::text, to_jsonb(t), 'SNAPSHOT', now() from public.teachers t
where not exists (select 1 from backup.records b where b.type = 'teachers' and b.record_id = t.id::text);

insert into public.backups (type, record_id, data, operation, created_at)
select 'teachers', id::text, to_jsonb(t), 'SNAPSHOT', now() from public.teachers t
where not exists (select 1 from public.backups b where b.type = 'teachers' and b.record_id = t.id::text);

insert into backup.records (type, record_id, data, operation, created_at)
select 'modules', id::text, to_jsonb(m), 'SNAPSHOT', now() from public.modules m
where not exists (select 1 from backup.records b where b.type = 'modules' and b.record_id = m.id::text);

insert into public.backups (type, record_id, data, operation, created_at)
select 'modules', id::text, to_jsonb(m), 'SNAPSHOT', now() from public.modules m
where not exists (select 1 from public.backups b where b.type = 'modules' and b.record_id = m.id::text);

insert into backup.records (type, record_id, data, operation, created_at)
select 'batches', id::text, to_jsonb(b), 'SNAPSHOT', now() from public.batches b
where not exists (select 1 from backup.records b where b.type = 'batches' and b.record_id = b.id::text);

insert into public.backups (type, record_id, data, operation, created_at)
select 'batches', id::text, to_jsonb(b), 'SNAPSHOT', now() from public.batches b
where not exists (select 1 from public.backups b where b.type = 'batches' and b.record_id = b.id::text);

insert into backup.records (type, record_id, data, operation, created_at)
select 'schedules', id::text, to_jsonb(s), 'SNAPSHOT', now() from public.schedules s
where not exists (select 1 from backup.records b where b.type = 'schedules' and b.record_id = s.id::text);

insert into public.backups (type, record_id, data, operation, created_at)
select 'schedules', id::text, to_jsonb(s), 'SNAPSHOT', now() from public.schedules s
where not exists (select 1 from public.backups b where b.type = 'schedules' and b.record_id = s.id::text);


