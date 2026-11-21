# Phase 1 — Accounts and access

## Goal

People can sign up, sign in (password, magic link, or 6-digit code), create patients, invite caregivers, viewers, and the patient, and remove access. Every rule is enforced in the database. The audit log and the notifications table exist and are used from now on.

## Requirements covered

FR-1.1 to FR-1.5, FR-2.1, FR-2.2, FR-3.1 to FR-3.6, FR-11.2 (INVITE_ACCEPTED). PRD sections 3, 5.3 (for the tables created here).

## Before you start

- Phase 0 exit checks all pass.
- `npx supabase start` is running.
- Read PRD sections 3 and 5.

## Files this phase creates or changes

| Path | Purpose |
|---|---|
| `supabase/config.toml` | auth settings, email templates |
| `supabase/templates/confirmation.html`, `supabase/templates/magic_link.html` | emails with link and code |
| `supabase/migrations/20250101000100_accounts_access.sql` | tables, functions, policies |
| `supabase/tests/01_access.test.sql` | database tests |
| `package.json` | `db:types` script |
| `src/lib/supabase/database.types.ts` | generated types |
| `src/lib/supabase/server.ts`, `browser.ts` | add the `Database` type |
| `src/lib/ids.ts` | UUID check |
| `src/lib/validation.ts` | `parseInput`, `readJsonBody` |
| `src/lib/db-errors.ts` | `appError`, `fromDb` |
| `src/lib/auth/session.ts` | page and API user helpers |
| `src/lib/auth/next-path.ts` | safe redirect target |
| `src/lib/auth/invite-token.ts` | invite token creation and hashing |
| `src/lib/patients/schema.ts` | patient input validation |
| `src/lib/patients/context.ts` | load a patient and the caller's role for a page |
| `src/lib/patients/tabs.ts` | patient page tabs per role |
| `src/lib/client/call-api.ts` | client-side fetch helper |
| `src/strings/en.ts` | new keys |
| `src/components/ui/*.tsx` | button, field, select, notice, card |
| `src/components/app-header.tsx` | header with navigation and sign-out |
| `src/components/error-message.tsx` | shows an API error |
| `src/app/sign-up/page.tsx` | caregiver sign-up |
| `src/app/sign-in/page.tsx`, `src/app/sign-in/sign-in-form.tsx` | sign-in |
| `src/app/auth/callback/route.ts` | finishes link sign-in |
| `src/app/auth/sign-out/route.ts` | sign-out |
| `src/app/start/page.tsx` | sends people to the right home |
| `src/app/account/page.tsx`, `account-form.tsx` | name and phone |
| `src/app/patients/page.tsx` | patient list |
| `src/app/patients/new/page.tsx`, `src/components/patient-form.tsx` | create and edit form |
| `src/app/patients/[patientId]/layout.tsx` | access check and tabs |
| `src/app/patients/[patientId]/page.tsx` | overview |
| `src/app/patients/[patientId]/edit/page.tsx` | edit |
| `src/app/patients/[patientId]/people/page.tsx`, `invite-panel.tsx`, `people-actions.tsx` | people and invites |
| `src/app/invite/page.tsx`, `invite-accept.tsx` | invite acceptance |
| `src/app/api/patients/route.ts` | POST create |
| `src/app/api/patients/[patientId]/route.ts` | PATCH edit |
| `src/app/api/patients/[patientId]/invites/route.ts` | POST invite |
| `src/app/api/patients/[patientId]/invites/[inviteId]/route.ts` | DELETE invite |
| `src/app/api/patients/[patientId]/caregivers/[userId]/route.ts` | DELETE caregiver |
| `src/app/api/patients/[patientId]/patient-login/route.ts` | DELETE patient login |
| `src/app/api/invites/accept/route.ts` | POST accept |
| `src/app/api/account/route.ts` | PATCH profile |
| `src/test/*.test.ts` | unit tests |
| `playwright.config.ts` | load `.env.local` |
| `e2e/helpers/users.ts` | test users |
| `e2e/accounts.spec.ts` | browser tests |

---

## Tasks

### Task 1 — Auth settings and email templates

In `supabase/config.toml`:

1. In `[auth]`, set `additional_redirect_urls = ["http://localhost:3000/**"]`.
2. In `[auth]`, make sure `enable_signup = true`.
3. In `[auth.email]`, set `enable_signup = true`, `enable_confirmations = true`, `otp_length = 6`, `otp_expiry = 3600`.
4. Add these sections (if a section already exists, set the keys inside it):

```toml
[auth.email.template.confirmation]
subject = "Confirm your CareCircle account"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.magic_link]
subject = "Your CareCircle sign-in code"
content_path = "./supabase/templates/magic_link.html"
```

Create `supabase/templates/confirmation.html`:

```html
<h2>Welcome to CareCircle</h2>
<p>Confirm your email to finish creating your account.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm my email</a></p>
<p>Or enter this code on the sign-in page: <strong style="font-size:24px;letter-spacing:4px">{{ .Token }}</strong></p>
<p>This code expires in 1 hour. If you did not ask for this, ignore this email.</p>
```

Create `supabase/templates/magic_link.html`:

```html
<h2>Sign in to CareCircle</h2>
<p>Your sign-in code is:</p>
<p><strong style="font-size:32px;letter-spacing:6px">{{ .Token }}</strong></p>
<p>Type this code on the sign-in page. Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a> on the same phone or computer where you asked for it.</p>
<p>This code expires in 1 hour. If you did not ask for this, ignore this email.</p>
```

Restart: `npx supabase stop` then `npx supabase start`.

Check the template variable names (`{{ .Token }}`, `{{ .ConfirmationURL }}`) against the Supabase "Email Templates" documentation. Note any difference.

**Check:** `npx supabase status` shows services running.

### Task 2 — Migration

Create `supabase/migrations/20250101000100_accounts_access.sql` with exactly this content:

```sql
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
```

About `audit_row_change`: when the 30-day purge (P6) permanently deletes a patient, every row that belonged to that patient is deleted with it. The trigger then finds no patient row and writes nothing. This is deliberate. Writing an audit row would either break the foreign key or keep a copy of deleted health data.

Apply it:

```
npx supabase db reset
```

**Check:** the command ends with no error. If a statement fails, the output names the line. Fix only a genuine typing mistake against this plan; if the plan itself is wrong, write it under "Blocked".

### Task 3 — Generated database types

Add to `package.json` scripts:

```json
"db:types": "supabase gen types typescript --local > src/lib/supabase/database.types.ts"
```

Run `npm run db:types`. The file `src/lib/supabase/database.types.ts` appears. Run this command again after every later migration.

Add `src/lib/supabase/database.types.ts` to the ignore list in `eslint.config.mjs` (it is generated).

In `src/lib/supabase/server.ts` and `src/lib/supabase/browser.ts`, import the type and pass it to the client:

```ts
import type { Database } from "./database.types";
```

and change `createServerClient(` to `createServerClient<Database>(`, and `createBrowserClient(` to `createBrowserClient<Database>(`.

**Check:** `npm run typecheck` exits 0.

### Task 4 — Database tests

Create `supabase/tests/01_access.test.sql`. The first block of helper functions is copied at the top of every later test file too.

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

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
select pg_temp.make_user('00000000-0000-0000-0000-0000000000a6', 'newcomer@test.local');

select is((select count(*)::int from public.profiles), 6, 'FR-1.1 a profile is created for every new auth user');

insert into public.patients (id, full_name, date_of_birth, created_by)
values ('00000000-0000-0000-0000-0000000000b1', 'Ramesh Test', '1957-03-04', '00000000-0000-0000-0000-0000000000a1'),
       ('00000000-0000-0000-0000-0000000000b2', 'Other Test', '1950-01-01', '00000000-0000-0000-0000-0000000000a5');
insert into public.caregiver_links (patient_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'OWNER'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'CAREGIVER'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'VIEWER'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a5', 'OWNER');
insert into public.patient_links (patient_id, user_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a4');

select throws_ok(
  $$select public.create_patient('Nobody', '1950-01-01', 'Asia/Kolkata', 120)$$,
  'P0001', 'UNAUTHENTICATED', 'FR-2.1 create_patient needs a signed-in user'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');

select isnt(
  public.create_patient('New Person', '1960-05-05', 'Asia/Kolkata', 120),
  null,
  'FR-2.1 owner creates a patient'
);
select is(
  (select count(*)::int from public.caregiver_links cl join public.patients p on p.id = cl.patient_id
   where p.full_name = 'New Person' and cl.role = 'OWNER' and cl.user_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'FR-2.1 creator becomes OWNER in the same call'
);
select throws_ok(
  $$select public.create_patient('Future', (current_date + 1), 'Asia/Kolkata', 120)$$,
  'P0001', 'VALIDATION_FAILED', 'FR-2.1 a future date of birth is refused'
);
select throws_ok(
  $$select public.create_patient('Bad Zone', '1950-01-01', 'Mars/Olympus', 120)$$,
  'P0001', 'VALIDATION_FAILED', 'FR-2.1 an unknown timezone is refused'
);
select is(
  (select count(*)::int from public.patients where id = '00000000-0000-0000-0000-0000000000b2'),
  0,
  'owner cannot see another family''s patient'
);

reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select is(
  (select count(*)::int from public.patients where id = '00000000-0000-0000-0000-0000000000b1'),
  0,
  'outsider cannot see the patient'
);
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'outsider cannot see the owner''s profile'
);
select throws_ok(
  $$select public.revoke_caregiver('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2')$$,
  'P0001', 'NOT_FOUND', 'FR-3.3 outsider gets NOT_FOUND, not FORBIDDEN'
);

reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
update public.patients set notes = 'viewer edit' where id = '00000000-0000-0000-0000-0000000000b1';
reset role;
select is(
  (select notes from public.patients where id = '00000000-0000-0000-0000-0000000000b1'),
  null,
  'FR-2.2 viewer update has no effect'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
update public.patients set notes = 'caregiver edit' where id = '00000000-0000-0000-0000-0000000000b1';
select throws_ok(
  $$update public.patients set created_by = '00000000-0000-0000-0000-0000000000a2' where id = '00000000-0000-0000-0000-0000000000b1'$$,
  '42501', null, 'FR-2.2 caregiver cannot change created_by'
);
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'caregiver can see the owner''s profile'
);
select throws_ok(
  $$select public.create_invite('00000000-0000-0000-0000-0000000000b1', 'x@test.local', 'VIEWER', repeat('a', 64))$$,
  'P0001', 'FORBIDDEN', 'FR-3.1 caregiver cannot invite'
);
select is((select count(*)::int from public.invites), 0, 'FR-3.6 caregiver cannot see invites');
reset role;
select is(
  (select notes from public.patients where id = '00000000-0000-0000-0000-0000000000b1'),
  'caregiver edit',
  'FR-2.2 caregiver update is saved'
);
select is(
  (select count(*)::int from public.audit_logs
   where target_table = 'patients' and action = 'UPDATE' and actor_id = '00000000-0000-0000-0000-0000000000a2'),
  1,
  'caregiver edit is audited with the caregiver as actor'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select isnt(
  public.create_invite('00000000-0000-0000-0000-0000000000b1', ' Newcomer@Test.local ', 'CAREGIVER', repeat('b', 64)),
  null,
  'FR-3.1 owner creates an invite'
);
select is((select email from public.invites where token_hash = repeat('b', 64)), 'newcomer@test.local', 'FR-3.1 invite email is trimmed and lowercased');
select throws_ok(
  $$select public.create_invite('00000000-0000-0000-0000-0000000000b1', 'someone@test.local', 'PATIENT', repeat('c', 64))$$,
  'P0001', 'CONFLICT', 'FR-3.5 a second PATIENT login is refused'
);
select throws_ok(
  $$select public.create_invite('00000000-0000-0000-0000-0000000000b1', 'not-an-email', 'VIEWER', repeat('d', 64))$$,
  'P0001', 'VALIDATION_FAILED', 'FR-3.1 a malformed email is refused'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select throws_ok(
  $$select public.accept_invite(repeat('b', 64))$$,
  'P0001', 'FORBIDDEN', 'FR-3.2 someone with a different email cannot accept'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a6');
select is(
  public.accept_invite(repeat('b', 64)) ->> 'role',
  'CAREGIVER',
  'FR-3.2 the invited email accepts'
);
select is(
  public.accept_invite(repeat('b', 64)) ->> 'patient_id',
  '00000000-0000-0000-0000-0000000000b1',
  'FR-3.2 accepting twice as the same person is a no-op'
);
select is(
  (select count(*)::int from public.patients where id = '00000000-0000-0000-0000-0000000000b1'),
  1,
  'FR-3.2 new caregiver now sees the patient'
);
reset role;

select is(
  (select count(*)::int from public.notifications
   where user_id = '00000000-0000-0000-0000-0000000000a1' and kind = 'INVITE_ACCEPTED'),
  1,
  'FR-11.2 owner is notified once that the invite was accepted'
);

insert into public.invites (patient_id, email, role, token_hash, expires_at, created_by)
values ('00000000-0000-0000-0000-0000000000b1', 'outsider@test.local', 'VIEWER', repeat('e', 64), now() - interval '1 minute', '00000000-0000-0000-0000-0000000000a1'),
       ('00000000-0000-0000-0000-0000000000b1', 'outsider@test.local', 'VIEWER', repeat('f', 64), now() + interval '1 day', '00000000-0000-0000-0000-0000000000a1');
update public.invites set revoked_at = now() where token_hash = repeat('f', 64);

select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select throws_ok($$select public.accept_invite(repeat('e', 64))$$, 'P0001', 'EXPIRED', 'FR-3.2 an expired invite is refused');
select throws_ok($$select public.accept_invite(repeat('f', 64))$$, 'P0001', 'NOT_FOUND', 'FR-3.6 a revoked invite is refused');
select throws_ok($$select public.accept_invite(repeat('b', 64))$$, 'P0001', 'ALREADY_USED', 'FR-3.2 a used invite is refused for others');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$select public.revoke_caregiver('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1')$$,
  'P0001', 'FORBIDDEN', 'FR-3.4 the OWNER cannot be revoked'
);
select lives_ok(
  $$select public.revoke_caregiver('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2')$$,
  'FR-3.3 owner revokes a caregiver'
);
select lives_ok(
  $$select public.remove_patient_login('00000000-0000-0000-0000-0000000000b1')$$,
  'FR-3.5 owner removes the patient login'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.patients where id = '00000000-0000-0000-0000-0000000000b1'),
  0,
  'FR-3.3 revoked caregiver no longer sees the patient'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
select is(
  (select count(*)::int from public.patients where id = '00000000-0000-0000-0000-0000000000b1'),
  0,
  'FR-3.5 removed patient login no longer sees the patient'
);
reset role;

select pg_temp.logout();
set local role anon;
select throws_ok($$select * from public.patients$$, '42501', null, 'anonymous visitors have no table access');
reset role;

select * from finish();
rollback;
```

Run:

```
npm run db:test
```

**Check:** the output reports all 35 tests passed.

If assertions fail with "permission denied" on a pgTAP internal table while the role is `authenticated`, read the Supabase "Testing your database" documentation for the current recommended way to switch users in pgTAP tests, apply it, and note it. Do not weaken any policy.

### Task 5 — Shared server helpers

Create `src/lib/ids.ts`:

```ts
import { z } from "zod";

export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}
```

Create `src/lib/db-errors.ts`:

```ts
import { AppError, isErrorCode, type ErrorCode } from "./errors";
import { strings } from "@/strings/en";

export function appError(code: ErrorCode): AppError {
  return new AppError(code, strings.errors[code]);
}

type DbError = { code?: string | null; message?: string | null };

export function fromDb(error: DbError): Error {
  const message = error.message ?? "";
  if (isErrorCode(message)) {
    return appError(message);
  }
  const code = error.code ?? "";
  if (code === "42501") {
    return appError("FORBIDDEN");
  }
  if (code === "23505") {
    return appError("CONFLICT");
  }
  if (code === "PGRST116") {
    return appError("NOT_FOUND");
  }
  if (code.startsWith("22") || code.startsWith("23")) {
    return appError("VALIDATION_FAILED");
  }
  return new Error("database");
}
```

A plain `Error` becomes a logged `INTERNAL` response in `handleRoute`; the database message is never sent to the browser or the log.

Create `src/lib/validation.ts`:

```ts
import type { z } from "zod";
import { appError } from "./db-errors";

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw appError("VALIDATION_FAILED");
  }
  return result.data;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw appError("VALIDATION_FAILED");
  }
}
```

Create `src/lib/auth/session.ts`:

```ts
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appError } from "@/lib/db-errors";

export async function requirePageUser(returnTo: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  }
  return { supabase, user: data.user };
}

export async function requireApiUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    throw appError("UNAUTHENTICATED");
  }
  return { supabase, user: data.user };
}
```

Create `src/lib/auth/next-path.ts`:

```ts
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/start";
  }
  return value;
}
```

Create `src/lib/auth/invite-token.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}
```

Create `src/lib/patients/schema.ts`:

```ts
import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const patientFieldsSchema = z.object({
  fullName: z.string().trim().min(1).max(128),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().trim().min(1).max(64),
  missedAfterMinutes: z.number().int().min(30).max(480),
  bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
  primaryCondition: optionalText(2000),
  notes: optionalText(4000),
  emergencyContactName: optionalText(128),
  emergencyContactPhone: optionalText(32),
  physicianName: optionalText(128),
  physicianPhone: optionalText(32),
});

export const patientPatchSchema = patientFieldsSchema.partial();

export type PatientFields = z.infer<typeof patientFieldsSchema>;
export type PatientPatch = z.infer<typeof patientPatchSchema>;

const COLUMN_BY_FIELD = {
  fullName: "full_name",
  dateOfBirth: "date_of_birth",
  timezone: "timezone",
  missedAfterMinutes: "missed_after_minutes",
  bloodGroup: "blood_group",
  primaryCondition: "primary_condition",
  notes: "notes",
  emergencyContactName: "emergency_contact_name",
  emergencyContactPhone: "emergency_contact_phone",
  physicianName: "physician_name",
  physicianPhone: "physician_phone",
} as const;

export function toPatientColumns(patch: PatientPatch): Record<string, string | number | null> {
  const columns: Record<string, string | number | null> = {};
  for (const [field, column] of Object.entries(COLUMN_BY_FIELD)) {
    const value = patch[field as keyof PatientPatch];
    if (value !== undefined) {
      columns[column] = value;
    }
  }
  return columns;
}
```

Create `src/lib/patients/context.ts`:

```ts
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/ids";
import { requirePageUser } from "@/lib/auth/session";

export type PatientRole = "OWNER" | "CAREGIVER" | "VIEWER" | "PATIENT";

export async function loadPatientContext(patientId: string, returnTo: string) {
  if (!isUuid(patientId)) {
    notFound();
  }
  const { supabase, user } = await requirePageUser(returnTo);
  const { data: patient } = await supabase.from("patients").select("*").eq("id", patientId).maybeSingle();
  const { data: role } = await supabase.rpc("my_role", { p_patient: patientId });
  if (!patient || !role) {
    notFound();
  }
  return { supabase, user, patient, role: role as PatientRole };
}
```

Create `src/lib/patients/tabs.ts`:

```ts
import type { PatientRole } from "./context";
import { strings } from "@/strings/en";

type Tab = { href: (patientId: string) => string; label: string; roles: PatientRole[] };

export const PATIENT_TABS: Tab[] = [
  { href: (id) => `/patients/${id}`, label: strings.tabs.overview, roles: ["OWNER", "CAREGIVER", "VIEWER"] },
  { href: (id) => `/patients/${id}/people`, label: strings.tabs.people, roles: ["OWNER", "CAREGIVER", "VIEWER"] },
];

export function tabsFor(role: PatientRole) {
  return PATIENT_TABS.filter((tab) => tab.roles.includes(role));
}
```

Later phases add tabs to `PATIENT_TABS`: Documents (P2), Medicines (P3), Checkups and Activity (P5).

**Check:** `npm run typecheck` exits 0 (after task 6 adds the strings).

### Task 6 — Strings

Add these keys to the `strings` object in `src/strings/en.ts` (keep the existing keys):

```ts
  offline: "You are offline. Check your connection and try again.",
  common: {
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    back: "Back",
    edit: "Edit",
    remove: "Remove",
    copy: "Copy link",
    copied: "Copied",
    share: "Share",
    confirm: "Yes, continue",
    required: "Required",
    optional: "Optional",
    reference: "Reference",
  },
  roles: {
    OWNER: "Owner",
    CAREGIVER: "Caregiver",
    VIEWER: "Viewer",
    PATIENT: "Patient",
  },
  nav: {
    patients: "People I care for",
    account: "My account",
    signOut: "Sign out",
  },
  tabs: {
    overview: "Overview",
    people: "People",
  },
  auth: {
    signUpTitle: "Create your account",
    signUpIntro: "For family members who manage someone's care.",
    fullName: "Your full name",
    email: "Email",
    password: "Password",
    passwordHint: "At least 8 characters.",
    createAccount: "Create account",
    checkEmail: "Check your email and tap the confirmation link. Then sign in.",
    haveAccount: "Already have an account? Sign in",
    signInTitle: "Sign in",
    codeTab: "Email me a code",
    passwordTab: "Use a password",
    sendCode: "Send code",
    sending: "Sending…",
    codeSent: "We sent a 6-digit code to",
    code: "6-digit code",
    verify: "Sign in",
    useDifferentEmail: "Use a different email",
    signIn: "Sign in",
    noAccount: "New here? Create an account",
    linkFailed: "That sign-in link did not work. Links only work on the device that asked for them. Enter the code from the email instead.",
    wrongCode: "That code is not right or has expired. Try again or ask for a new code.",
    wrongPassword: "Email or password is not right.",
    unconfirmed: "Confirm your email first. Check your inbox.",
  },
  account: {
    title: "My account",
    phone: "Phone",
    saved: "Saved.",
  },
  patients: {
    listTitle: "People I care for",
    empty: "You have not added anyone yet.",
    add: "Add a person",
    newTitle: "Add a person you care for",
    editTitle: "Edit details",
    yourRole: "Your role",
    fields: {
      fullName: "Full name",
      dateOfBirth: "Date of birth",
      timezone: "Time zone",
      timezoneHint: "Medicine times use this time zone. Most people in India use Asia/Kolkata.",
      missedAfterMinutes: "Mark a dose as not taken after (minutes)",
      missedAfterHint: "Between 30 and 480. If a dose is not marked by then, it shows as not marked as taken.",
      bloodGroup: "Blood group",
      primaryCondition: "Main health conditions",
      notes: "Notes",
      emergencyContactName: "Emergency contact name",
      emergencyContactPhone: "Emergency contact phone",
      physicianName: "Doctor's name",
      physicianPhone: "Doctor's phone",
    },
    create: "Add person",
    notSet: "Not set",
  },
  people: {
    title: "People",
    caregivers: "Family and helpers",
    patientLogin: "Patient's own login",
    noPatientLogin: "The patient does not have a login yet.",
    revoked: "Access removed",
    revoke: "Remove access",
    confirmRevoke: "Remove this person's access? They will stop seeing everything about this patient.",
    removeLogin: "Remove patient login",
    confirmRemoveLogin: "Remove the patient's login? They will be signed out of CareCircle for this patient. You can invite them again.",
    inviteTitle: "Invite someone",
    inviteEmail: "Their email",
    inviteRole: "Role",
    inviteRoleHelp: {
      CAREGIVER: "Can upload, approve medicines, and edit.",
      VIEWER: "Can only look.",
      PATIENT: "The person cared for. Sees their own doses and marks them taken.",
    },
    createInvite: "Create invite link",
    inviteReady: "Send this link to them. It works once, for that email only, for 72 hours.",
    inviteShareText: "You are invited to CareCircle",
    pendingInvites: "Waiting to be accepted",
    expires: "Expires",
    revokeInvite: "Cancel invite",
  },
  invite: {
    title: "Accept invite",
    missing: "This invite link is incomplete. Ask for a new link.",
    signInFirst: "Sign in with the email address this invite was sent to.",
    signInButton: "Sign in to accept",
    accepting: "Accepting invite…",
    wrongEmail: "This invite is for a different email address. Sign out and sign in with the invited email.",
    accepted: "Invite accepted.",
  },
```

`strings.errors` stays as it was in P0.

### Task 7 — UI building blocks

Create `src/components/ui/button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink",
  secondary: "border-2 border-accent bg-paper text-accent",
  danger: "bg-danger text-accent-ink",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-lg font-semibold disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`}
    />
  );
}
```

Create `src/components/ui/field.tsx`:

```tsx
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

type FieldProps = { id: string; label: string; hint?: string; error?: string };

export function TextField({ id, label, hint, error, ...props }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">{label}</label>
      <input
        id={id}
        name={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        aria-invalid={error ? true : undefined}
        className="min-h-12 rounded-lg border-2 border-line px-3 text-lg"
        {...props}
      />
      {hint ? <p id={`${id}-hint`} className="text-base text-muted">{hint}</p> : null}
      {error ? <p className="text-base text-danger">{error}</p> : null}
    </div>
  );
}

export function TextArea({ id, label, hint, ...props }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">{label}</label>
      <textarea id={id} name={id} rows={3} className="rounded-lg border-2 border-line px-3 py-2 text-lg" {...props} />
      {hint ? <p className="text-base text-muted">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  id,
  label,
  children,
  ...props
}: FieldProps & React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">{label}</label>
      <select id={id} name={id} className="min-h-12 rounded-lg border-2 border-line bg-paper px-3 text-lg" {...props}>
        {children}
      </select>
    </div>
  );
}
```

Create `src/components/ui/notice.tsx`:

```tsx
import type { ReactNode } from "react";

const TONE_CLASSES = {
  info: "border-accent text-ink",
  success: "border-ok text-ok",
  warning: "border-warn text-warn",
  error: "border-danger text-danger",
} as const;

export function Notice({ tone = "info", children }: { tone?: keyof typeof TONE_CLASSES; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border-l-4 bg-panel p-4 text-base ${TONE_CLASSES[tone]}`}>
      {children}
    </div>
  );
}
```

Create `src/components/ui/card.tsx`:

```tsx
import type { ReactNode } from "react";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-5">
      {title ? <h2 className="text-xl font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}
```

Create `src/lib/client/call-api.ts`:

```ts
import { isErrorCode, type ErrorCode } from "@/lib/errors";

export type ApiFailure = { code: ErrorCode | "OFFLINE"; requestId?: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

export async function callApi<T>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: { code: "OFFLINE" } };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return { ok: true, data: payload as T };
  }
  const error = (payload as { error?: { code?: unknown; requestId?: unknown } } | null)?.error;
  return {
    ok: false,
    error: {
      code: isErrorCode(error?.code) ? error.code : "INTERNAL",
      requestId: typeof error?.requestId === "string" ? error.requestId : undefined,
    },
  };
}
```

Create `src/components/error-message.tsx`:

```tsx
import type { ApiFailure } from "@/lib/client/call-api";
import { Notice } from "@/components/ui/notice";
import { strings } from "@/strings/en";

export function ErrorMessage({ error }: { error: ApiFailure | null }) {
  if (!error) {
    return null;
  }
  const text = error.code === "OFFLINE" ? strings.offline : strings.errors[error.code];
  return (
    <Notice tone="error">
      {text}
      {error.code === "INTERNAL" && error.requestId ? ` ${error.requestId}` : null}
    </Notice>
  );
}
```

Create `src/components/app-header.tsx`:

```tsx
import Link from "next/link";
import { strings } from "@/strings/en";

export function AppHeader({ showCaregiverNav = true }: { showCaregiverNav?: boolean }) {
  return (
    <header className="border-b border-line bg-panel">
      <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 p-4">
        <Link href="/start" className="text-xl font-bold">{strings.appName}</Link>
        {showCaregiverNav ? <Link href="/patients" className="underline">{strings.nav.patients}</Link> : null}
        <Link href="/account" className="underline">{strings.nav.account}</Link>
        <form action="/auth/sign-out" method="post" className="ml-auto">
          <button type="submit" className="min-h-12 px-2 underline">{strings.nav.signOut}</button>
        </form>
      </nav>
    </header>
  );
}
```

P5 adds the notification bell to this header.

**Check:** `npm run typecheck` and `npm run lint` exit 0.

### Task 8 — Sign-up, sign-in, callback, sign-out, start

Create `src/app/sign-up/page.tsx` as a client component (`"use client"` on the first line). It must:

- Show `strings.auth.signUpTitle`, `strings.auth.signUpIntro`, and the `Disclaimer`.
- Have fields `fullName` (required, max 128), `email` (type email, required), `password` (type password, required, `minLength={8}`, hint `strings.auth.passwordHint`).
- On submit, call:

```ts
const supabase = createSupabaseBrowserClient();
const { error } = await supabase.auth.signUp({
  email: email.trim(),
  password,
  options: {
    data: { full_name: fullName.trim() },
    emailRedirectTo: `${window.location.origin}/auth/callback?next=/start`,
  },
});
```

- On success, replace the form with `<Notice tone="success">{strings.auth.checkEmail}</Notice>` and a link to `/sign-in`.
- On error, show `<Notice tone="error">{strings.errors.VALIDATION_FAILED}</Notice>`. Do not show Supabase's raw error text.
- Disable the submit button while waiting.
- Link at the bottom: `strings.auth.haveAccount` to `/sign-in`.

Create `src/app/sign-in/page.tsx` (server component):

```tsx
import { SignInForm } from "./sign-in-form";
import { safeNextPath } from "@/lib/auth/next-path";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <SignInForm next={safeNextPath(next)} linkFailed={error === "link"} />
    </main>
  );
}
```

Create `src/app/sign-in/sign-in-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { strings } from "@/strings/en";

type Mode = "code" | "password";

export function SignInForm({ next, linkFailed }: { next: string; linkFailed: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("code");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(linkFailed ? strings.auth.linkFailed : null);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const cleanEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) {
      setMessage(error.status === 429 ? strings.errors.RATE_LIMITED : strings.errors.VALIDATION_FAILED);
      return;
    }
    setCodeSentTo(cleanEmail);
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!codeSentTo) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.verifyOtp({ email: codeSentTo, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) {
      setMessage(strings.auth.wrongCode);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) {
      setMessage(error.code === "email_not_confirmed" ? strings.auth.unconfirmed : strings.auth.wrongPassword);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">{strings.auth.signInTitle}</h1>
      <div role="tablist" className="grid grid-cols-2 gap-2">
        <Button type="button" role="tab" aria-selected={mode === "code"} variant={mode === "code" ? "primary" : "secondary"} onClick={() => setMode("code")}>
          {strings.auth.codeTab}
        </Button>
        <Button type="button" role="tab" aria-selected={mode === "password"} variant={mode === "password" ? "primary" : "secondary"} onClick={() => setMode("password")}>
          {strings.auth.passwordTab}
        </Button>
      </div>
      {message ? <Notice tone="error">{message}</Notice> : null}
      {mode === "code" && !codeSentTo ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <TextField id="email" label={strings.auth.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" disabled={busy}>{busy ? strings.auth.sending : strings.auth.sendCode}</Button>
        </form>
      ) : null}
      {mode === "code" && codeSentTo ? (
        <form onSubmit={verifyCode} className="flex flex-col gap-4">
          <p className="text-lg">{strings.auth.codeSent} <strong>{codeSentTo}</strong></p>
          <TextField id="code" label={strings.auth.code} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
          <Button type="submit" disabled={busy}>{strings.auth.verify}</Button>
          <Button type="button" variant="secondary" onClick={() => { setCodeSentTo(null); setCode(""); }}>{strings.auth.useDifferentEmail}</Button>
        </form>
      ) : null}
      {mode === "password" ? (
        <form onSubmit={signInWithPassword} className="flex flex-col gap-4">
          <TextField id="email" label={strings.auth.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField id="password" label={strings.auth.password} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" disabled={busy}>{strings.auth.signIn}</Button>
        </form>
      ) : null}
      <Link href="/sign-up" className="underline">{strings.auth.noAccount}</Link>
    </div>
  );
}
```

Check the method names `signInWithOtp`, `verifyOtp` (with `type: "email"`), and `signInWithPassword`, and the error field `error.code`, against the `@supabase/supabase-js` documentation for your installed version. Note any difference.

Create `src/app/auth/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/next-path";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL(`/sign-in?error=link&next=${encodeURIComponent(next)}`, url.origin));
}
```

Create `src/app/auth/sign-out/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
```

Create `src/app/start/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/session";

export default async function StartPage() {
  const { supabase, user } = await requirePageUser("/start");
  const { count: caregiverCount } = await supabase
    .from("caregiver_links")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "ACTIVE");
  if ((caregiverCount ?? 0) > 0) {
    redirect("/patients");
  }
  const { count: patientCount } = await supabase
    .from("patient_links")
    .select("patient_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((patientCount ?? 0) > 0) {
    redirect("/me");
  }
  redirect("/patients");
}
```

`/me` is built in P4. Until then a patient-only user sees a 404 after sign-in; that is expected in P1.

**Check:** `npm run build` succeeds. Then by hand with `npm run dev`:

1. Open `/sign-up`, create an account. The mail viewer (P0 Exit log URL) shows the confirmation email with a link and a code.
2. Tap the link. You land on `/patients` (a 404 until task 9; that is fine for now).
3. Sign out. Open `/sign-in`, choose "Email me a code", enter your email, then the code from the mail viewer. You are signed in.

### Task 9 — Patient list, create, edit, overview

Create `src/components/patient-form.tsx` as a client component. Specification:

- Props: `mode: "create" | "edit"`, `patientId?: string`, `initial?: Partial<PatientFields>` (import `PatientFields` from `@/lib/patients/schema`).
- Fields, in this order, with labels from `strings.patients.fields`:
  - `fullName` text, required.
  - `dateOfBirth` `type="date"`, required, `max` set to today's date as `YYYY-MM-DD`.
  - `timezone` text, required, default `Asia/Kolkata`, hint `timezoneHint`.
  - `missedAfterMinutes` `type="number"`, `min=30`, `max=480`, `step=15`, default `120`, hint `missedAfterHint`.
  - `bloodGroup` select with an empty option (`strings.patients.notSet`) and each of `BLOOD_GROUPS`.
  - `primaryCondition`, `notes` as `TextArea`.
  - `emergencyContactName`, `emergencyContactPhone` (`type="tel"`), `physicianName`, `physicianPhone` (`type="tel"`).
- On submit, build a body with the camelCase field names. Convert `missedAfterMinutes` to a number. Send empty optional strings as `""` (the server turns them into null). Send `bloodGroup` as `null` when empty.
- Create mode: `callApi<{ patientId: string }>("/api/patients", "POST", body)`. On success `router.push(\`/patients/${data.patientId}\`)`.
- Edit mode: `callApi("/api/patients/" + patientId, "PATCH", body)`. On success `router.push(\`/patients/${patientId}\`)` and `router.refresh()`.
- Show `<ErrorMessage error={error} />` above the submit button. Disable the button while saving and show `strings.common.saving`.

Create `src/app/api/patients/route.ts`:

```ts
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { fromDb } from "@/lib/db-errors";
import { patientFieldsSchema } from "@/lib/patients/schema";
import { parseInput, readJsonBody } from "@/lib/validation";

export const POST = handleRoute(async (request) => {
  const { supabase } = await requireApiUser();
  const input = parseInput(patientFieldsSchema, await readJsonBody(request));
  const { data, error } = await supabase.rpc("create_patient", {
    p_full_name: input.fullName,
    p_date_of_birth: input.dateOfBirth,
    p_timezone: input.timezone,
    p_missed_after_minutes: input.missedAfterMinutes,
    p_blood_group: input.bloodGroup ?? undefined,
    p_primary_condition: input.primaryCondition ?? undefined,
    p_notes: input.notes ?? undefined,
    p_emergency_contact_name: input.emergencyContactName ?? undefined,
    p_emergency_contact_phone: input.emergencyContactPhone ?? undefined,
    p_physician_name: input.physicianName ?? undefined,
    p_physician_phone: input.physicianPhone ?? undefined,
  });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ patientId: data }, 201);
});
```

If the generated types reject `undefined` for optional arguments, pass the value only when it is not null (build the arguments object step by step). Do not cast to `any`.

Create `src/app/api/patients/[patientId]/route.ts`:

```ts
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";
import { patientPatchSchema, toPatientColumns } from "@/lib/patients/schema";
import { parseInput, readJsonBody } from "@/lib/validation";

export const PATCH = handleRoute<{ patientId: string }>(async (request, { params }) => {
  if (!isUuid(params.patientId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const patch = parseInput(patientPatchSchema, await readJsonBody(request));
  const columns = toPatientColumns(patch);
  if (Object.keys(columns).length === 0) {
    throw appError("VALIDATION_FAILED");
  }
  const { data: role } = await supabase.rpc("my_role", { p_patient: params.patientId });
  if (!role) {
    throw appError("NOT_FOUND");
  }
  if (role !== "OWNER" && role !== "CAREGIVER") {
    throw appError("FORBIDDEN");
  }
  const { error } = await supabase.from("patients").update(columns).eq("id", params.patientId);
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ ok: true });
});
```

Create `src/app/patients/page.tsx` (server component). Specification:

- `requirePageUser("/patients")`.
- Query: `supabase.from("caregiver_links").select("role, patients(id, full_name, date_of_birth)").eq("user_id", user.id).eq("status", "ACTIVE")`. Row-level security already hides soft-deleted patients (the joined `patients` value is null for them); skip rows where `patients` is null.
- Render `<AppHeader />`, a heading `strings.patients.listTitle`, a primary link-button `strings.patients.add` to `/patients/new`, and a list of links to `/patients/{id}` showing the name and `strings.roles[role]`.
- When the list is empty, show `strings.patients.empty`.
- Sort by name.

Create `src/app/patients/new/page.tsx`: `requirePageUser("/patients/new")`, `<AppHeader />`, heading `strings.patients.newTitle`, `<PatientForm mode="create" />`.

Create `src/app/patients/[patientId]/layout.tsx`:

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { loadPatientContext } from "@/lib/patients/context";
import { tabsFor } from "@/lib/patients/tabs";
import { strings } from "@/strings/en";

export default async function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const { patient, role } = await loadPatientContext(patientId, `/patients/${patientId}`);
  return (
    <>
      <AppHeader />
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
        <div>
          <h1 className="text-3xl font-semibold">{patient.full_name}</h1>
          <p className="text-muted">{strings.patients.yourRole}: {strings.roles[role]}</p>
        </div>
        <nav aria-label={patient.full_name} className="flex flex-wrap gap-2">
          {tabsFor(role).map((tab) => (
            <Link key={tab.label} href={tab.href(patientId)} className="min-h-12 rounded-lg border border-line px-4 py-3">
              {tab.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </>
  );
}
```

A PATIENT who opens `/patients/{id}` sees only the Overview tab content allowed for them. P4 sends patients to `/me` instead.

Create `src/app/patients/[patientId]/page.tsx` (overview). Specification:

- Call `loadPatientContext` again (React caches nothing here; it is two small queries, accepted for MVP).
- Show every profile field with its label from `strings.patients.fields`, using `strings.patients.notSet` for empty values. Show date of birth as written (YYYY-MM-DD) and the age in years.
- If role is OWNER or CAREGIVER, show a link-button `strings.common.edit` to `/patients/{id}/edit`.
- P5 replaces this page's top with the dashboard. Keep the profile details in a `Card` titled `strings.patients.editTitle` so P5 can keep it below the dashboard.

Create `src/app/patients/[patientId]/edit/page.tsx`: load context; if role is not OWNER or CAREGIVER call `notFound()`; render heading `strings.patients.editTitle` and `<PatientForm mode="edit" patientId={patientId} initial={...} />` with the patient's current values mapped to camelCase.

**Check:** `npm run build` succeeds. By hand: create a patient, see it in the list, open it, edit the notes, see the change.

### Task 10 — People, invites, and acceptance

Create `src/app/api/patients/[patientId]/invites/route.ts`:

```ts
import { z } from "zod";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { newInviteToken } from "@/lib/auth/invite-token";
import { appError, fromDb } from "@/lib/db-errors";
import { getEnv } from "@/lib/env";
import { isUuid } from "@/lib/ids";
import { parseInput, readJsonBody } from "@/lib/validation";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["CAREGIVER", "VIEWER", "PATIENT"]),
});

export const POST = handleRoute<{ patientId: string }>(async (request, { params }) => {
  if (!isUuid(params.patientId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const input = parseInput(inviteSchema, await readJsonBody(request));
  const { token, hash } = newInviteToken();
  const { data, error } = await supabase.rpc("create_invite", {
    p_patient: params.patientId,
    p_email: input.email,
    p_role: input.role,
    p_token_hash: hash,
  });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ inviteId: data, link: `${getEnv().appUrl}/invite#t=${token}` }, 201);
});
```

If your `zod` version marks `z.string().email()` as deprecated, use the version's recommended email validator; behaviour must stay the same.

Create the remaining routes with the same pattern (validate UUID params with `isUuid`, `requireApiUser`, call the RPC, `fromDb` on error, `jsonOk({ ok: true })`):

| File | Method | RPC and arguments |
|---|---|---|
| `src/app/api/patients/[patientId]/invites/[inviteId]/route.ts` | DELETE | `revoke_invite({ p_invite: inviteId })` |
| `src/app/api/patients/[patientId]/caregivers/[userId]/route.ts` | DELETE | `revoke_caregiver({ p_patient: patientId, p_user: userId })` |
| `src/app/api/patients/[patientId]/patient-login/route.ts` | DELETE | `remove_patient_login({ p_patient: patientId })` |
| `src/app/api/account/route.ts` | PATCH | body `{ fullName: string 1–128, phone: string 0–32 }` → `update_my_profile({ p_full_name, p_phone })` |

Create `src/app/api/invites/accept/route.ts`:

```ts
import { z } from "zod";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { hashInviteToken, inviteTokenSchema } from "@/lib/auth/invite-token";
import { fromDb } from "@/lib/db-errors";
import { parseInput, readJsonBody } from "@/lib/validation";

const acceptSchema = z.object({ token: inviteTokenSchema });

export const POST = handleRoute(async (request) => {
  const { supabase } = await requireApiUser();
  const { token } = parseInput(acceptSchema, await readJsonBody(request));
  const { data, error } = await supabase.rpc("accept_invite", { p_token_hash: hashInviteToken(token) });
  if (error) {
    throw fromDb(error);
  }
  const result = data as { patient_id: string; role: string };
  return jsonOk({ patientId: result.patient_id, role: result.role });
});
```

Create `src/app/patients/[patientId]/people/page.tsx` (server component). Specification:

- `loadPatientContext`.
- Caregivers: `supabase.from("caregiver_links").select("id, role, status, user_id, profiles(full_name, email)").eq("patient_id", patientId).order("created_at")`. Show name, email, role label, and `strings.people.revoked` for REVOKED rows.
- Patient login: `supabase.from("patient_links").select("user_id, profiles(full_name, email)").eq("patient_id", patientId).maybeSingle()`. Show it or `strings.people.noPatientLogin`.
- Only when role is OWNER:
  - next to each ACTIVE CAREGIVER or VIEWER, a `RevokeButton` (client component in `people-actions.tsx`) that asks `window.confirm(strings.people.confirmRevoke)` then calls DELETE `/api/patients/{patientId}/caregivers/{userId}` and `router.refresh()`;
  - next to the patient login, a `RemoveLoginButton` with `strings.people.confirmRemoveLogin` calling DELETE `/api/patients/{patientId}/patient-login`;
  - pending invites: `supabase.from("invites").select("id, email, role, expires_at").eq("patient_id", patientId).is("used_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString())`, each with a `CancelInviteButton` calling DELETE `/api/patients/{patientId}/invites/{id}`;
  - `<InvitePanel patientId={patientId} hasPatientLogin={...} />`.
- Show errors from these buttons with `ErrorMessage`.

Create `src/app/patients/[patientId]/people/invite-panel.tsx` (client component). Specification:

- Fields: `email` (type email, required), `role` select with CAREGIVER, VIEWER, and PATIENT (omit PATIENT when `hasPatientLogin` is true). Under the select, show `strings.people.inviteRoleHelp[role]`.
- Submit: `callApi<{ inviteId: string; link: string }>(\`/api/patients/${patientId}/invites\`, "POST", { email, role })`.
- On success, show `strings.people.inviteReady`, the link in a read-only text field, a Copy button (`navigator.clipboard.writeText(link)`, then show `strings.common.copied` for 2 seconds), and a Share button shown only when `navigator.share` exists (`navigator.share({ title: strings.appName, text: strings.people.inviteShareText, url: link })`). Then `router.refresh()` so the pending list updates.
- The link is shown once. It is not stored anywhere in the browser.

Create `src/app/invite/page.tsx`:

```tsx
import { InviteAccept } from "./invite-accept";
import { strings } from "@/strings/en";

export default function InvitePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <h1 className="text-3xl font-semibold">{strings.invite.title}</h1>
      <InviteAccept />
    </main>
  );
}
```

Create `src/app/invite/invite-accept.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { callApi, type ApiFailure } from "@/lib/client/call-api";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ErrorMessage } from "@/components/error-message";
import { Notice } from "@/components/ui/notice";
import { strings } from "@/strings/en";

const STORAGE_KEY = "carecircle.inviteToken";

type State = "loading" | "missing" | "signin" | "accepting" | "failed";

function readToken(): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("t");
  if (fromHash) {
    sessionStorage.setItem(STORAGE_KEY, fromHash);
    window.history.replaceState(null, "", window.location.pathname);
    return fromHash;
  }
  return sessionStorage.getItem(STORAGE_KEY);
}

export function InviteAccept() {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<ApiFailure | null>(null);

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setState("missing");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setState("signin");
        return;
      }
      setState("accepting");
      const result = await callApi<{ patientId: string; role: string }>("/api/invites/accept", "POST", { token });
      if (!result.ok) {
        if (result.error.code !== "OFFLINE" && result.error.code !== "INTERNAL") {
          sessionStorage.removeItem(STORAGE_KEY);
        }
        setError(result.error);
        setState("failed");
        return;
      }
      sessionStorage.removeItem(STORAGE_KEY);
      router.replace(result.data.role === "PATIENT" ? "/me" : `/patients/${result.data.patientId}`);
    });
  }, [router]);

  if (state === "missing") {
    return <Notice tone="error">{strings.invite.missing}</Notice>;
  }
  if (state === "signin") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg">{strings.invite.signInFirst}</p>
        <Link href="/sign-in?next=/invite" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 text-lg font-semibold text-accent-ink">
          {strings.invite.signInButton}
        </Link>
      </div>
    );
  }
  if (state === "failed") {
    return error?.code === "FORBIDDEN" ? <Notice tone="error">{strings.invite.wrongEmail}</Notice> : <ErrorMessage error={error} />;
  }
  return <p className="text-lg" role="status">{strings.invite.accepting}</p>;
}
```

Add the People tab to `PATIENT_TABS` (already present from task 5).

Create `src/app/account/page.tsx` and `account-form.tsx`: show the signed-in user's email (read-only), full name and phone fields, Save calls PATCH `/api/account`, success shows `strings.account.saved`. Include `<AppHeader />`.

**Check:** `npm run build` succeeds. By hand with two browsers (one normal, one private window):

1. Owner invites `viewer@example.test` as VIEWER. Copy the link.
2. In the private window, open the link. You are asked to sign in. Sign in with a code for `viewer@example.test`. You land on the patient's page with role Viewer.
3. As the owner, remove the viewer's access. In the private window, reload: 404.

### Task 11 — Unit tests

Create these files. Each test name starts with the requirement ID when it covers one.

`src/test/invite-token.test.ts`:

- `newInviteToken` returns a 43-character token matching `/^[A-Za-z0-9_-]{43}$/` and a 64-character lowercase hex hash.
- `hashInviteToken(token)` equals the hash returned with it.
- Two calls give different tokens.
- `inviteTokenSchema` rejects 42 and 44 characters, `+`, `/`, and `=`.

`src/test/next-path.test.ts`:

- `/patients/abc` stays.
- `null`, `""`, `patients`, `//evil.example`, `https://evil.example`, `/\\evil` all become `/start`.

`src/test/db-errors.test.ts`:

- `{ message: "EXPIRED", code: "P0001" }` → `AppError` with code `EXPIRED`.
- `{ code: "42501", message: "permission denied" }` → `FORBIDDEN`.
- `{ code: "23505" }` → `CONFLICT`.
- `{ code: "22008" }` and `{ code: "23514" }` → `VALIDATION_FAILED`.
- `{ code: "XX000", message: "boom" }` → a plain `Error` that is not an `AppError`.

`src/test/patient-schema.test.ts`:

- FR-2.1 a full valid object passes, and empty optional strings become `null`.
- Empty `fullName` fails. `dateOfBirth` `"04/03/1957"` fails. `missedAfterMinutes` 29 and 481 fail. `bloodGroup` `"C+"` fails.
- FR-2.2 `patientPatchSchema` accepts `{ notes: "x" }` alone, and `toPatientColumns` returns `{ notes: "x" }` only.
- `toPatientColumns({ bloodGroup: null })` returns `{ blood_group: null }`.

**Check:** `npm test` passes; the count is P0's 8 plus the new tests.

### Task 12 — Browser tests

At the top of `playwright.config.ts`, before `export default`, add:

```ts
import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
```

Create `e2e/helpers/users.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

const PASSWORD = "Test-password-123";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in .env.local`);
  }
  return value;
}

export function adminClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = { id: string; email: string; password: string; fullName: string };

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const fullName = `${label} Tester`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    throw new Error(`createUser failed: ${error?.message}`);
  }
  return { id: data.user.id, email, password: PASSWORD, fullName };
}

export async function userClient(user: TestUser) {
  const client = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) {
    throw new Error(`signIn failed: ${error.message}`);
  }
  return client;
}

export async function signInViaUi(page: Page, user: TestUser, next = "/start") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByRole("tab", { name: "Use a password" }).click();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

export async function createPatientAs(user: TestUser, fullName: string): Promise<string> {
  const client = await userClient(user);
  const { data, error } = await client.rpc("create_patient", {
    p_full_name: fullName,
    p_date_of_birth: "1957-03-04",
    p_timezone: "Asia/Kolkata",
    p_missed_after_minutes: 120,
  });
  if (error || typeof data !== "string") {
    throw new Error(`create_patient failed: ${error?.message}`);
  }
  return data;
}
```

The service-role key is allowed here because this file only runs in tests on the builder's machine (README rule 5.1.6).

Create `e2e/accounts.spec.ts` with these tests. Use a new `browser.newContext()` for each second person.

1. `FR-1.1 sign-up shows the check-email message`: fill the sign-up form with a unique email, submit, expect `strings.auth.checkEmail` text.
2. `FR-1.2 password sign-in lands on the patient list`: `createTestUser("owner")`, `signInViaUi`, expect URL `/patients` and heading "People I care for".
3. `FR-2.1 owner creates a patient through the form`: sign in, go to `/patients/new`, fill name "Ramesh Demo", date of birth `1957-03-04`, submit, expect the heading "Ramesh Demo" and "Your role: Owner".
4. `FR-3.1 FR-3.2 owner invites a caregiver who accepts`: owner creates a patient with `createPatientAs`, signs in, opens People, invites a second test user's email as CAREGIVER, reads the link from the read-only field. In a new context, sign in as the second user, go to the link, expect the patient heading and "Your role: Caregiver".
5. `FR-3.2 a different signed-in user cannot accept`: same set-up, but a third user opens the link; expect the wrong-email notice.
6. `FR-2.2 viewer cannot edit`: invite and accept as VIEWER via the UI or via `userClient` RPCs (`create_invite` needs a token hash; generate one with `hashInviteToken` from `src/lib/auth/invite-token.ts`), then as the viewer open the patient: no Edit link; `page.request.patch("/api/patients/{id}", { data: { notes: "x" } })` returns 403.
7. `FR-3.3 revoked caregiver loses access`: owner revokes in People (accept the confirm dialog with `page.once("dialog", (d) => d.accept())`); caregiver reloads the patient URL and sees the 404 page.
8. `FR-1.4 sign-out ends the session`: after sign-out, opening `/patients` redirects to `/sign-in`.

Before running: `npm run db:reset` (clean database).

**Check:** `npm run test:e2e` passes all tests in both projects.

---

## Exit checks

| Command | Expected |
|---|---|
| `npm run db:reset` | no error |
| `npm run db:test` | 35 passed |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | all pass |
| `npm run build` | succeeds |
| `npm run test:e2e` | all pass (smoke and accounts, both projects) |
| By hand: sign in with the 6-digit code on a real Android phone against `npm run dev` on your LAN, or against staging after P6 | works |

## Exit log

```
(pass lines of each exit check)
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

- Deleting a patient (P6).
- Notification centre UI (P5). Rows are created now.
- Patient home `/me` (P4).
