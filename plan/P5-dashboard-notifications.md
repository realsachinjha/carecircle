# Phase 5 — Dashboard, checkups, and notifications

## Goal

The caregiver's patient page becomes a dashboard: compliance for today and the last 7 days, today's doses, missed doses, documents waiting for review, and the next checkup. It updates live when the patient taps a dose. Caregivers manage checkups, see an activity timeline, and read notifications in a notification centre with a live unread count.

## Requirements covered

FR-9.1 to FR-9.3, FR-10.1 to FR-10.5, FR-11.1 to FR-11.3.

## Before you start

- Phase 4 exit checks pass.
- Read PRD FR-9, FR-10, FR-11.

## Rules for this phase

- **Compliance** = ACKNOWLEDGED ÷ (ACKNOWLEDGED + SKIPPED + MISSED), counting only doses already due. PENDING doses that are due are shown separately and never counted. No settled doses → "No doses due yet", not 0%.
- **Checkup times are entered in the patient's timezone.** The form sends a local date and time; the database converts it with the patient's timezone.
- **Live updates** use Supabase Realtime. Row-level security still applies: a user only receives changes to rows they can read.

## Files this phase creates or changes

| Path | Purpose |
|---|---|
| `supabase/migrations/20250101000500_checkups_dashboard.sql` | checkups, compliance, realtime, checkup reminder job |
| `supabase/tests/05_dashboard.test.sql` | database tests |
| `src/lib/supabase/database.types.ts` | regenerated |
| `src/lib/dashboard/compliance.ts` | percentage and labels |
| `src/lib/notifications/render.ts` | notification text from `kind` and `data` |
| `src/lib/activity/describe.ts` | activity text from audit rows |
| `src/lib/time/local-input.ts` | `datetime-local` value in a timezone |
| `src/strings/en.ts` | new keys |
| `src/lib/patients/tabs.ts` | Checkups and Activity tabs |
| `src/app/api/patients/[patientId]/checkups/route.ts` | POST create |
| `src/app/api/checkups/[checkupId]/route.ts` | PATCH, DELETE |
| `src/app/api/checkups/[checkupId]/complete/route.ts` | POST complete |
| `src/app/api/notifications/read/route.ts` | POST mark read |
| `src/components/app-header.tsx` | adds the notification bell |
| `src/components/notifications/notification-bell.tsx` | live unread count |
| `src/components/dashboard/live-refresh.tsx` | refresh on dose changes |
| `src/components/dashboard/compliance-card.tsx` | compliance bars |
| `src/components/dashboard/attention-card.tsx` | missed doses, documents to check |
| `src/components/dashboard/today-doses-card.tsx` | today's doses for caregivers |
| `src/components/checkups/checkup-form.tsx`, `checkup-actions.tsx` | create, edit, complete, delete |
| `src/app/patients/[patientId]/page.tsx` | dashboard |
| `src/app/patients/[patientId]/checkups/page.tsx`, `new/page.tsx`, `[checkupId]/edit/page.tsx` | checkups |
| `src/app/patients/[patientId]/activity/page.tsx` | timeline |
| `src/app/notifications/page.tsx`, `notification-list.tsx` | notification centre |
| `src/app/me/page.tsx` | next checkup card for the patient |
| `src/test/*.test.ts` | unit tests |
| `e2e/dashboard.spec.ts` | browser tests |

---

## Tasks

### Task 1 — Migration

Create `supabase/migrations/20250101000500_checkups_dashboard.sql`:

```sql
create table public.checkup_schedules (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  checkup_type text not null default 'CONSULTATION' check (checkup_type in ('CONSULTATION', 'LAB_TEST', 'DIAGNOSTIC', 'OTHER')),
  doctor_name varchar(128) not null check (length(trim(doctor_name)) > 0),
  clinic_location text check (length(clinic_location) <= 500),
  appointment_time timestamptz not null,
  reminder_hours_before integer not null default 24 check (reminder_hours_before between 1 and 168),
  reminded_at timestamptz,
  notes text check (length(notes) <= 2000),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (id, patient_id)
);

create index checkup_schedules_patient_time on public.checkup_schedules (patient_id, appointment_time);
create index checkup_schedules_due on public.checkup_schedules (appointment_time) where reminded_at is null;

create table public.checkup_completions (
  id uuid primary key default gen_random_uuid(),
  checkup_id uuid not null unique,
  patient_id uuid not null,
  completed_at timestamptz not null default now(),
  completed_by uuid not null references public.profiles (id),
  clinical_notes text check (length(clinical_notes) <= 4000),
  foreign key (checkup_id, patient_id) references public.checkup_schedules (id, patient_id) on delete cascade
);

create or replace function public.save_checkup(
  p_checkup uuid,
  p_patient uuid,
  p_checkup_type text,
  p_doctor_name text,
  p_clinic_location text,
  p_local_time timestamp,
  p_reminder_hours_before integer,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.checkup_schedules%rowtype;
  patient uuid;
  zone text;
  appointment timestamptz;
  new_id uuid;
begin
  if p_checkup is null then
    patient := p_patient;
  else
    select * into target from public.checkup_schedules where id = p_checkup for update;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    patient := target.patient_id;
  end if;
  if public.my_role(patient) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(patient, array['OWNER', 'CAREGIVER']) then
    raise exception 'FORBIDDEN';
  end if;
  if p_local_time is null or p_doctor_name is null or length(trim(p_doctor_name)) = 0 then
    raise exception 'VALIDATION_FAILED';
  end if;
  select timezone into zone from public.patients where id = patient;
  appointment := p_local_time at time zone zone;
  if p_checkup is null then
    insert into public.checkup_schedules (
      patient_id, checkup_type, doctor_name, clinic_location, appointment_time, reminder_hours_before, notes, created_by
    )
    values (
      patient,
      coalesce(p_checkup_type, 'CONSULTATION'),
      trim(p_doctor_name),
      nullif(trim(p_clinic_location), ''),
      appointment,
      coalesce(p_reminder_hours_before, 24),
      nullif(trim(p_notes), ''),
      auth.uid()
    )
    returning id into new_id;
    return new_id;
  end if;
  update public.checkup_schedules
  set checkup_type = coalesce(p_checkup_type, checkup_type),
      doctor_name = trim(p_doctor_name),
      clinic_location = nullif(trim(p_clinic_location), ''),
      appointment_time = appointment,
      reminder_hours_before = coalesce(p_reminder_hours_before, reminder_hours_before),
      notes = nullif(trim(p_notes), ''),
      reminded_at = case
        when appointment_time is distinct from appointment
          or reminder_hours_before is distinct from coalesce(p_reminder_hours_before, reminder_hours_before)
        then null
        else reminded_at
      end
  where id = p_checkup;
  return p_checkup;
end;
$$;

create or replace function public.delete_checkup(p_checkup uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.checkup_schedules%rowtype;
begin
  select * into target from public.checkup_schedules where id = p_checkup for update;
  if not found or public.my_role(target.patient_id) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(target.patient_id, array['OWNER', 'CAREGIVER']) then
    raise exception 'FORBIDDEN';
  end if;
  delete from public.checkup_schedules where id = target.id;
end;
$$;

create or replace function public.complete_checkup(p_checkup uuid, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.checkup_schedules%rowtype;
  completion_id uuid;
begin
  select * into target from public.checkup_schedules where id = p_checkup;
  if not found or public.my_role(target.patient_id) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(target.patient_id, array['OWNER', 'CAREGIVER']) then
    raise exception 'FORBIDDEN';
  end if;
  insert into public.checkup_completions (checkup_id, patient_id, completed_by, clinical_notes)
  values (target.id, target.patient_id, auth.uid(), nullif(trim(p_notes), ''))
  on conflict (checkup_id) do update set clinical_notes = excluded.clinical_notes
  returning id into completion_id;
  return completion_id;
end;
$$;

create or replace function public.send_checkup_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminded_count integer;
begin
  with due as (
    update public.checkup_schedules c
    set reminded_at = p_now
    from public.patients p
    where p.id = c.patient_id
      and p.deleted_at is null
      and c.reminded_at is null
      and c.appointment_time > p_now
      and c.appointment_time - make_interval(hours => c.reminder_hours_before) <= p_now
      and not exists (select 1 from public.checkup_completions cc where cc.checkup_id = c.id)
    returning c.id, c.patient_id, c.doctor_name, c.appointment_time, c.checkup_type
  ),
  recipients as (
    select d.*, cl.user_id
    from due d
    join public.caregiver_links cl on cl.patient_id = d.patient_id and cl.status = 'ACTIVE'
    union all
    select d.*, pl.user_id
    from due d
    join public.patient_links pl on pl.patient_id = d.patient_id
  ),
  notified as (
    insert into public.notifications (user_id, patient_id, kind, data)
    select
      r.user_id,
      r.patient_id,
      'CHECKUP_SOON',
      jsonb_build_object('checkupId', r.id, 'doctorName', r.doctor_name, 'appointmentTime', r.appointment_time, 'checkupType', r.checkup_type)
    from recipients r
    returning 1
  )
  select count(*)::int into reminded_count from due;
  return reminded_count;
end;
$$;

create or replace function public.compliance(p_patient uuid, p_days integer default 7, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  zone text;
  local_today date;
  result jsonb;
begin
  if p_days is null or p_days not between 1 and 90 then
    raise exception 'VALIDATION_FAILED';
  end if;
  select timezone into zone from public.patients where id = p_patient;
  if zone is null then
    raise exception 'NOT_FOUND';
  end if;
  local_today := (p_now at time zone zone)::date;
  select jsonb_build_object(
    'days', coalesce(
      jsonb_agg(
        jsonb_build_object('date', d.day, 'taken', c.taken, 'skipped', c.skipped, 'missed', c.missed, 'pending', c.pending)
        order by d.day
      ),
      '[]'::jsonb
    ),
    'totals', jsonb_build_object(
      'taken', coalesce(sum(c.taken), 0),
      'skipped', coalesce(sum(c.skipped), 0),
      'missed', coalesce(sum(c.missed), 0),
      'pending', coalesce(sum(c.pending), 0)
    )
  )
  into result
  from (
    select (local_today - offset_days) as day
    from generate_series(0, p_days - 1) as offset_days
  ) as d
  cross join lateral (
    select
      count(*) filter (where r.status = 'ACKNOWLEDGED')::int as taken,
      count(*) filter (where r.status = 'SKIPPED')::int as skipped,
      count(*) filter (where r.status = 'MISSED')::int as missed,
      count(*) filter (where r.status = 'PENDING')::int as pending
    from public.medication_reminders r
    where r.patient_id = p_patient
      and r.scheduled_for >= (d.day::timestamp at time zone zone)
      and r.scheduled_for < ((d.day + 1)::timestamp at time zone zone)
      and r.scheduled_for <= p_now
  ) as c;
  return result;
end;
$$;

create trigger audit_checkup_schedules after insert or update or delete on public.checkup_schedules
for each row execute function public.audit_row_change();
create trigger audit_checkup_completions after insert or update or delete on public.checkup_completions
for each row execute function public.audit_row_change();

alter table public.checkup_schedules enable row level security;
alter table public.checkup_completions enable row level security;

revoke all on table public.checkup_schedules, public.checkup_completions from anon, authenticated;
grant select on table public.checkup_schedules, public.checkup_completions to authenticated;

create policy checkup_schedules_select on public.checkup_schedules for select to authenticated
  using (public.my_role(patient_id) is not null);
create policy checkup_completions_select on public.checkup_completions for select to authenticated
  using (public.my_role(patient_id) is not null);

alter publication supabase_realtime add table public.medication_reminders, public.notifications;

revoke all on function public.save_checkup(uuid, uuid, text, text, text, timestamp, integer, text) from public, anon;
revoke all on function public.delete_checkup(uuid) from public, anon;
revoke all on function public.complete_checkup(uuid, text) from public, anon;
revoke all on function public.send_checkup_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.compliance(uuid, integer, timestamptz) from public, anon;

grant execute on function public.save_checkup(uuid, uuid, text, text, text, timestamp, integer, text) to authenticated;
grant execute on function public.delete_checkup(uuid) to authenticated;
grant execute on function public.complete_checkup(uuid, text) to authenticated;
grant execute on function public.compliance(uuid, integer, timestamptz) to authenticated;

select cron.schedule('carecircle-checkup-reminders', '*/15 * * * *', $$select public.send_checkup_reminders()$$);
```

If `alter publication supabase_realtime` fails because the publication does not exist in your Supabase version, read the Supabase Realtime "Postgres Changes" documentation for how to enable a table for realtime, follow it, and note it.

Run `npx supabase db reset` and `npm run db:types`.

**Check:** both succeed.

### Task 2 — Database tests

Create `supabase/tests/05_dashboard.test.sql`. Reminder times use 2026-03-10 in `Asia/Kolkata`, and the compliance checks pass `p_now` explicitly.

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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

select pg_temp.make_user('00000000-0000-0000-0000-0000000000a1', 'owner@test.local');
select pg_temp.make_user('00000000-0000-0000-0000-0000000000a2', 'care@test.local');
select pg_temp.make_user('00000000-0000-0000-0000-0000000000a3', 'viewer@test.local');
select pg_temp.make_user('00000000-0000-0000-0000-0000000000a4', 'patient@test.local');
select pg_temp.make_user('00000000-0000-0000-0000-0000000000a5', 'outsider@test.local');

insert into public.patients (id, full_name, date_of_birth, created_by, timezone)
values ('00000000-0000-0000-0000-0000000000b1', 'Ramesh Test', '1957-03-04', '00000000-0000-0000-0000-0000000000a1', 'Asia/Kolkata');
insert into public.caregiver_links (patient_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'OWNER'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'CAREGIVER'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'VIEWER');
insert into public.patient_links (patient_id, user_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a4');
insert into public.medications (id, patient_id, name, dosage, created_by)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'Metformin', '500 mg', '00000000-0000-0000-0000-0000000000a1');
insert into public.medication_schedules (id, medication_id, patient_id, slot, target_time, frequency_type, start_date)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'MORNING', '08:00', 'DAILY', '2026-01-01');

insert into public.medication_reminders (schedule_id, patient_id, scheduled_for, status, acknowledged_at) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '2026-03-10 08:00:00+05:30', 'ACKNOWLEDGED', '2026-03-10 08:05:00+05:30'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '2026-03-10 13:00:00+05:30', 'SKIPPED', '2026-03-10 13:10:00+05:30'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '2026-03-10 19:00:00+05:30', 'MISSED', null),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '2026-03-10 21:00:00+05:30', 'PENDING', null),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '2026-03-10 23:00:00+05:30', 'PENDING', null),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '2026-03-09 08:00:00+05:30', 'ACKNOWLEDGED', '2026-03-09 08:01:00+05:30'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '2026-03-03 08:00:00+05:30', 'ACKNOWLEDGED', '2026-03-03 08:01:00+05:30');

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select is(
  jsonb_array_length(public.compliance('00000000-0000-0000-0000-0000000000b1', 7, '2026-03-10 21:30:00+05:30') -> 'days'),
  7,
  'FR-10.1 compliance has one entry per day for 7 days'
);
select is(
  public.compliance('00000000-0000-0000-0000-0000000000b1', 7, '2026-03-10 21:30:00+05:30') -> 'days' -> 6,
  '{"date": "2026-03-10", "taken": 1, "skipped": 1, "missed": 1, "pending": 1}'::jsonb,
  'FR-10.1 today counts taken, skipped, missed, and due-but-pending; future doses are not counted'
);
select is(
  public.compliance('00000000-0000-0000-0000-0000000000b1', 7, '2026-03-10 21:30:00+05:30') -> 'totals' -> 'taken',
  '2'::jsonb,
  'FR-10.1 the 7-day total leaves out doses older than 7 days'
);
select throws_ok(
  $$select public.compliance('00000000-0000-0000-0000-0000000000b1', 0, now())$$,
  'P0001', 'VALIDATION_FAILED', 'FR-10.1 a window of 0 days is refused'
);
select throws_ok(
  $$select public.save_checkup(null, '00000000-0000-0000-0000-0000000000b1', 'CONSULTATION', 'Dr X', null, '2026-03-12 10:30', 24, null)$$,
  'P0001', 'FORBIDDEN', 'FR-9.1 a viewer cannot create a checkup'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select throws_ok(
  $$select public.compliance('00000000-0000-0000-0000-0000000000b1', 7, now())$$,
  'P0001', 'NOT_FOUND', 'FR-10.1 an outsider gets NOT_FOUND'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$select public.save_checkup(null, '00000000-0000-0000-0000-0000000000b1', 'CONSULTATION', '  ', null, '2026-03-12 10:30', 24, null)$$,
  'P0001', 'VALIDATION_FAILED', 'FR-9.1 a doctor name is required'
);
select isnt(
  public.save_checkup(null, '00000000-0000-0000-0000-0000000000b1', 'LAB_TEST', 'Dr Lab', 'Synthetic Lab', '2026-03-12 10:30', 24, null),
  null,
  'FR-9.1 a caregiver creates a checkup'
);
select is(
  (select appointment_time from public.checkup_schedules where doctor_name = 'Dr Lab'),
  '2026-03-12 10:30:00+05:30'::timestamptz,
  'FR-9.1 the time is read in the patient''s timezone'
);
reset role;

select is(public.send_checkup_reminders('2026-03-11 10:00:00+05:30'), 0, 'FR-9.3 no reminder before the lead time');
select is(public.send_checkup_reminders('2026-03-11 10:31:00+05:30'), 1, 'FR-9.3 a reminder once the lead time is reached');
select is(
  (select count(*)::int from public.notifications where kind = 'CHECKUP_SOON'),
  4,
  'FR-9.3 owner, caregiver, viewer, and patient are each notified once'
);
select is(public.send_checkup_reminders('2026-03-11 10:45:00+05:30'), 0, 'FR-9.3 the reminder is not sent twice');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select public.save_checkup(
  (select id from public.checkup_schedules where doctor_name = 'Dr Lab'),
  null, 'LAB_TEST', 'Dr Lab', 'Synthetic Lab', '2026-03-13 10:30', 24, null
);
reset role;
select is(
  (select reminded_at from public.checkup_schedules where doctor_name = 'Dr Lab'),
  null,
  'FR-9.3 changing the time re-arms the reminder'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select isnt(
  public.complete_checkup((select id from public.checkup_schedules where doctor_name = 'Dr Lab'), 'All normal'),
  null,
  'FR-9.2 a caregiver logs a completion'
);
select lives_ok(
  $$select public.complete_checkup((select id from public.checkup_schedules where doctor_name = 'Dr Lab'), 'Updated notes')$$,
  'FR-9.2 logging again updates the same completion'
);
reset role;
select is((select count(*)::int from public.checkup_completions), 1, 'FR-9.2 there is one completion per checkup');
select is(public.send_checkup_reminders('2026-03-12 10:31:00+05:30'), 0, 'FR-9.3 a completed checkup gets no reminder');

select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
select is((select count(*)::int from public.checkup_schedules), 1, 'the patient sees their checkups');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select is((select count(*)::int from public.checkup_schedules), 0, 'an outsider sees no checkups');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$select public.delete_checkup((select id from public.checkup_schedules where doctor_name = 'Dr Lab'))$$,
  'FR-9.1 a caregiver deletes a checkup'
);
reset role;

select is(
  (select count(*)::int from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('medication_reminders', 'notifications')),
  2,
  'FR-10.2 FR-11.3 reminders and notifications are published for realtime'
);

select * from finish();
rollback;
```

**Check:** `npm run db:test` reports 117 + 22 = 139 passed.

### Task 3 — Helpers

Create `src/lib/dashboard/compliance.ts`:

```ts
export type DayCounts = { date: string; taken: number; skipped: number; missed: number; pending: number };
export type Compliance = { days: DayCounts[]; totals: Omit<DayCounts, "date"> };

export function settled(counts: Omit<DayCounts, "date">): number {
  return counts.taken + counts.skipped + counts.missed;
}

export function compliancePercent(counts: Omit<DayCounts, "date">): number | null {
  const total = settled(counts);
  return total === 0 ? null : Math.round((counts.taken / total) * 100);
}
```

Create `src/lib/time/local-input.ts`:

```ts
import { dateInZone, timeInZone } from "./local-date";

export function toLocalInputValue(instant: string, timeZone: string): string {
  return `${dateInZone(instant, timeZone)}T${timeInZone(instant, timeZone)}`;
}
```

Create `src/lib/notifications/render.ts`. Export `renderNotification(kind: string, data: Record<string, unknown>, timeZone: string): { title: string; body: string }`. Build text only from `strings.notifications`. Rules:

| `kind` | Title | Body |
|---|---|---|
| `INVITE_ACCEPTED` | `strings.notifications.inviteAccepted` | `{name} joined as {role label}` |
| `DOCUMENT_PARSED` | `strings.notifications.documentParsed` | `strings.notifications.documentParsedBody` |
| `DOCUMENT_FAILED` | `strings.notifications.documentFailed` | `strings.errors[code]` when `code` is a known error code, otherwise `strings.errors.AI_UNAVAILABLE` |
| `DOSE_MISSED` | `strings.notifications.doseMissed` | `{medicationName} {dosage} at {time in timeZone}` |
| `CHECKUP_SOON` | `strings.notifications.checkupSoon` | `{doctorName}, {date} at {time} in timeZone` |
| anything else | `strings.notifications.generic` | `""` |

Treat every `data` field as untrusted: read it with `typeof value === "string"` checks, and fall back to `strings.notifications.someone` or an empty string when missing.

Also export `notificationLink(kind, data, patientId): string | null`: DOCUMENT_* → `/patients/{patientId}/documents/{documentId}`; DOSE_MISSED → `/patients/{patientId}`; CHECKUP_SOON → `/patients/{patientId}/checkups`; INVITE_ACCEPTED → `/patients/{patientId}/people`. Return `null` when an ID is missing.

Create `src/lib/activity/describe.ts`. Export `describeActivity(row: { action: string; target_table: string; before: unknown; after: unknown }): string`. Use `strings.activity`:

- `medication_reminders` UPDATE: "marked a dose as {status label}" where the status comes from `after.status` (`ACKNOWLEDGED` → taken, `SKIPPED` → not taken, `MISSED` → not marked as taken).
- `medications` INSERT: "added {name}". UPDATE where `after.status` is STOPPED: "stopped {name}".
- `medical_documents` UPDATE where `after.extraction_status` changed: "document status: {status label}" (use `strings.documents.statuses`).
- `caregiver_links` INSERT: "gave access ({role label})"; UPDATE to REVOKED: "removed access".
- `consents` INSERT: "gave consent for documents"; UPDATE with `withdrawn_at`: "withdrew consent".
- Anything else: "{action label} {table label}" from `strings.activity.actions` and `strings.activity.tables`.

### Task 4 — Strings

Add to `src/strings/en.ts`:

```ts
  dashboard: {
    complianceTitle: "Medicines taken",
    today: "Today",
    last7Days: "Last 7 days",
    noDosesYet: "No doses due yet",
    takenOf: "taken of",
    settledHint: "Counts doses that were taken, not taken, or not marked. Doses still waiting are not counted.",
    waiting: "waiting",
    attentionTitle: "Needs attention",
    nothingNeedsAttention: "Nothing needs attention.",
    missedToday: "Not marked as taken today",
    documentsToCheck: "Documents ready to check",
    documentsFailed: "Documents that could not be read",
    todayDosesTitle: "Today's doses",
    nextCheckup: "Next checkup",
    noCheckup: "No checkup planned.",
    live: "Updates live",
  },
  checkups: {
    title: "Checkups",
    upcoming: "Coming up",
    past: "Past",
    empty: "No checkups yet.",
    add: "Add a checkup",
    addTitle: "Add a checkup",
    editTitle: "Edit checkup",
    type: "Type",
    types: { CONSULTATION: "Doctor visit", LAB_TEST: "Lab test", DIAGNOSTIC: "Scan or test", OTHER: "Other" },
    doctorName: "Doctor or lab",
    location: "Where",
    when: "Date and time",
    whenHint: "In the patient's time zone",
    reminderHours: "Remind everyone this many hours before",
    notes: "Notes",
    complete: "Mark as done",
    completeTitle: "How did it go?",
    clinicalNotes: "Notes from the visit",
    completed: "Done",
    completedOn: "Done on",
    delete: "Delete",
    confirmDelete: "Delete this checkup?",
    save: "Save checkup",
  },
  activity: {
    title: "Activity",
    empty: "No activity yet.",
    newer: "Newer",
    older: "Older",
    by: "by",
    someone: "Someone",
    system: "CareCircle",
    actions: { INSERT: "added", UPDATE: "changed", DELETE: "removed" },
    tables: {
      patients: "patient details",
      patient_links: "patient login",
      caregiver_links: "access",
      invites: "invite",
      consents: "consent",
      medical_documents: "document",
      medications: "medicine",
      medication_schedules: "medicine time",
      medication_reminders: "dose",
      checkup_schedules: "checkup",
      checkup_completions: "checkup result",
    },
    markedDose: "marked a dose as",
    doseStatus: { ACKNOWLEDGED: "taken", SKIPPED: "not taken", MISSED: "not marked as taken" },
    addedMedicine: "added",
    stoppedMedicine: "stopped",
    documentStatus: "document status:",
    gaveAccess: "gave access",
    removedAccess: "removed access",
    gaveConsent: "gave consent for documents",
    withdrewConsent: "withdrew consent",
  },
  notifications: {
    title: "Notifications",
    bellLabel: "Notifications",
    unread: "unread",
    empty: "No notifications.",
    markAllRead: "Mark all as read",
    markRead: "Mark as read",
    open: "Open",
    inviteAccepted: "Invite accepted",
    joinedAs: "joined as",
    documentParsed: "Document read",
    documentParsedBody: "A document is ready to check and approve.",
    documentFailed: "Document could not be read",
    doseMissed: "Dose not marked as taken",
    checkupSoon: "Checkup coming up",
    generic: "Update",
    someone: "Someone",
  },
```

Add to `strings.tabs`: `checkups: "Checkups",` and `activity: "Activity",`. Add to `PATIENT_TABS`, after Medicines:

```ts
  { href: (id) => `/patients/${id}/checkups`, label: strings.tabs.checkups, roles: ["OWNER", "CAREGIVER", "VIEWER"] },
  { href: (id) => `/patients/${id}/activity`, label: strings.tabs.activity, roles: ["OWNER", "CAREGIVER"] },
```

### Task 5 — Routes

Create `src/app/api/patients/[patientId]/checkups/route.ts` (POST) and `src/app/api/checkups/[checkupId]/route.ts` (PATCH and DELETE) and `src/app/api/checkups/[checkupId]/complete/route.ts` (POST). Shared body schema for create and edit, in `src/lib/checkups/schema.ts`:

```ts
import { z } from "zod";

export const CHECKUP_TYPES = ["CONSULTATION", "LAB_TEST", "DIAGNOSTIC", "OTHER"] as const;

export const checkupSchema = z.object({
  checkupType: z.enum(CHECKUP_TYPES),
  doctorName: z.string().trim().min(1).max(128),
  clinicLocation: z.string().trim().max(500).optional(),
  localTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  reminderHoursBefore: z.number().int().min(1).max(168),
  notes: z.string().trim().max(2000).optional(),
});

export const completeSchema = z.object({ notes: z.string().trim().max(4000).optional() });
```

| Route | RPC call |
|---|---|
| POST `/api/patients/[patientId]/checkups` | `save_checkup({ p_checkup: null, p_patient: patientId, p_checkup_type, p_doctor_name, p_clinic_location, p_local_time: localTime.replace("T", " "), p_reminder_hours_before, p_notes })` → `jsonOk({ checkupId }, 201)` |
| PATCH `/api/checkups/[checkupId]` | `save_checkup({ p_checkup: checkupId, p_patient: null, ... })` → `jsonOk({ checkupId })` |
| DELETE `/api/checkups/[checkupId]` | `delete_checkup({ p_checkup: checkupId })` → `jsonOk({ ok: true })` |
| POST `/api/checkups/[checkupId]/complete` | `complete_checkup({ p_checkup: checkupId, p_notes: notes ?? "" })` → `jsonOk({ completionId })` |

Validate UUID params with `isUuid`; map errors with `fromDb`. If the generated types reject `null` for `p_checkup` or `p_patient`, check how the type is written in `database.types.ts` and pass the value the types allow for a missing UUID without using `any`; note it.

Create `src/app/api/notifications/read/route.ts`:

```ts
import { z } from "zod";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { fromDb } from "@/lib/db-errors";
import { uuidSchema } from "@/lib/ids";
import { parseInput, readJsonBody } from "@/lib/validation";

const readSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(uuidSchema).min(1).max(100) }),
]);

export const POST = handleRoute(async (request) => {
  const { supabase, user } = await requireApiUser();
  const input = parseInput(readSchema, await readJsonBody(request));
  let query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if ("ids" in input) {
    query = query.in("id", input.ids);
  }
  const { error } = await query;
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ ok: true });
});
```

### Task 6 — Header bell and live refresh

Create `src/components/notifications/notification-bell.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { strings } from "@/strings/en";

export function NotificationBell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    setUnread(initialUnread);
  }, [initialUnread]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => setUnread((count) => count + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <Link href="/notifications" className="relative inline-flex min-h-12 items-center gap-2 px-2 underline">
      <span>{strings.notifications.bellLabel}</span>
      {unread > 0 ? (
        <span className="rounded-full bg-danger px-2 text-base font-bold text-accent-ink" aria-label={`${unread} ${strings.notifications.unread}`}>
          {unread}
        </span>
      ) : null}
    </Link>
  );
}
```

Check `channel(...).on("postgres_changes", ...)` and `removeChannel` against the Supabase Realtime documentation for your `@supabase/supabase-js` version. Note any difference.

Change `src/components/app-header.tsx` into an async server component:

- Create a server Supabase client and get the user. If there is a user, count unread notifications: `supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null)`.
- Render `<NotificationBell userId={user.id} initialUnread={count ?? 0} />` between the account link and the sign-out button when there is a user.
- Keep the `showCaregiverNav` prop.

Create `src/components/dashboard/live-refresh.tsx` (client). Props: `patientId`. It subscribes to `postgres_changes` with `event: "*"`, `table: "medication_reminders"`, `filter: \`patient_id=eq.${patientId}\``. On any event it calls `router.refresh()`, at most once per second (keep a timer; ignore events while a refresh is waiting). It renders a small text `strings.dashboard.live` with a dot. It removes the channel on unmount.

### Task 7 — Dashboard

Create `src/components/dashboard/compliance-card.tsx` (server). Props: `compliance: Compliance`, `timeZone: string`. Specification:

- Title `strings.dashboard.complianceTitle`.
- Two large figures side by side: Today (last entry in `days`) and Last 7 days (`totals`). Each shows `compliancePercent` + "%" and, under it, "{taken} {takenOf} {settled}" and "{pending} {waiting}" when pending > 0. If `compliancePercent` is null, show `strings.dashboard.noDosesYet`.
- Below, seven horizontal bars, one per day, oldest first. Each row: the weekday and date (for example "Mon 9 Mar"), a bar whose filled width is the day's percentage (no fill when null), and the text "{taken} {takenOf} {settled}". The bar uses `bg-ok` on a `bg-panel` track. The text carries the meaning; the bar is decoration (`aria-hidden="true"`).
- `strings.dashboard.settledHint` in muted text at the bottom.

Format weekday and date with `Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })` on `new Date(date + "T00:00:00Z")`. The date string is already the patient's local date; formatting it in UTC keeps it unchanged.

Create `src/components/dashboard/today-doses-card.tsx` (server). Props: `doses: Dose[]`, `timeZone`. Lists every dose today grouped by slot (`groupBySlot`), each with time, name, dosage, and a status label: taken (with time), not taken, not marked as taken, later, or waiting. Uses `strings.patient` labels.

Create `src/components/dashboard/attention-card.tsx` (server). Props: `missed: Dose[]`, `documentsToCheck: Array<{ id, document_type, created_at }>`, `documentsFailed: [...]`, `patientId`, `timeZone`. Shows the three lists with links to the documents; `strings.dashboard.nothingNeedsAttention` when all are empty.

Replace `src/app/patients/[patientId]/page.tsx`. Specification:

- `loadPatientContext`. VIEWER, CAREGIVER, and OWNER see the dashboard.
- Load in parallel with `Promise.all`:
  - `supabase.rpc("compliance", { p_patient: patientId, p_days: 7 })`
  - `supabase.rpc("doses_for_day", { p_patient: patientId })`
  - documents with status PARSED and FAILED: `supabase.from("medical_documents").select("id, document_type, created_at, extraction_status").eq("patient_id", patientId).in("extraction_status", ["PARSED", "FAILED"])`
  - next checkup: `supabase.from("checkup_schedules").select("id, doctor_name, appointment_time, checkup_type, checkup_completions(id)").eq("patient_id", patientId).gt("appointment_time", new Date().toISOString()).order("appointment_time").limit(5)`; take the first one without a completion.
- Render in this order: `<LiveRefresh />`, `<ComplianceCard />`, `<AttentionCard />` (missed = doses with status MISSED), `<TodayDosesCard />`, a "Next checkup" card (or `noCheckup`), then the existing profile details card from P1.

### Task 8 — Checkups pages

Create `src/components/checkups/checkup-form.tsx` (client). Props: `mode`, `patientId`, `checkupId?`, `initial?`, `timeZone`. Fields: type select, doctor or lab (required), location, `type="datetime-local"` date and time (required, hint `whenHint` plus the timezone name), reminder hours (number 1–168, default 24), notes. Submit sends the body in task 5 (`reminderHoursBefore` as a number). Create → POST, edit → PATCH. On success go to `/patients/{id}/checkups` and refresh.

Create `src/components/checkups/checkup-actions.tsx` (client): `DeleteCheckupButton` (confirm, DELETE, refresh) and `CompleteCheckupForm` (a `<details>` that opens a notes text area and a "Mark as done" button, POST complete, refresh).

Create `src/app/patients/[patientId]/checkups/page.tsx` (server). Load all checkups with completions, ordered by time. "Coming up": appointment in the future and not completed. "Past": the rest, newest first, showing "Done on {date}" and notes when completed. Times shown in the patient's timezone. OWNER and CAREGIVER see Add, Edit, Delete, and Mark as done.

Create `src/app/patients/[patientId]/checkups/new/page.tsx` and `src/app/patients/[patientId]/checkups/[checkupId]/edit/page.tsx` (OWNER and CAREGIVER only; edit pre-fills `localTime` with `toLocalInputValue(appointment_time, timeZone)`).

Edit `src/app/me/page.tsx`: under the today view, show the patient's next checkup (not completed, in the future): type label, doctor, date and time in their timezone. Read-only.

### Task 9 — Activity and notification centre

Create `src/app/patients/[patientId]/activity/page.tsx` (server). Specification:

- OWNER and CAREGIVER only (`notFound()` otherwise).
- `searchParams.page` (default 0, integer 0–1000).
- Query: `supabase.from("audit_logs").select("id, action, target_table, before, after, created_at, actor_id").eq("patient_id", patientId).order("created_at", { ascending: false }).range(page * 50, page * 50 + 50)`. Fetch 51 rows; if 51 come back, show the "Older" link and display 50.
- Actor names: collect the distinct `actor_id`s and load `supabase.from("profiles").select("id, full_name").in("id", ids)`. Rows with no actor show `strings.activity.system`; actors whose profile is not visible show `strings.activity.someone`.
- Each row: date and time in the patient's timezone, actor name, `describeActivity(row)`.
- "Newer" link when `page > 0`.

Create `src/app/notifications/page.tsx` (server): `requirePageUser("/notifications")`; load the latest 100 notifications for the user, newest first, with `patients(full_name, timezone)`; render `<AppHeader />` and `<NotificationList items={...} />`.

Create `src/app/notifications/notification-list.tsx` (client). Each item shows the patient name, `renderNotification(...)` title and body, the time, an "Open" link from `notificationLink(...)`, and unread items in bold with a "Mark as read" button. A "Mark all as read" button at the top posts `{ all: true }`. After any change, `router.refresh()`.

### Task 10 — Unit tests

`src/test/compliance.test.ts`:

- FR-10.1 `{ taken: 1, skipped: 1, missed: 1, pending: 5 }` → 33.
- `{ taken: 0, skipped: 0, missed: 0, pending: 3 }` → `null`.
- `{ taken: 2, skipped: 0, missed: 0, pending: 0 }` → 100.
- `{ taken: 2, skipped: 1, missed: 0, pending: 0 }` → 67 (rounding).

`src/test/notification-render.test.ts`:

- FR-11.2 each of the five kinds produces a non-empty title, and the body contains the given name, medicine, or doctor.
- DOSE_MISSED with `scheduledFor: "2026-03-10T02:30:00Z"` and timezone `Asia/Kolkata` contains `08:00`.
- Missing or non-string fields do not throw and fall back to `strings.notifications.someone` or an empty string.
- An unknown kind returns the generic title.
- `notificationLink` returns the right paths and `null` when the needed ID is missing.

`src/test/activity-describe.test.ts`:

- A reminder update to ACKNOWLEDGED → contains "taken".
- A medication insert with name "Metformin" → contains "Metformin".
- A caregiver link update to REVOKED → "removed access".
- An unknown table → uses the generic action and table words.

`src/test/local-input.test.ts`: `toLocalInputValue("2026-03-12T05:00:00Z", "Asia/Kolkata")` → `2026-03-12T10:30`.

**Check:** `npm test` passes.

### Task 11 — Browser tests

Create `e2e/dashboard.spec.ts`. Reuse the set-up from `e2e/patient.spec.ts` (owner, patient user, one due dose). Move shared set-up code into `e2e/helpers/scenario.ts` and use it from both files.

1. `FR-10.2 the dashboard updates when the patient takes a dose`: open the owner's dashboard in one context and the patient's `/me` in another. Patient taps "I took it". Within 5 seconds, without reloading, the owner's dashboard shows "1 taken of 1" for Today.
2. `FR-10.1 no doses due shows the empty state`: a new patient with no medicines shows "No doses due yet".
3. `FR-10.5 a missed dose appears under Needs attention`: set the dose to MISSED with the admin client; reload the owner's dashboard; "Not marked as taken today" lists it.
4. `FR-11.1 FR-11.3 the bell counts a new notification live`: owner's page is open; insert a DOSE_MISSED notification for the owner with the admin client; the bell shows 1 within 5 seconds; open Notifications; press "Mark all as read"; the bell count disappears.
5. `FR-9.1 FR-9.2 checkups`: owner adds a lab test for tomorrow 10:30; it shows under "Coming up" with 10:30; edit it to 11:00; mark it done with notes; it moves to "Past" with "Done on".
6. `FR-9.1 viewer cannot add checkups`: the viewer sees the checkup list without Add, Edit, or Delete.
7. `FR-10.3 activity lists recent changes`: after test 5's actions, the Activity page shows entries for the checkup.
8. `FR-10.4 a parsed document is flagged`: (demo mode) upload and read a document but do not approve; the dashboard lists it under "Documents ready to check".

**Check:** `npm run test:e2e` passes.

---

## Exit checks

| Command | Expected |
|---|---|
| `npm run db:reset` | no error |
| `npm run db:test` | 139 passed |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | all pass |
| `npm run build` | succeeds |
| `npm run test:e2e` | all pass |
| By hand: laptop shows the owner's dashboard, phone (LAN, as in P4 task 11) shows the patient's `/me`; tap "I took it" on the phone; the laptop updates within 5 seconds | works |

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

- Exporting data, deleting patients and documents (P6).
- Rate limits and security headers (P6).
- Printable weekly report (stretch).
