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