create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name varchar(128) not null check (length(trim(full_name)) > 0),
  email text not null,
  phone varchar(32),
  created_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name varchar(128) not null check (length(trim(full_name)) > 0),
  date_of_birth date not null check (date_of_birth >= date '1900-01-01'),
  blood_group varchar(3) check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  primary_condition text check (length(primary_condition) <= 2000),
  notes text check (length(notes) <= 4000),
  emergency_contact_name varchar(128),
  emergency_contact_phone varchar(32),
  physician_name varchar(128),
  physician_phone varchar(32),
  timezone text not null default 'Asia/Kolkata',
  missed_after_minutes integer not null default 120 check (missed_after_minutes between 30 and 480),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index patients_created_by on public.patients (created_by);

create table public.patient_links (
  patient_id uuid primary key references public.patients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index patient_links_user on public.patient_links (user_id);

create table public.caregiver_links (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('OWNER', 'CAREGIVER', 'VIEWER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (patient_id, user_id),
  check ((status = 'REVOKED') = (revoked_at is not null))
);

create unique index caregiver_links_one_owner on public.caregiver_links (patient_id) where role = 'OWNER' and status = 'ACTIVE';
create index caregiver_links_user on public.caregiver_links (user_id) where status = 'ACTIVE';

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('CAREGIVER', 'VIEWER', 'PATIENT')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id),
  revoked_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index invites_patient on public.invites (patient_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete cascade,
  kind text not null check (kind in ('INVITE_ACCEPTED', 'DOCUMENT_PARSED', 'DOCUMENT_FAILED', 'DOSE_MISSED', 'CHECKUP_SOON')),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created on public.notifications (user_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  patient_id uuid references public.patients (id) on delete cascade,
  action text not null,
  target_table text not null,
  target_id uuid,
  before jsonb,
  after jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

create index audit_logs_patient_created on public.audit_logs (patient_id, created_at desc);

create or replace function public.request_ip()
returns inet
language plpgsql
stable
set search_path = ''
as $$
declare
  request_headers json;
  candidate text;
begin
  request_headers := nullif(current_setting('request.headers', true), '')::json;
  candidate := coalesce(request_headers ->> 'x-client-ip', split_part(request_headers ->> 'x-forwarded-for', ',', 1));
  candidate := nullif(trim(candidate), '');
  if candidate is null then
    return null;
  end if;
  return candidate::inet;
exception
  when others then
    return null;
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_before jsonb;
  row_after jsonb;
  patient uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    row_before := to_jsonb(old) - 'token_hash' - 'extraction_raw';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    row_after := to_jsonb(new) - 'token_hash' - 'extraction_raw';
  end if;
  if tg_table_name = 'patients' then
    patient := coalesce(row_after ->> 'id', row_before ->> 'id')::uuid;
  else
    patient := coalesce(row_after ->> 'patient_id', row_before ->> 'patient_id')::uuid;
  end if;
  if patient is not null and not exists (select 1 from public.patients where id = patient) then
    return coalesce(new, old);
  end if;
  insert into public.audit_logs (actor_id, patient_id, action, target_table, target_id, before, after, ip)
  values (
    auth.uid(),
    patient,
    tg_op,
    tg_table_name,
    coalesce(row_after ->> 'id', row_before ->> 'id')::uuid,
    row_before,
    row_after,
    public.request_ip()
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)), 128),
    lower(new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.patients_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'VALIDATION_FAILED';
  end if;
  if new.date_of_birth > current_date then
    raise exception 'VALIDATION_FAILED';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger patients_before_write
before insert or update on public.patients
for each row execute function public.patients_before_write();

create or replace function public.my_role(p_patient uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select cl.role
      from public.caregiver_links cl
      join public.patients p on p.id = cl.patient_id
      where cl.patient_id = p_patient
        and cl.user_id = auth.uid()
        and cl.status = 'ACTIVE'
        and p.deleted_at is null
    ),
    (
      select 'PATIENT'
      from public.patient_links pl
      join public.patients p on p.id = pl.patient_id
      where pl.patient_id = p_patient
        and pl.user_id = auth.uid()
        and p.deleted_at is null
    )
  );
$$;

create or replace function public.has_role(p_patient uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.my_role(p_patient) = any (p_roles), false);
$$;

create or replace function public.shares_patient(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select patient_id from public.caregiver_links where user_id = auth.uid() and status = 'ACTIVE'
    union
    select patient_id from public.patient_links where user_id = auth.uid()
  ),
  theirs as (
    select patient_id from public.caregiver_links where user_id = p_user
    union
    select patient_id from public.patient_links where user_id = p_user
  )
  select exists (select 1 from mine join theirs using (patient_id));
$$;

create or replace function public.notify_members(
  p_patient uuid,
  p_kind text,
  p_data jsonb,
  p_roles text[],
  p_exclude uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.notifications (user_id, patient_id, kind, data)
  select cl.user_id, p_patient, p_kind, coalesce(p_data, '{}'::jsonb)
  from public.caregiver_links cl
  where cl.patient_id = p_patient
    and cl.status = 'ACTIVE'
    and cl.role = any (p_roles)
    and cl.user_id is distinct from p_exclude;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

create or replace function public.create_patient(
  p_full_name text,
  p_date_of_birth date,
  p_timezone text,
  p_missed_after_minutes integer,
  p_blood_group text default null,
  p_primary_condition text default null,
  p_notes text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_physician_name text default null,
  p_physician_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_full_name is null or length(trim(p_full_name)) = 0 or p_date_of_birth is null then
    raise exception 'VALIDATION_FAILED';
  end if;
  insert into public.patients (
    full_name, date_of_birth, timezone, missed_after_minutes, blood_group, primary_condition, notes,
    emergency_contact_name, emergency_contact_phone, physician_name, physician_phone, created_by
  )
  values (
    trim(p_full_name), p_date_of_birth, coalesce(p_timezone, 'Asia/Kolkata'), coalesce(p_missed_after_minutes, 120),
    p_blood_group, p_primary_condition, p_notes, p_emergency_contact_name, p_emergency_contact_phone,
    p_physician_name, p_physician_phone, auth.uid()
  )
  returning id into new_id;
  insert into public.caregiver_links (patient_id, user_id, role) values (new_id, auth.uid(), 'OWNER');
  return new_id;
end;
$$;

create or replace function public.update_my_profile(p_full_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'VALIDATION_FAILED';
  end if;
  update public.profiles
  set full_name = left(trim(p_full_name), 128), phone = nullif(trim(p_phone), '')
  where id = auth.uid();
end;
$$;

create or replace function public.create_invite(p_patient uuid, p_email text, p_role text, p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(trim(p_email));
  new_id uuid;
begin
  if public.my_role(p_patient) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(p_patient, array['OWNER']) then
    raise exception 'FORBIDDEN';
  end if;
  if p_role is null or p_role not in ('CAREGIVER', 'VIEWER', 'PATIENT')
    or clean_email is null or clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'VALIDATION_FAILED';
  end if;
  if p_role = 'PATIENT' and exists (select 1 from public.patient_links where patient_id = p_patient) then
    raise exception 'CONFLICT';
  end if;
  insert into public.invites (patient_id, email, role, token_hash, expires_at, created_by)
  values (p_patient, clean_email, p_role, p_token_hash, now() + interval '72 hours', auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.revoke_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invites%rowtype;
begin
  select * into invite from public.invites where id = p_invite for update;
  if not found or public.my_role(invite.patient_id) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(invite.patient_id, array['OWNER']) then
    raise exception 'FORBIDDEN';
  end if;
  if invite.used_at is not null then
    raise exception 'CONFLICT';
  end if;
  update public.invites set revoked_at = coalesce(revoked_at, now()) where id = invite.id;
end;
$$;

create or replace function public.accept_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invites%rowtype;
  caller_email text;
  existing_role text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  select * into invite from public.invites where token_hash = p_token_hash for update;
  if not found or invite.revoked_at is not null then
    raise exception 'NOT_FOUND';
  end if;
  if exists (select 1 from public.patients where id = invite.patient_id and deleted_at is not null) then
    raise exception 'NOT_FOUND';
  end if;
  if invite.used_at is not null then
    if invite.used_by = auth.uid() then
      return jsonb_build_object('patient_id', invite.patient_id, 'role', invite.role);
    end if;
    raise exception 'ALREADY_USED';
  end if;
  if invite.expires_at <= now() then
    raise exception 'EXPIRED';
  end if;
  select lower(email) into caller_email from auth.users where id = auth.uid();
  if caller_email is distinct from invite.email then
    raise exception 'FORBIDDEN';
  end if;
  select role into existing_role
  from public.caregiver_links
  where patient_id = invite.patient_id and user_id = auth.uid() and status = 'ACTIVE';
  if invite.role = 'PATIENT' then
    if existing_role is not null then
      raise exception 'CONFLICT';
    end if;
    if exists (select 1 from public.patient_links where patient_id = invite.patient_id) then
      raise exception 'CONFLICT';
    end if;
    insert into public.patient_links (patient_id, user_id) values (invite.patient_id, auth.uid());
  else
    if existing_role = 'OWNER' then
      raise exception 'CONFLICT';
    end if;
    if exists (select 1 from public.patient_links where patient_id = invite.patient_id and user_id = auth.uid()) then
      raise exception 'CONFLICT';
    end if;
    insert into public.caregiver_links (patient_id, user_id, role)
    values (invite.patient_id, auth.uid(), invite.role)
    on conflict (patient_id, user_id) do update
      set role = excluded.role, status = 'ACTIVE', revoked_at = null;
  end if;
  update public.invites set used_at = now(), used_by = auth.uid() where id = invite.id;
  perform public.notify_members(
    invite.patient_id,
    'INVITE_ACCEPTED',
    jsonb_build_object('role', invite.role, 'name', (select full_name from public.profiles where id = auth.uid())),
    array['OWNER'],
    auth.uid()
  );
  return jsonb_build_object('patient_id', invite.patient_id, 'role', invite.role);
end;
$$;

create or replace function public.revoke_caregiver(p_patient uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.caregiver_links%rowtype;
begin
  if public.my_role(p_patient) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(p_patient, array['OWNER']) then
    raise exception 'FORBIDDEN';
  end if;
  select * into target from public.caregiver_links where patient_id = p_patient and user_id = p_user for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if target.role = 'OWNER' then
    raise exception 'FORBIDDEN';
  end if;
  if target.status = 'REVOKED' then
    return;
  end if;
  update public.caregiver_links set status = 'REVOKED', revoked_at = now() where id = target.id;
end;
$$;

create or replace function public.remove_patient_login(p_patient uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.my_role(p_patient) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(p_patient, array['OWNER']) then
    raise exception 'FORBIDDEN';
  end if;
  delete from public.patient_links where patient_id = p_patient;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
end;
$$;

create trigger audit_patients after insert or update or delete on public.patients
for each row execute function public.audit_row_change();
create trigger audit_patient_links after insert or update or delete on public.patient_links
for each row execute function public.audit_row_change();
create trigger audit_caregiver_links after insert or update or delete on public.caregiver_links
for each row execute function public.audit_row_change();
create trigger audit_invites after insert or update or delete on public.invites
for each row execute function public.audit_row_change();

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.patient_links enable row level security;
alter table public.caregiver_links enable row level security;
alter table public.invites enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.profiles, public.patients, public.patient_links, public.caregiver_links,
  public.invites, public.notifications, public.audit_logs from anon, authenticated;

grant select on table public.profiles, public.patients, public.patient_links, public.caregiver_links,
  public.invites, public.notifications, public.audit_logs to authenticated;

grant update (
  full_name, date_of_birth, blood_group, primary_condition, notes, emergency_contact_name,
  emergency_contact_phone, physician_name, physician_phone, timezone, missed_after_minutes
) on table public.patients to authenticated;

grant update (read_at) on table public.notifications to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_patient(id));

create policy patients_select on public.patients for select to authenticated
  using (public.my_role(id) is not null);

create policy patients_update on public.patients for update to authenticated
  using (public.has_role(id, array['OWNER', 'CAREGIVER']))
  with check (public.has_role(id, array['OWNER', 'CAREGIVER']));

create policy patient_links_select on public.patient_links for select to authenticated
  using (public.my_role(patient_id) is not null);

create policy caregiver_links_select on public.caregiver_links for select to authenticated
  using (public.my_role(patient_id) is not null);

create policy invites_select on public.invites for select to authenticated
  using (public.has_role(patient_id, array['OWNER']));

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_role(patient_id, array['OWNER', 'CAREGIVER']));

revoke all on function public.request_ip() from public, anon, authenticated;
revoke all on function public.audit_row_change() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.patients_before_write() from public, anon, authenticated;
revoke all on function public.notify_members(uuid, text, jsonb, text[], uuid) from public, anon, authenticated;

revoke all on function public.my_role(uuid) from public, anon;
revoke all on function public.has_role(uuid, text[]) from public, anon;
revoke all on function public.shares_patient(uuid) from public, anon;
revoke all on function public.create_patient(text, date, text, integer, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.update_my_profile(text, text) from public, anon;
revoke all on function public.create_invite(uuid, text, text, text) from public, anon;
revoke all on function public.revoke_invite(uuid) from public, anon;
revoke all on function public.accept_invite(text) from public, anon;
revoke all on function public.revoke_caregiver(uuid, uuid) from public, anon;
revoke all on function public.remove_patient_login(uuid) from public, anon;

grant execute on function public.my_role(uuid) to authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;
grant execute on function public.shares_patient(uuid) to authenticated;
grant execute on function public.create_patient(text, date, text, integer, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.create_invite(uuid, text, text, text) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.revoke_caregiver(uuid, uuid) to authenticated;
grant execute on function public.remove_patient_login(uuid) to authenticated;
