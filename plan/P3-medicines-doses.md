# Phase 3 — Medicines, schedules, and doses

## Goal

A caregiver turns a parsed document into approved medicines with schedules in one all-or-nothing step, or adds medicines by hand. Medicines can be stopped or changed without losing history. Scheduled jobs create doses for the next 24 hours in the patient's timezone and mark doses as missed after the grace period.

## Requirements covered

FR-5.2, FR-5.3, FR-6.1 to FR-6.6, FR-7.1 to FR-7.4.

## Before you start

- Phase 2 exit checks pass.
- `npx supabase start` is running.
- Read PRD sections 5 and 7 (FR-6, FR-7).

## Key rules (read before coding)

- **Approval is one database call.** The route sends every medicine and schedule to `approve_document`. Either all rows are saved and the document becomes VERIFIED, or nothing changes.
- **A medicine is never edited in place.** "Change" stops the old medicine and creates a new one that points to it with `replaces_id`.
- **Doses are rows in `medication_reminders`.** `generate_reminders` creates them for times from 15 minutes ago up to 24 hours ahead, in the patient's timezone. It runs every 15 minutes, and right after approval, manual add, and change. It can run any number of times without creating duplicates.
- **MISSED is only set by `mark_missed`**, every 5 minutes, once a PENDING dose is older than the patient's grace period.
- Both job functions take an optional `p_now` so tests can use fixed times.

## Files this phase creates or changes

| Path | Purpose |
|---|---|
| `supabase/migrations/20250101000300_medicines_doses.sql` | tables, functions, jobs |
| `supabase/tests/03_medicines.test.sql` | database tests |
| `src/lib/supabase/database.types.ts` | regenerated |
| `src/lib/time/local-date.ts` | time zone date helpers |
| `src/lib/medicines/schema.ts` | medicine and schedule validation |
| `src/lib/medicines/defaults.ts` | slot default times, drafts from AI output |
| `src/lib/medicines/describe.ts` | human-readable schedule text |
| `src/strings/en.ts` | new keys |
| `src/lib/patients/tabs.ts` | Medicines tab |
| `src/app/api/documents/[documentId]/approve/route.ts` | POST approve |
| `src/app/api/patients/[patientId]/medications/route.ts` | POST manual add |
| `src/app/api/medications/[medicationId]/stop/route.ts` | POST stop |
| `src/app/api/medications/[medicationId]/change/route.ts` | POST change |
| `src/components/medicines/medicine-editor.tsx` | editable medicines and schedules |
| `src/components/medicines/approval-editor.tsx` | approval wrapper on the document page |
| `src/components/medicines/medicine-actions.tsx` | stop button |
| `src/app/patients/[patientId]/documents/[documentId]/page.tsx` | adds the approval editor |
| `src/app/patients/[patientId]/medicines/page.tsx` | medicine list |
| `src/app/patients/[patientId]/medicines/new/page.tsx` | manual add |
| `src/app/patients/[patientId]/medicines/[medicationId]/change/page.tsx` | change |
| `src/test/*.test.ts` | unit tests |
| `e2e/medicines.spec.ts` | browser tests |

---

## Tasks

### Task 1 — Enable pg_cron

Read the Supabase documentation page for the `pg_cron` extension and confirm how to enable it from a migration for your Supabase version. The migration below uses `create extension if not exists pg_cron with schema pg_catalog;`. If the docs say otherwise, use the documented statement and note it.

For the staging project, also enable `pg_cron` in the dashboard (Database, Extensions) if the docs say a migration alone is not enough.

### Task 2 — Migration

Create `supabase/migrations/20250101000300_medicines_doses.sql`:

```sql
create extension if not exists pg_cron with schema pg_catalog;

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  document_id uuid references public.medical_documents (id) on delete set null,
  replaces_id uuid references public.medications (id) on delete set null,
  name varchar(255) not null check (length(trim(name)) > 0),
  dosage varchar(64) not null check (length(trim(dosage)) > 0),
  instructions text check (length(instructions) <= 1000),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'STOPPED')),
  stopped_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (id, patient_id),
  check ((status = 'STOPPED') = (stopped_at is not null))
);

create index medications_patient on public.medications (patient_id, status);

create table public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null,
  patient_id uuid not null,
  slot text not null check (slot in ('MORNING', 'AFTERNOON', 'EVENING', 'BEDTIME')),
  target_time time not null,
  frequency_type text not null check (frequency_type in ('DAILY', 'SPECIFIC_DAYS', 'EVERY_N_DAYS')),
  weekdays smallint[],
  interval_days smallint,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  unique (id, patient_id),
  foreign key (medication_id, patient_id) references public.medications (id, patient_id) on delete cascade,
  check (end_date is null or end_date >= start_date),
  check (
    (frequency_type = 'DAILY' and weekdays is null and interval_days is null)
    or (
      frequency_type = 'SPECIFIC_DAYS'
      and weekdays is not null
      and cardinality(weekdays) between 1 and 7
      and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
      and interval_days is null
    )
    or (frequency_type = 'EVERY_N_DAYS' and interval_days between 2 and 30 and weekdays is null)
  )
);

create index medication_schedules_medication on public.medication_schedules (medication_id);

create table public.medication_reminders (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null,
  patient_id uuid not null,
  scheduled_for timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACKNOWLEDGED', 'SKIPPED', 'MISSED')),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (schedule_id, scheduled_for),
  foreign key (schedule_id, patient_id) references public.medication_schedules (id, patient_id) on delete cascade,
  check ((status in ('ACKNOWLEDGED', 'SKIPPED')) = (acknowledged_at is not null))
);

create index medication_reminders_patient_time on public.medication_reminders (patient_id, scheduled_for);
create index medication_reminders_pending_time on public.medication_reminders (scheduled_for) where status = 'PENDING';

create or replace function public.insert_medication(p_patient uuid, p_document uuid, p_replaces uuid, p_medicine jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  schedule jsonb;
begin
  if jsonb_typeof(p_medicine) <> 'object'
    or jsonb_typeof(p_medicine -> 'schedules') is distinct from 'array'
    or jsonb_array_length(p_medicine -> 'schedules') not between 1 and 6 then
    raise exception 'VALIDATION_FAILED';
  end if;
  insert into public.medications (patient_id, document_id, replaces_id, name, dosage, instructions, created_by)
  values (
    p_patient,
    p_document,
    p_replaces,
    trim(p_medicine ->> 'name'),
    trim(p_medicine ->> 'dosage'),
    nullif(trim(p_medicine ->> 'instructions'), ''),
    auth.uid()
  )
  returning id into new_id;
  for schedule in select value from jsonb_array_elements(p_medicine -> 'schedules') loop
    insert into public.medication_schedules (
      medication_id, patient_id, slot, target_time, frequency_type, weekdays, interval_days, start_date, end_date
    )
    values (
      new_id,
      p_patient,
      schedule ->> 'slot',
      (schedule ->> 'target_time')::time,
      schedule ->> 'frequency_type',
      case
        when jsonb_typeof(schedule -> 'weekdays') = 'array'
          then array(select (jsonb_array_elements_text(schedule -> 'weekdays'))::smallint)
      end,
      nullif(schedule ->> 'interval_days', '')::smallint,
      (schedule ->> 'start_date')::date,
      nullif(schedule ->> 'end_date', '')::date
    );
  end loop;
  return new_id;
end;
$$;

create or replace function public.generate_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.medication_reminders (schedule_id, patient_id, scheduled_for)
  select s.id, s.patient_id, due.at
  from public.medication_schedules s
  join public.medications m on m.id = s.medication_id and m.status = 'ACTIVE'
  join public.patients p on p.id = s.patient_id and p.deleted_at is null
  cross join lateral (
    select local_day.day, (local_day.day + s.target_time) at time zone p.timezone as at
    from (
      select ((p_now at time zone p.timezone)::date + offset_days) as day
      from generate_series(-1, 1) as offset_days
    ) as local_day
  ) as due
  where due.at >= p_now - interval '15 minutes'
    and due.at < p_now + interval '24 hours'
    and due.day >= s.start_date
    and (s.end_date is null or due.day <= s.end_date)
    and (
      s.frequency_type = 'DAILY'
      or (s.frequency_type = 'SPECIFIC_DAYS' and extract(isodow from due.day)::smallint = any (s.weekdays))
      or (s.frequency_type = 'EVERY_N_DAYS' and (due.day - s.start_date) % s.interval_days = 0)
    )
  on conflict (schedule_id, scheduled_for) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

create or replace function public.mark_missed(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  missed_count integer;
begin
  with updated as (
    update public.medication_reminders r
    set status = 'MISSED'
    from public.patients p
    where p.id = r.patient_id
      and p.deleted_at is null
      and r.status = 'PENDING'
      and r.scheduled_for + make_interval(mins => p.missed_after_minutes) <= p_now
    returning r.id, r.patient_id, r.schedule_id, r.scheduled_for
  ),
  notified as (
    insert into public.notifications (user_id, patient_id, kind, data)
    select
      cl.user_id,
      u.patient_id,
      'DOSE_MISSED',
      jsonb_build_object('reminderId', u.id, 'scheduledFor', u.scheduled_for, 'medicationName', m.name, 'dosage', m.dosage)
    from updated u
    join public.medication_schedules s on s.id = u.schedule_id
    join public.medications m on m.id = s.medication_id
    join public.caregiver_links cl
      on cl.patient_id = u.patient_id and cl.status = 'ACTIVE' and cl.role in ('OWNER', 'CAREGIVER')
    returning 1
  )
  select count(*)::int into missed_count from updated;
  return missed_count;
end;
$$;

create or replace function public.stop_medication_rows(p_medication uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.medications set status = 'STOPPED', stopped_at = now()
  where id = p_medication and status = 'ACTIVE';
  delete from public.medication_reminders r
  using public.medication_schedules s
  where r.schedule_id = s.id
    and s.medication_id = p_medication
    and r.status = 'PENDING'
    and r.scheduled_for > now();
end;
$$;

create or replace function public.approve_document(p_document uuid, p_medicines jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.medical_documents%rowtype;
  medicine jsonb;
  medicine_count integer := 0;
begin
  select * into doc from public.medical_documents where id = p_document and deleted_at is null for update;
  if not found or public.my_role(doc.patient_id) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(doc.patient_id, array['OWNER', 'CAREGIVER']) then
    raise exception 'FORBIDDEN';
  end if;
  if doc.extraction_status <> 'PARSED' then
    raise exception 'CONFLICT';
  end if;
  if jsonb_typeof(p_medicines) is distinct from 'array' or jsonb_array_length(p_medicines) not between 1 and 30 then
    raise exception 'VALIDATION_FAILED';
  end if;
  for medicine in select value from jsonb_array_elements(p_medicines) loop
    perform public.insert_medication(doc.patient_id, doc.id, null, medicine);
    medicine_count := medicine_count + 1;
  end loop;
  update public.medical_documents set extraction_status = 'VERIFIED' where id = doc.id;
  perform public.generate_reminders();
  return medicine_count;
end;
$$;

create or replace function public.add_medication(p_patient uuid, p_medicine jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if public.my_role(p_patient) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(p_patient, array['OWNER', 'CAREGIVER']) then
    raise exception 'FORBIDDEN';
  end if;
  new_id := public.insert_medication(p_patient, null, null, p_medicine);
  perform public.generate_reminders();
  return new_id;
end;
$$;

create or replace function public.stop_medication(p_medication uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  medicine public.medications%rowtype;
begin
  select * into medicine from public.medications where id = p_medication for update;
  if not found or public.my_role(medicine.patient_id) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(medicine.patient_id, array['OWNER', 'CAREGIVER']) then
    raise exception 'FORBIDDEN';
  end if;
  perform public.stop_medication_rows(medicine.id);
end;
$$;

create or replace function public.change_medication(p_medication uuid, p_medicine jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  medicine public.medications%rowtype;
  new_id uuid;
begin
  select * into medicine from public.medications where id = p_medication for update;
  if not found or public.my_role(medicine.patient_id) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(medicine.patient_id, array['OWNER', 'CAREGIVER']) then
    raise exception 'FORBIDDEN';
  end if;
  if medicine.status <> 'ACTIVE' then
    raise exception 'CONFLICT';
  end if;
  perform public.stop_medication_rows(medicine.id);
  new_id := public.insert_medication(medicine.patient_id, medicine.document_id, medicine.id, p_medicine);
  perform public.generate_reminders();
  return new_id;
end;
$$;

create trigger audit_medications after insert or update or delete on public.medications
for each row execute function public.audit_row_change();
create trigger audit_medication_schedules after insert or update or delete on public.medication_schedules
for each row execute function public.audit_row_change();
create trigger audit_medication_reminders after update on public.medication_reminders
for each row execute function public.audit_row_change();

alter table public.medications enable row level security;
alter table public.medication_schedules enable row level security;
alter table public.medication_reminders enable row level security;

revoke all on table public.medications, public.medication_schedules, public.medication_reminders from anon, authenticated;
grant select on table public.medications, public.medication_schedules, public.medication_reminders to authenticated;

create policy medications_select on public.medications for select to authenticated
  using (public.my_role(patient_id) is not null);
create policy medication_schedules_select on public.medication_schedules for select to authenticated
  using (public.my_role(patient_id) is not null);
create policy medication_reminders_select on public.medication_reminders for select to authenticated
  using (public.my_role(patient_id) is not null);

revoke all on function public.insert_medication(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.generate_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.mark_missed(timestamptz) from public, anon, authenticated;
revoke all on function public.stop_medication_rows(uuid) from public, anon, authenticated;
revoke all on function public.approve_document(uuid, jsonb) from public, anon;
revoke all on function public.add_medication(uuid, jsonb) from public, anon;
revoke all on function public.stop_medication(uuid) from public, anon;
revoke all on function public.change_medication(uuid, jsonb) from public, anon;

grant execute on function public.approve_document(uuid, jsonb) to authenticated;
grant execute on function public.add_medication(uuid, jsonb) to authenticated;
grant execute on function public.stop_medication(uuid) to authenticated;
grant execute on function public.change_medication(uuid, jsonb) to authenticated;

select cron.schedule('carecircle-generate-reminders', '*/15 * * * *', $$select public.generate_reminders()$$);
select cron.schedule('carecircle-mark-missed', '*/5 * * * *', $$select public.mark_missed()$$);
```

Run:

```
npx supabase db reset
npm run db:types
```

**Check:** both succeed. Then confirm the jobs exist:

```
npx supabase db query "select jobname, schedule from cron.job order by jobname"
```

If your CLI has no `db query` command, open Supabase Studio (URL from `supabase status`), SQL editor, and run the same `select`. Expected two rows: `carecircle-generate-reminders` every 15 minutes and `carecircle-mark-missed` every 5 minutes.

### Task 3 — Database tests

Create `supabase/tests/03_medicines.test.sql`. Dates in these tests are fixed so the results never depend on the day you run them. 2026-03-09 is a Monday. India has no daylight saving time; the United States changed to daylight saving time on 2026-03-08, so Los Angeles is UTC−7 on these dates.

```sql
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
      {"slot":"MORNING","target_time":"08:00","frequency_type":"DAILY","start_date":"2027-01-01"}
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
```

Why the dates are arranged this way:

- The approved medicines start in 2027, so the fixed 2026 job runs in this file create no doses for them.
- The missed-dose checks run before the Monday job run, so only the doses listed in each assertion exist at that moment.
- `change_medication` runs in its own statement (`lives_ok`) and is checked in the next one. A query cannot see rows that a function it calls inserted during the same statement.

Run `npm run db:test`.

**Check:** 60 + 39 = 99 tests passed.

### Task 4 — Time and medicine helpers

Create `src/lib/time/local-date.ts`:

```ts
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function timeInZone(instant: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    typeof instant === "string" ? new Date(instant) : instant,
  );
}

export function dateInZone(instant: string | Date, timeZone: string): string {
  return todayInZone(timeZone, typeof instant === "string" ? new Date(instant) : instant);
}
```

Create `src/lib/medicines/schema.ts`:

```ts
import { z } from "zod";
import { SLOTS } from "@/lib/gemini/schema";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const baseSchedule = z.object({
  slot: z.enum(SLOTS),
  target_time: time,
  start_date: isoDate,
  end_date: isoDate.nullable().optional(),
});

export const scheduleSchema = z
  .discriminatedUnion("frequency_type", [
    baseSchedule.extend({ frequency_type: z.literal("DAILY") }),
    baseSchedule.extend({
      frequency_type: z.literal("SPECIFIC_DAYS"),
      weekdays: z
        .array(z.number().int().min(1).max(7))
        .min(1)
        .max(7)
        .refine((days) => new Set(days).size === days.length),
    }),
    baseSchedule.extend({ frequency_type: z.literal("EVERY_N_DAYS"), interval_days: z.number().int().min(2).max(30) }),
  ])
  .refine((schedule) => !schedule.end_date || schedule.end_date >= schedule.start_date, { path: ["end_date"] });

export const medicineSchema = z.object({
  name: z.string().trim().min(1).max(255),
  dosage: z.string().trim().min(1).max(64),
  instructions: z.string().trim().max(1000).nullable().optional(),
  schedules: z.array(scheduleSchema).min(1).max(6),
});

export const approvalSchema = z.object({ medicines: z.array(medicineSchema).min(1).max(30) });

export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type MedicineInput = z.infer<typeof medicineSchema>;
```

The JSON keys use snake_case on purpose: the object is passed straight to the database function, which reads those keys.

Create `src/lib/medicines/defaults.ts`:

```ts
import type { Extraction, Slot } from "@/lib/gemini/schema";
import { addDays } from "@/lib/time/local-date";

export const DEFAULT_SLOT_TIMES: Record<Slot, string> = {
  MORNING: "08:00",
  AFTERNOON: "13:00",
  EVENING: "19:00",
  BEDTIME: "22:00",
};

export type FrequencyType = "DAILY" | "SPECIFIC_DAYS" | "EVERY_N_DAYS";

export type ScheduleDraft = {
  slot: Slot;
  target_time: string;
  frequency_type: FrequencyType;
  weekdays: number[];
  interval_days: number;
  start_date: string;
  end_date: string;
};

export type MedicineDraft = {
  name: string;
  dosage: string;
  instructions: string;
  schedules: ScheduleDraft[];
};

export function newScheduleDraft(slot: Slot, startDate: string, endDate = ""): ScheduleDraft {
  return {
    slot,
    target_time: DEFAULT_SLOT_TIMES[slot],
    frequency_type: "DAILY",
    weekdays: [],
    interval_days: 2,
    start_date: startDate,
    end_date: endDate,
  };
}

export function draftsFromExtraction(extraction: Extraction, today: string): MedicineDraft[] {
  return extraction.medicines.map((medicine) => {
    const endDate = medicine.duration_days ? addDays(today, medicine.duration_days - 1) : "";
    const uniqueSlots = [...new Set(medicine.slots)];
    return {
      name: medicine.name,
      dosage: medicine.dosage,
      instructions: medicine.instructions ?? "",
      schedules: uniqueSlots.map((slot) => newScheduleDraft(slot, today, endDate)),
    };
  });
}

export function draftToInput(draft: MedicineDraft) {
  return {
    name: draft.name,
    dosage: draft.dosage,
    instructions: draft.instructions.trim() === "" ? null : draft.instructions,
    schedules: draft.schedules.map((schedule) => {
      const base = {
        slot: schedule.slot,
        target_time: schedule.target_time,
        start_date: schedule.start_date,
        end_date: schedule.end_date === "" ? null : schedule.end_date,
      };
      if (schedule.frequency_type === "SPECIFIC_DAYS") {
        return { ...base, frequency_type: "SPECIFIC_DAYS" as const, weekdays: [...schedule.weekdays].sort() };
      }
      if (schedule.frequency_type === "EVERY_N_DAYS") {
        return { ...base, frequency_type: "EVERY_N_DAYS" as const, interval_days: schedule.interval_days };
      }
      return { ...base, frequency_type: "DAILY" as const };
    }),
  };
}
```

Create `src/lib/medicines/describe.ts`: export `describeSchedule(schedule: { slot, target_time, frequency_type, weekdays, interval_days, start_date, end_date }): string`. It returns text built only from `strings.medicines.describe` pieces, for example "Morning at 08:00, every day, from 2026-03-01 until 2026-03-30", "Evening at 19:00, on Mon, Thu", "Morning at 10:00, every 3 days". `target_time` from the database may be `08:00:00`; show only `HH:MM`.

### Task 5 — Strings

Add to `src/strings/en.ts`:

```ts
  medicines: {
    title: "Medicines",
    active: "Taking now",
    stopped: "Stopped",
    empty: "No medicines yet.",
    add: "Add a medicine by hand",
    addTitle: "Add a medicine",
    changeTitle: "Change this medicine",
    changeIntro: "The current medicine will be stopped and replaced by this one. Its history is kept.",
    stop: "Stop",
    confirmStop: "Stop this medicine? Future doses will be removed. Past doses stay in the history.",
    change: "Change",
    stoppedOn: "Stopped on",
    replaces: "Replaces an earlier version",
    fromDocument: "From a document",
    name: "Medicine name",
    dosage: "Dose",
    instructions: "Directions",
    schedules: "When to take it",
    slot: "Time of day",
    time: "Time",
    frequency: "How often",
    frequencies: { DAILY: "Every day", SPECIFIC_DAYS: "On chosen days", EVERY_N_DAYS: "Every few days" },
    weekdays: "Days",
    weekdayNames: { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" },
    intervalDays: "Every how many days",
    startDate: "Start date",
    endDate: "End date",
    endDateHint: "Leave empty if there is no end date.",
    addSchedule: "Add a time",
    removeSchedule: "Remove this time",
    addMedicine: "Add another medicine",
    removeMedicine: "Remove this medicine",
    noSchedules: "Add at least one time for this medicine.",
    approveTitle: "Check and approve",
    approveIntro: "Fix anything the AI got wrong, set the times, then approve. Nothing is used until you approve.",
    approve: "Approve all medicines",
    approving: "Approving…",
    approved: "Approved. Today's doses are ready.",
    save: "Save medicine",
    describe: {
      at: "at",
      everyDay: "every day",
      on: "on",
      every: "every",
      days: "days",
      from: "from",
      until: "until",
    },
  },
```

Add `medicines: "Medicines",` to `strings.tabs`, and add the tab to `PATIENT_TABS` after Documents:

```ts
  { href: (id) => `/patients/${id}/medicines`, label: strings.tabs.medicines, roles: ["OWNER", "CAREGIVER", "VIEWER"] },
```

### Task 6 — Routes

Create `src/app/api/documents/[documentId]/approve/route.ts`:

```ts
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";
import { approvalSchema } from "@/lib/medicines/schema";
import { parseInput, readJsonBody } from "@/lib/validation";

export const POST = handleRoute<{ documentId: string }>(async (request, { params }) => {
  if (!isUuid(params.documentId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { medicines } = parseInput(approvalSchema, await readJsonBody(request));
  const { data, error } = await supabase.rpc("approve_document", {
    p_document: params.documentId,
    p_medicines: medicines,
  });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ approved: data });
});
```

Create the other three routes with the same shape:

| File | Body | RPC |
|---|---|---|
| `src/app/api/patients/[patientId]/medications/route.ts` (POST) | `medicineSchema` | `add_medication({ p_patient: patientId, p_medicine: body })` → `jsonOk({ medicationId: data }, 201)` |
| `src/app/api/medications/[medicationId]/stop/route.ts` (POST) | none | `stop_medication({ p_medication: medicationId })` → `jsonOk({ ok: true })` |
| `src/app/api/medications/[medicationId]/change/route.ts` (POST) | `medicineSchema` | `change_medication({ p_medication: medicationId, p_medicine: body })` → `jsonOk({ medicationId: data }, 201)` |

If the generated types require `Json` for `p_medicines` or `p_medicine`, import the `Json` type from `database.types.ts` and pass `medicines as Json`; this is a type-only conversion of already-validated data.

### Task 7 — Medicine editor

Create `src/components/medicines/medicine-editor.tsx` (client component). It edits a list of `MedicineDraft` and is reused for approval, manual add, and change. Specification:

- Props: `initial: MedicineDraft[]`, `today: string`, `allowMultiple: boolean`, `submitLabel: string`, `busyLabel: string`, `onSubmit: (drafts: MedicineDraft[]) => Promise<ApiFailure | null>`, `flags?: RowFlags[]` (same order as `initial`; shown only for rows that came from the AI).
- State: the drafts array. Every input is controlled.
- For each medicine, a bordered card with:
  - flag labels at the top when `flags[i]?.needsAttention` (text from `strings.documents.flags`, with `border-l-4 border-warn`);
  - `name`, `dosage`, `instructions` text fields (ids must be unique, for example `name-0`);
  - a list of schedule rows, each with: slot select (`strings.slots`), `type="time"` input, frequency select (`strings.medicines.frequencies`), weekday checkboxes (only when SPECIFIC_DAYS; seven checkboxes labelled `strings.medicines.weekdayNames`), interval number input 2–30 (only when EVERY_N_DAYS), start date, end date with hint;
  - "Add a time" button: appends `newScheduleDraft("MORNING", today, <end date of the first schedule or "">)`; changing a new row's slot sets its time to `DEFAULT_SLOT_TIMES[slot]` only if the time still equals the previous slot's default;
  - "Remove this time" button on each schedule row;
  - "Remove this medicine" button when `allowMultiple` and more than one medicine.
- "Add another medicine" button when `allowMultiple` (appends an empty draft with one morning schedule).
- Submit button: validate every draft with `medicineSchema.safeParse(draftToInput(draft))`. If any fails, show a `Notice` with `strings.errors.VALIDATION_FAILED` and, inside each failing card, `strings.medicines.noSchedules` when it has no schedules. If all pass, call `onSubmit(drafts)`; show the returned error with `ErrorMessage`.
- All touch targets at least 48 px; each schedule row stacks vertically below 640 px.

Create `src/components/medicines/approval-editor.tsx` (client). Specification:

- Props: `documentId`, `extraction: Extraction`, `today: string` (patient's local date), `demoMode: boolean`.
- Show heading `strings.medicines.approveTitle`, intro, and the demo notice when `demoMode`.
- Render `<MedicineEditor initial={draftsFromExtraction(extraction, today)} flags={extraction.medicines.map(flagsFor)} allowMultiple submitLabel={strings.medicines.approve} busyLabel={strings.medicines.approving} onSubmit={...} />`.
- `onSubmit` posts `{ medicines: drafts.map(draftToInput) }` to `/api/documents/{documentId}/approve`. On success show `strings.medicines.approved` and `router.push(\`/patients/${patientId}/medicines\`)` (pass `patientId` as a prop too).
- When `extraction.medicines` is empty, start with one empty medicine draft.

Edit `src/app/patients/[patientId]/documents/[documentId]/page.tsx`: when the status is PARSED and the role is OWNER or CAREGIVER, render `<ApprovalEditor ... today={todayInZone(patient.timezone)} />` instead of the read-only `ExtractionTable`. VIEWERs and VERIFIED documents keep the read-only table.

### Task 8 — Medicines pages

Create `src/components/medicines/medicine-actions.tsx` (client): `StopMedicineButton` (confirm with `strings.medicines.confirmStop`, POST stop route, `router.refresh()`), shown only to OWNER and CAREGIVER.

Create `src/app/patients/[patientId]/medicines/page.tsx` (server component). Specification:

- `loadPatientContext`; PATIENT → `notFound()`.
- Query: `supabase.from("medications").select("id, name, dosage, instructions, status, stopped_at, document_id, replaces_id, created_at, medication_schedules(slot, target_time, frequency_type, weekdays, interval_days, start_date, end_date)").eq("patient_id", patientId).order("created_at", { ascending: false })`.
- Section "Taking now": ACTIVE medicines, each showing name, dosage, directions, each schedule via `describeSchedule`, "From a document" link to the document when `document_id` is set, "Replaces an earlier version" when `replaces_id` is set. OWNER/CAREGIVER see "Change" (link to `/patients/{id}/medicines/{medicationId}/change`) and `StopMedicineButton`.
- Section "Stopped": STOPPED medicines with `strings.medicines.stoppedOn` and the date, inside a `<details>` element closed by default.
- OWNER/CAREGIVER see a link-button "Add a medicine by hand" to `/patients/{id}/medicines/new`.
- Sort schedules within a medicine by `target_time`.

Create `src/app/patients/[patientId]/medicines/new/page.tsx`: role OWNER or CAREGIVER only; heading `strings.medicines.addTitle`; a client wrapper renders `<MedicineEditor initial={[emptyDraft]} allowMultiple={false} ... />` whose `onSubmit` posts `draftToInput(drafts[0])` to `/api/patients/{id}/medications`, then `router.push(\`/patients/${id}/medicines\`)`.

Create `src/app/patients/[patientId]/medicines/[medicationId]/change/page.tsx`: role OWNER or CAREGIVER only; load the medicine with its schedules (ACTIVE only, otherwise `notFound()`); heading `strings.medicines.changeTitle` and `strings.medicines.changeIntro`; `MedicineEditor` with one draft built from the current medicine (times trimmed to `HH:MM`, start date = patient's today, end date kept if it is today or later, otherwise empty); `onSubmit` posts to the change route, then returns to the medicines page.

**Check:** `npm run build` succeeds. By hand (demo mode): read the demo document, add a Bedtime 22:00 time to Atorvastatin, approve, see three medicines; open the dashboard database in Studio and see today's reminder rows.

### Task 9 — Unit tests

`src/test/local-date.test.ts`:

- `todayInZone("Asia/Kolkata", new Date("2026-03-09T20:00:00Z"))` → `2026-03-10`.
- `todayInZone("America/Los_Angeles", new Date("2026-03-09T20:00:00Z"))` → `2026-03-09`.
- `addDays("2026-02-27", 2)` → `2026-03-01`; `addDays("2028-02-28", 1)` → `2028-02-29`; `addDays("2026-03-10", 29)` → `2026-04-08`.
- `timeInZone("2026-03-10T02:30:00Z", "Asia/Kolkata")` → `08:00`.

`src/test/medicine-schema.test.ts`:

- FR-6.1 a valid DAILY medicine passes.
- `target_time` `8:00`, `24:00`, `12:60` fail; `00:00` and `23:59` pass.
- FR-6.5 SPECIFIC_DAYS with `weekdays: []` fails; with `[1, 1]` fails; with `[1, 4]` passes; with `[0]` and `[8]` fails.
- FR-6.5 EVERY_N_DAYS with `interval_days` 1 and 31 fails; 2 and 30 pass.
- FR-6.6 `end_date` before `start_date` fails; equal passes.
- No schedules fails; 7 schedules fail.
- `approvalSchema` with 0 medicines fails; 31 fail.

`src/test/medicine-defaults.test.ts`:

- FR-6.1 FR-6.6 `draftsFromExtraction(fixture, "2026-03-10")`: Metformin has two schedules at 08:00 and 19:00, start `2026-03-10`, end `2026-04-08`; Atorvastatin has zero schedules and end `""`.
- `draftToInput` turns `""` instructions and end date into `null`, sorts weekdays, and omits `weekdays` and `interval_days` for DAILY.
- A draft from `draftToInput` passes `medicineSchema`.

`src/test/describe-schedule.test.ts`: the three example sentences from task 4, plus `target_time: "08:00:00"` shows `08:00`.

**Check:** `npm test` passes.

### Task 10 — Browser tests

Create `e2e/medicines.spec.ts` (demo mode, clean database):

1. `FR-5.2 FR-6.1 caregiver approves the demo prescription`: owner creates a patient, gives consent, uploads, reads with AI, adds a Bedtime time to Atorvastatin, approves; the Medicines page shows Metformin, Amlodipine, Atorvastatin under "Taking now"; Metformin shows "Morning at 08:00" and "Evening at 19:00".
2. `FR-5.2 approval without a time for every medicine is blocked`: same, but approve without adding Atorvastatin's time; see the validation notice; nothing is approved (the Medicines page is empty).
3. `FR-5.2 a document cannot be approved twice`: after approval, `page.request.post("/api/documents/{id}/approve", ...)` with a valid body returns 409.
4. `FR-6.4 manual add`: add "Vitamin D 1000 IU", every 3 days, morning; it appears with "every 3 days".
5. `FR-6.2 stop`: stop Amlodipine (accept the dialog); it moves to "Stopped".
6. `FR-6.3 change`: change Metformin to 1000 mg; the active list shows 1000 mg with "Replaces an earlier version"; "Stopped" contains the 500 mg version.
7. `FR-6.2 viewer has no action buttons`: as a viewer, the Medicines page shows medicines but no Stop, Change, or Add.

**Check:** `npm run test:e2e` passes.

---

## Exit checks

| Command | Expected |
|---|---|
| `npm run db:reset` | no error |
| `npm run db:test` | 99 passed |
| cron jobs query (task 2) | two jobs |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | all pass |
| `npm run build` | succeeds |
| `npm run test:e2e` | all pass |
| By hand: approve a medicine whose time is 10 minutes from now; wait for the time plus the grace period you set (use 30 minutes on a test patient); the reminder row becomes MISSED and the owner has a DOSE_MISSED notification row | as described |

## Exit log

```
(pass lines and the by-hand result)
```

## Notes

```
(differences from the plan)
```

## Blocked

```
(none)
```

## Out of scope for this phase

- The patient's today view and acknowledging doses (P4).
- Showing doses and compliance on the dashboard (P5).
- Notification centre UI (P5).
