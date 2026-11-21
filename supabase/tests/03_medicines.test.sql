begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

create or replace function pg_temp.make_user(p_id uuid, p_email text)
returns void
language sql
as $$
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values (p_id, p_email, jsonb_build_object('full_name', split_part(p_email, '@', 1)), 'authenticated', 'authenticated');
$$;

create or replace function pg_temp.login(p_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function pg_temp.logout()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.reminder_count(p_schedule uuid)
returns integer
language sql
as $$
  select count(*)::int from public.medication_reminders where schedule_id = p_schedule;
$$;

select pg_temp.make_user('00000000-0000-0000-0000-0000000000a1', 'owner@test.local');
select pg_temp.make_user('00000000-0000-0000-0000-0000000000a2', 'care@test.local');
select pg_temp.make_user('00000000-0000-0000-0000-0000000000a3', 'viewer@test.local');
select pg_temp.make_user('00000000-0000-0000-0000-0000000000a4', 'patient@test.local');
select pg_temp.make_user('00000000-0000-0000-0000-0000000000a5', 'outsider@test.local');

insert into public.patients (id, full_name, date_of_birth, created_by, timezone, missed_after_minutes) values
  ('00000000-0000-0000-0000-0000000000b1', 'Ramesh Test', '1957-03-04', '00000000-0000-0000-0000-0000000000a1', 'Asia/Kolkata', 120),
  ('00000000-0000-0000-0000-0000000000b3', 'Far Away Test', '1950-01-01', '00000000-0000-0000-0000-0000000000a1', 'America/Los_Angeles', 120);
insert into public.caregiver_links (patient_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'OWNER'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'CAREGIVER'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'VIEWER'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', 'OWNER');
insert into public.patient_links (patient_id, user_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a4');

insert into public.medical_documents (id, patient_id, uploaded_by, file_path, mime_type, size_bytes, sha256, document_type, extraction_status)
values (
  '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg', 'image/jpeg', 100, repeat('a', 64), 'PRESCRIPTION', 'PARSED'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select throws_ok(
  $$select public.approve_document('00000000-0000-0000-0000-0000000000c1', '[{"name":"X","dosage":"1","schedules":[{"slot":"MORNING","target_time":"08:00","frequency_type":"DAILY","start_date":"2026-03-01"}]}]')$$,
  'P0001', 'FORBIDDEN', 'FR-5.2 a viewer cannot approve'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$select public.approve_document('00000000-0000-0000-0000-0000000000c1', '[]')$$,
  'P0001', 'VALIDATION_FAILED', 'FR-5.2 approving nothing is refused'
);
select throws_ok(
  $$select public.approve_document('00000000-0000-0000-0000-0000000000c1', '[
    {"name":"Metformin","dosage":"500 mg","schedules":[{"slot":"MORNING","target_time":"08:00","frequency_type":"DAILY","start_date":"2026-03-01"}]},
    {"name":"Broken","dosage":"5 mg","schedules":[]}
  ]')$$,
  'P0001', 'VALIDATION_FAILED', 'FR-5.2 one bad medicine fails the whole approval'
);
select is((select count(*)::int from public.medications), 0, 'FR-5.2 nothing was saved after the failed approval');
select throws_ok(
  $$select public.approve_document('00000000-0000-0000-0000-0000000000c1', '[{"name":"X","dosage":"1","schedules":[{"slot":"MORNING","target_time":"25:00","frequency_type":"DAILY","start_date":"2026-03-01"}]}]')$$,
  '22008', null, 'FR-6.1 an impossible time is refused'
);
select is(
  public.approve_document('00000000-0000-0000-0000-0000000000c1', '[
    {"name":"Metformin","dosage":"500 mg","instructions":"After food","schedules":[
      {"slot":"MORNING","target_time":"08:00","frequency_type":"DAILY","start_date":"2027-01-01","end_date":"2027-01-30"},
      {"slot":"EVENING","target_time":"19:00","frequency_type":"DAILY","start_date":"2027-01-01","end_date":"2027-01-30"}
    ]},
    {"name":"Amlodipine","dosage":"5 mg","schedules":[
      {"slot":"AFTERNOON","target_time":"14:00","frequency_type":"DAILY","start_date":"2026-01-01"}
    ]}
  ]'),
  2,
  'FR-5.2 a caregiver approves two medicines'
);
select is(
  (select extraction_status from public.medical_documents where id = '00000000-0000-0000-0000-0000000000c1'),
  'VERIFIED',
  'FR-5.2 the document becomes VERIFIED'
);
select throws_ok(
  $$select public.approve_document('00000000-0000-0000-0000-0000000000c1', '[{"name":"X","dosage":"1","schedules":[{"slot":"MORNING","target_time":"08:00","frequency_type":"DAILY","start_date":"2026-03-01"}]}]')$$,
  'P0001', 'CONFLICT', 'FR-5.2 a document can be approved only once'
);
select is((select count(*)::int from public.medication_schedules), 3, 'FR-5.2 three schedules were saved');
reset role;

select is(
  (select count(*)::int from public.audit_logs where target_table = 'medications' and action = 'INSERT' and actor_id = '00000000-0000-0000-0000-0000000000a2'),
  2,
  'FR-5.3 each approved medicine is audited'
);
select is(
  (select count(*)::int from public.audit_logs where target_table = 'medication_schedules' and action = 'INSERT'),
  3,
  'FR-5.3 each approved schedule is audited'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
select is((select count(*)::int from public.medications), 2, 'the patient sees their medicines');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select is((select count(*)::int from public.medications), 0, 'an outsider sees no medicines');
reset role;

insert into public.medications (id, patient_id, name, dosage, created_by) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'Daily Test', '1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b3', 'Far Test', '1', '00000000-0000-0000-0000-0000000000a1');
insert into public.medication_schedules (id, medication_id, patient_id, slot, target_time, frequency_type, weekdays, interval_days, start_date, end_date) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'MORNING', '08:00', 'DAILY', null, null, '2026-01-01', null),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'MORNING', '09:00', 'SPECIFIC_DAYS', '{1}', null, '2026-01-01', null),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'MORNING', '10:00', 'EVERY_N_DAYS', null, 3, '2026-03-01', null),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'AFTERNOON', '13:00', 'DAILY', null, null, '2026-01-01', '2026-03-09'),
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'MORNING', '05:00', 'DAILY', null, null, '2026-03-12', null),
  ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'MORNING', '05:00', 'DAILY', null, null, '2026-01-01', null),
  ('00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b3', 'MORNING', '08:00', 'DAILY', null, null, '2026-01-01', null);

select public.generate_reminders('2026-03-10 06:00:00+05:30');

select is(pg_temp.reminder_count('00000000-0000-0000-0000-0000000000d1'), 1, 'FR-7.1 a daily dose is created once for the next 24 hours');
select is(
  (select scheduled_for from public.medication_reminders where schedule_id = '00000000-0000-0000-0000-0000000000d1'),
  '2026-03-10 08:00:00+05:30'::timestamptz,
  'FR-7.1 the dose time is in the patient''s timezone'
);
select is(pg_temp.reminder_count('00000000-0000-0000-0000-0000000000d2'), 0, 'FR-6.5 a Monday-only dose is not created on Tuesday');
select is(pg_temp.reminder_count('00000000-0000-0000-0000-0000000000d3'), 1, 'FR-6.5 an every-3-days dose falls on 10 March (1, 4, 7, 10)');
select is(pg_temp.reminder_count('00000000-0000-0000-0000-0000000000d4'), 0, 'FR-6.6 no dose after the end date');
select is(pg_temp.reminder_count('00000000-0000-0000-0000-0000000000d5'), 0, 'FR-6.6 no dose before the start date');
select is(
  (select scheduled_for from public.medication_reminders where schedule_id = '00000000-0000-0000-0000-0000000000d6'),
  '2026-03-11 05:00:00+05:30'::timestamptz,
  'FR-7.1 a time already 60 minutes past is skipped; tomorrow''s is created'
);
select is(
  (select scheduled_for from public.medication_reminders where schedule_id = '00000000-0000-0000-0000-0000000000d7'),
  '2026-03-10 15:00:00+00'::timestamptz,
  'FR-7.1 a patient in Los Angeles gets 08:00 local time'
);
select is(public.generate_reminders('2026-03-10 06:00:00+05:30'), 0, 'FR-7.1 running the job again creates nothing');

select is(public.mark_missed('2026-03-10 09:59:00+05:30'), 0, 'FR-7.3 a dose inside the grace period is not missed');
update public.medication_reminders set status = 'ACKNOWLEDGED', acknowledged_at = '2026-03-10 10:05:00+05:30'
where schedule_id = '00000000-0000-0000-0000-0000000000d3';
select is(public.mark_missed('2026-03-10 12:30:00+05:30'), 1, 'FR-7.3 only the 08:00 dose is past its 120-minute grace period');
select is(
  (select status from public.medication_reminders where schedule_id = '00000000-0000-0000-0000-0000000000d1'),
  'MISSED',
  'FR-7.3 the 08:00 dose is now MISSED'
);
select is(
  (select status from public.medication_reminders where schedule_id = '00000000-0000-0000-0000-0000000000d3'),
  'ACKNOWLEDGED',
  'FR-7.3 an acknowledged dose is never marked missed'
);
select is(
  (select count(*)::int from public.notifications where kind = 'DOSE_MISSED' and patient_id = '00000000-0000-0000-0000-0000000000b1'),
  2,
  'FR-7.4 the owner and the caregiver are notified, the viewer is not'
);
select is(public.mark_missed('2026-03-10 12:30:00+05:30'), 0, 'FR-7.3 marking again changes nothing');

select public.generate_reminders('2026-03-09 06:00:00+05:30');
select is(pg_temp.reminder_count('00000000-0000-0000-0000-0000000000d2'), 1, 'FR-6.5 the Monday-only dose is created on Monday');

insert into public.medication_reminders (schedule_id, patient_id, scheduled_for, status) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', now() - interval '3 days', 'MISSED'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', now() + interval '1 hour', 'PENDING');

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select throws_ok(
  $$select public.stop_medication('00000000-0000-0000-0000-0000000000e1')$$,
  'P0001', 'FORBIDDEN', 'FR-6.2 a viewer cannot stop a medicine'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$select public.stop_medication('00000000-0000-0000-0000-0000000000e1')$$, 'FR-6.2 a caregiver stops a medicine');
select lives_ok($$select public.stop_medication('00000000-0000-0000-0000-0000000000e1')$$, 'FR-6.2 stopping twice is harmless');
reset role;

select is(
  (select count(*)::int from public.medication_reminders where schedule_id = '00000000-0000-0000-0000-0000000000d1' and scheduled_for > now()),
  0,
  'FR-6.2 future pending doses are removed'
);
select is(
  (select count(*)::int from public.medication_reminders
   where schedule_id = '00000000-0000-0000-0000-0000000000d1'
     and status = 'MISSED'
     and scheduled_for between now() - interval '4 days' and now() - interval '2 days'),
  1,
  'FR-6.2 past doses are kept'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$select public.change_medication('00000000-0000-0000-0000-0000000000e1', '{"name":"X","dosage":"1","schedules":[{"slot":"MORNING","target_time":"08:00","frequency_type":"DAILY","start_date":"2026-03-01"}]}')$$,
  'P0001', 'CONFLICT', 'FR-6.3 a stopped medicine cannot be changed'
);
select lives_ok(
  $$select public.change_medication(
    (select id from public.medications where name = 'Amlodipine' and dosage = '5 mg'),
    '{"name":"Amlodipine","dosage":"10 mg","schedules":[{"slot":"MORNING","target_time":"08:30","frequency_type":"DAILY","start_date":"2026-03-01"}]}'
  )$$,
  'FR-6.3 a caregiver changes a medicine'
);
select is(
  (select replaces_id from public.medications where name = 'Amlodipine' and dosage = '10 mg'),
  (select id from public.medications where name = 'Amlodipine' and dosage = '5 mg' and status = 'STOPPED'),
  'FR-6.3 the new medicine points to the stopped one it replaces'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
select throws_ok(
  $$select public.add_medication('00000000-0000-0000-0000-0000000000b1', '{"name":"X","dosage":"1","schedules":[{"slot":"MORNING","target_time":"08:00","frequency_type":"DAILY","start_date":"2026-03-01"}]}')$$,
  'P0001', 'FORBIDDEN', 'FR-6.4 the patient cannot add medicines'
);
reset role;

select throws_ok(
  $$insert into public.medication_schedules (medication_id, patient_id, slot, target_time, frequency_type, start_date)
    values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'MORNING', '08:00', 'DAILY', '2026-01-01')$$,
  '23503', null, 'a schedule cannot point to another patient''s medicine'
);

select * from finish();
rollback;