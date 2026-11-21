# Phase 2 — Documents, consent, and AI parsing

## Goal

A caregiver gives consent, uploads a prescription photo or PDF to private storage, views it through a 60-second link, and has Gemini read it into structured rows (or a recorded answer in demo mode). The review screen shows the scan beside the extracted rows with problem rows highlighted. Approval comes in P3.

## Requirements covered

FR-4.1, FR-4.2, FR-4.3, FR-4.5, FR-4.6, FR-5.1, FR-11.2 (DOCUMENT_PARSED, DOCUMENT_FAILED). PRD section 6.

## Before you start

- Phase 1 exit checks pass.
- `npx supabase start` is running.
- Choose the Gemini model: open Google's official Gemini models page, pick the current stable "Flash" model that accepts images and PDF input, and write its exact ID in the Exit log. Put it in `.env.local` as `GEMINI_MODEL=<id>` and your key as `GEMINI_API_KEY=<key>`. The key must belong to a billing-enabled project (PRD section 9).
- Keep `DEMO_MODE=true` in `.env.local` for development and tests. Switch it to `false` only for the real-model check in task 12.

## How upload works (read before coding)

1. The browser checks the file's first bytes and size, picks the extension, and creates a new document ID.
2. The browser uploads the file directly to the private bucket `medical-documents` at `<patientId>/<documentId>.<ext>` using the signed-in session. Storage rules allow this only for OWNER or CAREGIVER with active consent.
3. The browser calls `POST /api/patients/[patientId]/documents` with the document ID, extension, and details.
4. The server downloads the stored file with the user's session, checks size, real type, PDF page count, and encryption, computes SHA-256, and registers the row with `register_document`.
5. If any check fails, the row is not created. The stored file has no row and is removed by the purge script in P6.

Large files go straight to Supabase, so Amplify's server never receives a 10 MB request body.

## Files this phase creates or changes

| Path | Purpose |
|---|---|
| `supabase/migrations/20250101000200_documents_consent.sql` | consents, documents, storage bucket and two read rules plus one upload rule, functions |
| `supabase/tests/02_documents.test.sql` | database tests |
| `src/lib/supabase/database.types.ts` | regenerated |
| `src/lib/documents/constants.ts` | bucket, types, limits, notice version |
| `src/lib/documents/file-check.ts` | real-type detection (works in browser and server) |
| `src/lib/documents/pdf.ts` | PDF page and encryption check (server) |
| `src/lib/documents/digest.ts` | SHA-256 (server) |
| `src/lib/gemini/prompt.ts` | instruction text sent to Gemini |
| `src/lib/gemini/schema.ts` | Gemini response schema, `zod` validation, row analysis |
| `src/lib/gemini/client.ts` | Gemini REST call |
| `src/lib/gemini/extract.ts` | picks demo or real |
| `fixtures/gemini/prescription-1.json` | recorded answer for demo mode |
| `fixtures/documents/synthetic-prescription-1.jpg` | photo of a synthetic prescription (you create it) |
| `src/strings/en.ts` | new keys |
| `src/lib/patients/tabs.ts` | Documents tab |
| `src/app/api/patients/[patientId]/consent/route.ts` | POST give, DELETE withdraw |
| `src/app/api/patients/[patientId]/documents/route.ts` | POST register |
| `src/app/api/documents/[documentId]/route.ts` | PATCH details |
| `src/app/api/documents/[documentId]/url/route.ts` | GET signed URL |
| `src/app/api/documents/[documentId]/parse/route.ts` | POST parse |
| `src/app/patients/[patientId]/documents/page.tsx` | list and consent |
| `src/app/patients/[patientId]/documents/consent-panel.tsx` | consent give and withdraw |
| `src/app/patients/[patientId]/documents/upload/page.tsx`, `upload-form.tsx` | upload |
| `src/app/patients/[patientId]/documents/[documentId]/page.tsx` | document page |
| `src/components/documents/document-preview.tsx` | shows the file through a signed URL |
| `src/components/documents/document-details-form.tsx` | type, doctor, clinic, date |
| `src/components/documents/parse-button.tsx` | starts parsing |
| `src/components/documents/extraction-table.tsx` | read-only extracted rows with flags |
| `src/components/documents/status-badge.tsx` | status label |
| `src/test/*.test.ts` | unit tests |
| `e2e/documents.spec.ts` | browser tests |

---

## Tasks

### Task 1 — Migration

Create `supabase/migrations/20250101000200_documents_consent.sql`:

```sql
create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.try_date(p_value text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p_value::date;
exception
  when others then
    return null;
end;
$$;

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  purpose text not null default 'DOCUMENT_AI_PROCESSING' check (purpose = 'DOCUMENT_AI_PROCESSING'),
  notice_version text not null check (length(notice_version) between 1 and 32),
  given_by uuid not null references public.profiles (id),
  given_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles (id),
  check ((withdrawn_at is null) = (withdrawn_by is null))
);

create unique index consents_one_active on public.consents (patient_id, purpose) where withdrawn_at is null;

create table public.medical_documents (
  id uuid primary key,
  patient_id uuid not null references public.patients (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  file_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  document_type text not null check (document_type in ('PRESCRIPTION', 'LAB_REPORT', 'DISCHARGE_SUMMARY', 'OTHER')),
  doctor_name varchar(128),
  clinic_name varchar(128),
  issue_date date,
  extraction_status text not null default 'PENDING'
    check (extraction_status in ('PENDING', 'PARSING', 'PARSED', 'FAILED', 'VERIFIED')),
  extraction_raw jsonb,
  extraction_error text check (extraction_error in ('AI_UNAVAILABLE', 'AI_INVALID_OUTPUT', 'AI_BLOCKED', 'AI_NOT_CONFIGURED')),
  parse_started_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (
    file_path = patient_id::text || '/' || id::text ||
      case mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.pdf' end
  )
);

create index medical_documents_patient on public.medical_documents (patient_id, created_at desc);

create or replace function public.has_active_consent(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.consents
    where patient_id = p_patient and purpose = 'DOCUMENT_AI_PROCESSING' and withdrawn_at is null
  );
$$;

create or replace function public.document_file_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.medical_documents d
    where d.file_path = p_name
      and d.deleted_at is null
      and public.has_role(d.patient_id, array['OWNER', 'CAREGIVER', 'VIEWER'])
  );
$$;

create or replace function public.unregistered_file_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(public.try_uuid((storage.foldername(p_name))[1]), array['OWNER', 'CAREGIVER'])
    and not exists (select 1 from public.medical_documents d where d.file_path = p_name);
$$;

create or replace function public.give_consent(p_patient uuid, p_notice_version text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
  new_id uuid;
begin
  if public.my_role(p_patient) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(p_patient, array['OWNER', 'CAREGIVER']) then
    raise exception 'FORBIDDEN';
  end if;
  if p_notice_version is null or length(p_notice_version) not between 1 and 32 then
    raise exception 'VALIDATION_FAILED';
  end if;
  select id into existing from public.consents
  where patient_id = p_patient and purpose = 'DOCUMENT_AI_PROCESSING' and withdrawn_at is null;
  if existing is not null then
    return existing;
  end if;
  insert into public.consents (patient_id, notice_version, given_by)
  values (p_patient, p_notice_version, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.withdraw_consent(p_patient uuid)
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
  update public.consents
  set withdrawn_at = now(), withdrawn_by = auth.uid()
  where patient_id = p_patient and purpose = 'DOCUMENT_AI_PROCESSING' and withdrawn_at is null;
end;
$$;

create or replace function public.register_document(
  p_document uuid,
  p_patient uuid,
  p_mime_type text,
  p_size_bytes integer,
  p_sha256 text,
  p_document_type text,
  p_doctor_name text default null,
  p_clinic_name text default null,
  p_issue_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  path text;
begin
  if public.my_role(p_patient) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(p_patient, array['OWNER', 'CAREGIVER']) then
    raise exception 'FORBIDDEN';
  end if;
  if not public.has_active_consent(p_patient) then
    raise exception 'CONSENT_REQUIRED';
  end if;
  path := p_patient::text || '/' || p_document::text ||
    case p_mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'application/pdf' then '.pdf' end;
  if path is null then
    raise exception 'VALIDATION_FAILED';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'medical-documents' and name = path) then
    raise exception 'VALIDATION_FAILED';
  end if;
  insert into public.medical_documents (
    id, patient_id, uploaded_by, file_path, mime_type, size_bytes, sha256, document_type, doctor_name, clinic_name, issue_date
  )
  values (
    p_document, p_patient, auth.uid(), path, p_mime_type, p_size_bytes, p_sha256, p_document_type,
    nullif(trim(p_doctor_name), ''), nullif(trim(p_clinic_name), ''), p_issue_date
  );
  return p_document;
end;
$$;

create or replace function public.claim_document_for_parse(p_document uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.medical_documents%rowtype;
begin
  select * into doc from public.medical_documents where id = p_document and deleted_at is null for update;
  if not found or public.my_role(doc.patient_id) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(doc.patient_id, array['OWNER', 'CAREGIVER']) then
    raise exception 'FORBIDDEN';
  end if;
  if not public.has_active_consent(doc.patient_id) then
    raise exception 'CONSENT_REQUIRED';
  end if;
  if doc.extraction_status in ('PENDING', 'FAILED')
    or (doc.extraction_status = 'PARSING' and doc.parse_started_at < now() - interval '2 minutes') then
    update public.medical_documents
    set extraction_status = 'PARSING', parse_started_at = now(), extraction_error = null
    where id = doc.id;
    return jsonb_build_object('file_path', doc.file_path, 'mime_type', doc.mime_type, 'patient_id', doc.patient_id);
  end if;
  raise exception 'CONFLICT';
end;
$$;

create or replace function public.record_parse_result(p_document uuid, p_ok boolean, p_raw jsonb, p_error_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.medical_documents%rowtype;
begin
  select * into doc from public.medical_documents where id = p_document and deleted_at is null for update;
  if not found or public.my_role(doc.patient_id) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(doc.patient_id, array['OWNER', 'CAREGIVER']) then
    raise exception 'FORBIDDEN';
  end if;
  if doc.extraction_status <> 'PARSING' then
    raise exception 'CONFLICT';
  end if;
  if coalesce(p_ok, false) then
    update public.medical_documents
    set extraction_status = 'PARSED',
        extraction_raw = p_raw,
        extraction_error = null,
        doctor_name = coalesce(doctor_name, left(nullif(trim(p_raw ->> 'doctor_name'), ''), 128)),
        clinic_name = coalesce(clinic_name, left(nullif(trim(p_raw ->> 'clinic_name'), ''), 128)),
        issue_date = coalesce(issue_date, public.try_date(p_raw ->> 'issue_date'))
    where id = doc.id;
    perform public.notify_members(doc.patient_id, 'DOCUMENT_PARSED', jsonb_build_object('documentId', doc.id), array['OWNER', 'CAREGIVER'], auth.uid());
    return 'PARSED';
  end if;
  if p_error_code is null or p_error_code not in ('AI_UNAVAILABLE', 'AI_INVALID_OUTPUT', 'AI_BLOCKED', 'AI_NOT_CONFIGURED') then
    raise exception 'VALIDATION_FAILED';
  end if;
  update public.medical_documents
  set extraction_status = 'FAILED', extraction_raw = p_raw, extraction_error = p_error_code
  where id = doc.id;
  perform public.notify_members(doc.patient_id, 'DOCUMENT_FAILED', jsonb_build_object('documentId', doc.id, 'code', p_error_code), array['OWNER', 'CAREGIVER'], auth.uid());
  return 'FAILED';
end;
$$;

create trigger audit_consents after insert or update or delete on public.consents
for each row execute function public.audit_row_change();
create trigger audit_medical_documents after insert or update or delete on public.medical_documents
for each row execute function public.audit_row_change();

alter table public.consents enable row level security;
alter table public.medical_documents enable row level security;

revoke all on table public.consents, public.medical_documents from anon, authenticated;
grant select on table public.consents, public.medical_documents to authenticated;
grant update (document_type, doctor_name, clinic_name, issue_date) on table public.medical_documents to authenticated;

create policy consents_select on public.consents for select to authenticated
  using (public.my_role(patient_id) is not null);

create policy medical_documents_select on public.medical_documents for select to authenticated
  using (deleted_at is null and public.has_role(patient_id, array['OWNER', 'CAREGIVER', 'VIEWER']));

create policy medical_documents_update on public.medical_documents for update to authenticated
  using (deleted_at is null and public.has_role(patient_id, array['OWNER', 'CAREGIVER']))
  with check (deleted_at is null and public.has_role(patient_id, array['OWNER', 'CAREGIVER']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical-documents', 'medical-documents', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

create policy medical_documents_files_read on storage.objects for select to authenticated
  using (bucket_id = 'medical-documents' and public.document_file_readable(name));

create policy medical_documents_files_read_unregistered on storage.objects for select to authenticated
  using (bucket_id = 'medical-documents' and public.unregistered_file_readable(name));

create policy medical_documents_files_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'medical-documents'
    and public.has_role(public.try_uuid((storage.foldername(name))[1]), array['OWNER', 'CAREGIVER'])
    and public.has_active_consent(public.try_uuid((storage.foldername(name))[1]))
  );

revoke all on function public.try_uuid(text) from public, anon;
revoke all on function public.try_date(text) from public, anon, authenticated;
revoke all on function public.has_active_consent(uuid) from public, anon;
revoke all on function public.document_file_readable(text) from public, anon;
revoke all on function public.unregistered_file_readable(text) from public, anon;
revoke all on function public.give_consent(uuid, text) from public, anon;
revoke all on function public.withdraw_consent(uuid) from public, anon;
revoke all on function public.register_document(uuid, uuid, text, integer, text, text, text, text, date) from public, anon;
revoke all on function public.claim_document_for_parse(uuid) from public, anon;
revoke all on function public.record_parse_result(uuid, boolean, jsonb, text) from public, anon;

grant execute on function public.try_uuid(text) to authenticated;
grant execute on function public.has_active_consent(uuid) to authenticated;
grant execute on function public.document_file_readable(text) to authenticated;
grant execute on function public.unregistered_file_readable(text) to authenticated;
grant execute on function public.give_consent(uuid, text) to authenticated;
grant execute on function public.withdraw_consent(uuid) to authenticated;
grant execute on function public.register_document(uuid, uuid, text, integer, text, text, text, text, date) to authenticated;
grant execute on function public.claim_document_for_parse(uuid) to authenticated;
grant execute on function public.record_parse_result(uuid, boolean, jsonb, text) to authenticated;
```

`try_uuid`, `has_active_consent`, `document_file_readable`, and `unregistered_file_readable` are granted to `authenticated` because the storage rules call them as the signed-in user.

There are two storage read rules. `medical_documents_files_read` lets OWNER, CAREGIVER, and VIEWER read a registered, non-deleted document's file. `medical_documents_files_read_unregistered` lets OWNER and CAREGIVER read a file in their patient's folder that has no document row yet; the register route needs this to check a file it has just received. A soft-deleted document's file matches neither rule, so nobody can read it.

Run:

```
npx supabase db reset
npm run db:types
```

**Check:** both succeed and `npm run typecheck` exits 0.

### Task 2 — Database tests

Create `supabase/tests/02_documents.test.sql`. The three helper functions at the top are the same as in `01_access.test.sql`.

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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

insert into public.patients (id, full_name, date_of_birth, created_by)
values ('00000000-0000-0000-0000-0000000000b1', 'Ramesh Test', '1957-03-04', '00000000-0000-0000-0000-0000000000a1');
insert into public.caregiver_links (patient_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'OWNER'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'CAREGIVER'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'VIEWER');
insert into public.patient_links (patient_id, user_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a4');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('medical-documents', '00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg')$$,
  '42501', null, 'FR-4.2 storage upload is refused without consent'
);
select throws_ok(
  $$select public.register_document('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'image/jpeg', 100, repeat('a', 64), 'PRESCRIPTION')$$,
  'P0001', 'CONSENT_REQUIRED', 'FR-4.2 registering is refused without consent'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select throws_ok(
  $$select public.give_consent('00000000-0000-0000-0000-0000000000b1', 'v1')$$,
  'P0001', 'FORBIDDEN', 'FR-4.2 a viewer cannot give consent'
);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select isnt(public.give_consent('00000000-0000-0000-0000-0000000000b1', 'v1'), null, 'FR-4.2 a caregiver gives consent');
select is(
  public.give_consent('00000000-0000-0000-0000-0000000000b1', 'v1'),
  (select id from public.consents where withdrawn_at is null),
  'FR-4.2 giving consent twice returns the same consent'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('medical-documents', '00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg')$$,
  'FR-4.1 storage upload works with consent'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('medical-documents', 'not-a-uuid/file.jpg')$$,
  '42501', null, 'FR-4.1 storage upload outside a patient folder is refused'
);
select is(
  (select count(*)::int from storage.objects where name = '00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg'),
  1,
  'FR-4.1 the uploader can read the file before it is registered'
);
select throws_ok(
  $$select public.register_document('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 'image/jpeg', 100, repeat('a', 64), 'PRESCRIPTION')$$,
  'P0001', 'VALIDATION_FAILED', 'FR-4.1 registering a file that was never uploaded is refused'
);
select throws_ok(
  $$select public.register_document('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'image/gif', 100, repeat('a', 64), 'PRESCRIPTION')$$,
  'P0001', 'VALIDATION_FAILED', 'FR-4.1 an unsupported type is refused'
);
select is(
  public.register_document('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'image/jpeg', 100, repeat('a', 64), 'PRESCRIPTION', ' Dr Test ', null, null),
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  'FR-4.1 a caregiver registers an uploaded file'
);
select is(
  (select extraction_status from public.medical_documents where id = '00000000-0000-0000-0000-0000000000c1'),
  'PENDING',
  'FR-5.1 a new document is PENDING'
);
select is(
  (public.claim_document_for_parse('00000000-0000-0000-0000-0000000000c1') ->> 'mime_type'),
  'image/jpeg',
  'FR-5.1 claiming returns the file details'
);
select throws_ok(
  $$select public.claim_document_for_parse('00000000-0000-0000-0000-0000000000c1')$$,
  'P0001', 'CONFLICT', 'FR-5.1 a second claim while PARSING is refused'
);
select is(
  public.record_parse_result(
    '00000000-0000-0000-0000-0000000000c1',
    true,
    '{"doctor_name":"Dr Other","clinic_name":"Synthetic Clinic","issue_date":"2026-11-01","medicines":[]}'::jsonb,
    null
  ),
  'PARSED',
  'FR-5.1 a valid result marks the document PARSED'
);
select throws_ok(
  $$select public.record_parse_result('00000000-0000-0000-0000-0000000000c1', true, '{}'::jsonb, null)$$,
  'P0001', 'CONFLICT', 'FR-5.1 recording twice is refused'
);
reset role;

select is(
  (select doctor_name || '|' || clinic_name || '|' || issue_date::text from public.medical_documents where id = '00000000-0000-0000-0000-0000000000c1'),
  'Dr Test|Synthetic Clinic|2026-11-01',
  'FR-4.6 empty details are filled from the AI answer and typed details are kept'
);
select is(
  (select count(*)::int from public.notifications where kind = 'DOCUMENT_PARSED' and user_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'FR-11.2 the owner is notified that the document was read'
);
select is(
  (select count(*)::int from public.notifications where kind = 'DOCUMENT_PARSED' and user_id = '00000000-0000-0000-0000-0000000000a2'),
  0,
  'FR-11.2 the person who ran it is not notified'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.medical_documents), 1, 'FR-4.3 a viewer sees the document');
select is((select count(*)::int from storage.objects where bucket_id = 'medical-documents'), 1, 'FR-4.3 a viewer can read the stored file');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
select is((select count(*)::int from public.medical_documents), 0, 'a patient does not see documents');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select is((select count(*)::int from storage.objects where bucket_id = 'medical-documents'), 0, 'an outsider cannot read stored files');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$select public.withdraw_consent('00000000-0000-0000-0000-0000000000b1')$$,
  'P0001', 'FORBIDDEN', 'FR-4.5 a caregiver cannot withdraw consent'
);
reset role;

update public.medical_documents set extraction_status = 'FAILED' where id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select public.withdraw_consent('00000000-0000-0000-0000-0000000000b1');
select throws_ok(
  $$select public.claim_document_for_parse('00000000-0000-0000-0000-0000000000c1')$$,
  'P0001', 'CONSENT_REQUIRED', 'FR-4.5 parsing stops after consent is withdrawn'
);
reset role;

select * from finish();
rollback;
```

**Check:** `npm run db:test` reports 35 + 25 = 60 tests passed.

If `insert into storage.objects` fails because a required column has no default in your Supabase version, add the missing column with a reasonable value in these test inserts only, and note it.

### Task 3 — Constants and file checks

Create `src/lib/documents/constants.ts`:

```ts
export const DOCUMENT_BUCKET = "medical-documents";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 5;
export const CONSENT_NOTICE_VERSION = "2026-11-v1";
export const DOCUMENT_TYPES = ["PRESCRIPTION", "LAB_REPORT", "DISCHARGE_SUMMARY", "OTHER"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
} as const;
export type DocumentMime = keyof typeof EXTENSION_BY_MIME;
export type DocumentExtension = (typeof EXTENSION_BY_MIME)[DocumentMime];
export const MIME_BY_EXTENSION: Record<DocumentExtension, DocumentMime> = {
  jpg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};
```

Create `src/lib/documents/file-check.ts`. It must not import any Node.js module, because the browser uses it too:

```ts
import { MAX_FILE_BYTES, type DocumentMime } from "./constants";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

export function detectFileType(bytes: Uint8Array): DocumentMime | null {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return "image/png";
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return "image/jpeg";
  }
  if (startsWith(bytes, PDF_SIGNATURE)) {
    return "application/pdf";
  }
  return null;
}

export type SizeProblem = "FILE_EMPTY" | "FILE_TOO_LARGE";

export function checkFileSize(size: number): SizeProblem | null {
  if (size <= 0) {
    return "FILE_EMPTY";
  }
  if (size > MAX_FILE_BYTES) {
    return "FILE_TOO_LARGE";
  }
  return null;
}
```

Create `src/lib/documents/pdf.ts`:

```ts
import "server-only";
import { PDFDocument } from "pdf-lib";
import { MAX_PDF_PAGES } from "./constants";

export type PdfProblem = "PDF_ENCRYPTED" | "PDF_TOO_LONG" | "UNSUPPORTED_FILE_TYPE";

export async function checkPdf(bytes: Uint8Array): Promise<PdfProblem | null> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (error instanceof Error && error.name === "EncryptedPDFError") {
      return "PDF_ENCRYPTED";
    }
    return "UNSUPPORTED_FILE_TYPE";
  }
  if (document.isEncrypted) {
    return "PDF_ENCRYPTED";
  }
  if (document.getPageCount() > MAX_PDF_PAGES) {
    return "PDF_TOO_LONG";
  }
  return null;
}
```

Check in the `pdf-lib` documentation that `PDFDocument.load` throws for encrypted files by default and that the error's name is `EncryptedPDFError`, and that `isEncrypted` exists. Note any difference.

`server-only` throws if imported by a client component. Vitest is not a React Server environment, so unit tests for `pdf.ts` and `client.ts` need the alias in task 9.

Create `src/lib/documents/digest.ts`:

```ts
import "server-only";
import { createHash } from "node:crypto";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
```

### Task 4 — Gemini prompt, schema, and analysis

Create `src/lib/gemini/prompt.ts`:

```ts
export const EXTRACTION_PROMPT = [
  "You read one photographed or scanned medical prescription and list every medicine written on it.",
  "Return only JSON that matches the response schema.",
  "Copy medicine names and strengths exactly as written. Do not correct spelling, do not substitute brands or generics, and do not add medicines that are not on the document.",
  "If a name or dosage cannot be read, use an empty string for it and set confidence to LOW.",
  "frequency_per_day is how many times a day the medicine is taken.",
  "Fill slots only when the timing is written. In patterns like 1-0-1 the positions are morning, afternoon, night: 1-0-1 means MORNING and EVENING, 1-1-1 means MORNING, AFTERNOON and EVENING, 0-0-1 means EVENING. Use BEDTIME only when the document says bedtime, HS, or at night before sleep.",
  "If the timing is not written, leave slots empty. Never guess.",
  "duration_days is the course length if written (for example 30 days, or 1 month as 30). Otherwise null.",
  "instructions holds directions as written, such as after food. Otherwise null.",
  "confidence is HIGH only when every field of that medicine is clearly legible, MEDIUM when one field is uncertain, LOW otherwise.",
  "doctor_name, clinic_name and issue_date (YYYY-MM-DD) come from the document header if present. Otherwise null.",
  "Do not add advice, warnings, diagnoses, or anything not written on the document.",
].join("\n");
```

This text is sent to the AI, not shown to users, so it is not in `strings`.

Create `src/lib/gemini/schema.ts`:

```ts
import { z } from "zod";

export const SLOTS = ["MORNING", "AFTERNOON", "EVENING", "BEDTIME"] as const;
export type Slot = (typeof SLOTS)[number];

export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    doctor_name: { type: "STRING", nullable: true },
    clinic_name: { type: "STRING", nullable: true },
    issue_date: { type: "STRING", nullable: true, description: "YYYY-MM-DD" },
    medicines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          dosage: { type: "STRING" },
          frequency_per_day: { type: "INTEGER" },
          slots: { type: "ARRAY", items: { type: "STRING", enum: [...SLOTS] } },
          duration_days: { type: "INTEGER", nullable: true },
          instructions: { type: "STRING", nullable: true },
          confidence: { type: "STRING", enum: ["HIGH", "MEDIUM", "LOW"] },
        },
        required: ["name", "dosage", "frequency_per_day", "slots", "confidence"],
      },
    },
  },
  required: ["medicines"],
} as const;

export const extractedMedicineSchema = z.object({
  name: z.string().max(255),
  dosage: z.string().max(64),
  frequency_per_day: z.number().int().min(1).max(6),
  slots: z.array(z.enum(SLOTS)).max(6),
  duration_days: z.number().int().min(1).max(365).nullable().optional(),
  instructions: z.string().max(1000).nullable().optional(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

export const extractionSchema = z.object({
  doctor_name: z.string().max(128).nullable().optional(),
  clinic_name: z.string().max(128).nullable().optional(),
  issue_date: z.string().max(10).nullable().optional(),
  medicines: z.array(extractedMedicineSchema).max(30),
});

export type ExtractedMedicine = z.infer<typeof extractedMedicineSchema>;
export type Extraction = z.infer<typeof extractionSchema>;

export type RowFlags = {
  missingField: boolean;
  slotMismatch: boolean;
  lowConfidence: boolean;
  needsAttention: boolean;
};

export function flagsFor(medicine: ExtractedMedicine): RowFlags {
  const uniqueSlots = new Set(medicine.slots);
  const missingField = medicine.name.trim() === "" || medicine.dosage.trim() === "";
  const slotMismatch = uniqueSlots.size !== medicine.frequency_per_day;
  const lowConfidence = medicine.confidence === "LOW";
  return { missingField, slotMismatch, lowConfidence, needsAttention: missingField || slotMismatch || lowConfidence };
}
```

Check the response schema format (upper-case type names, `nullable`, `enum`) against the Gemini API "structured output" documentation for the REST API. If the docs now prefer a different field (for example `responseJsonSchema` with standard JSON Schema), use what the docs say and note it.

### Task 5 — Gemini client and demo mode

Create `src/lib/gemini/client.ts`:

```ts
import "server-only";
import { EXTRACTION_PROMPT } from "./prompt";
import { GEMINI_RESPONSE_SCHEMA, extractionSchema, type Extraction } from "./schema";

export type ExtractFailureCode = "AI_UNAVAILABLE" | "AI_INVALID_OUTPUT" | "AI_BLOCKED" | "AI_NOT_CONFIGURED";

export type ExtractResult =
  | { ok: true; extraction: Extraction }
  | { ok: false; code: ExtractFailureCode; raw: Record<string, unknown> | null };

type GeminiRequest = {
  bytes: Uint8Array;
  mimeType: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const BLOCKED_FINISH_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

export async function extractWithGemini(request: GeminiRequest): Promise<ExtractResult> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: EXTRACTION_PROMPT },
          { inlineData: { mimeType: request.mimeType, data: Buffer.from(request.bytes).toString("base64") } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA,
    },
  };
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": request.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(request.timeoutMs ?? 30_000),
    });
  } catch {
    return { ok: false, code: "AI_UNAVAILABLE", raw: null };
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return { ok: false, code: "AI_NOT_CONFIGURED", raw: { status: response.status } };
  }
  if (!response.ok) {
    return { ok: false, code: "AI_UNAVAILABLE", raw: { status: response.status } };
  }
  let payload: GeminiResponse;
  try {
    payload = (await response.json()) as GeminiResponse;
  } catch {
    return { ok: false, code: "AI_INVALID_OUTPUT", raw: null };
  }
  if (payload.promptFeedback?.blockReason) {
    return { ok: false, code: "AI_BLOCKED", raw: { blockReason: payload.promptFeedback.blockReason } };
  }
  const candidate = payload.candidates?.[0];
  if (candidate?.finishReason && BLOCKED_FINISH_REASONS.has(candidate.finishReason)) {
    return { ok: false, code: "AI_BLOCKED", raw: { finishReason: candidate.finishReason } };
  }
  const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: "AI_INVALID_OUTPUT", raw: { text: text.slice(0, 20_000) } };
  }
  const validated = extractionSchema.safeParse(parsed);
  if (!validated.success) {
    return { ok: false, code: "AI_INVALID_OUTPUT", raw: { text: text.slice(0, 20_000) } };
  }
  return { ok: true, extraction: validated.data };
}
```

Check the endpoint path, the `x-goog-api-key` header, the `inlineData` part shape, and the finish reason names against the Gemini REST API reference. Note any difference.

Create `fixtures/gemini/prescription-1.json`:

```json
{
  "doctor_name": "Dr. A. Sharma (synthetic)",
  "clinic_name": "Synthetic Family Clinic, Mysuru",
  "issue_date": "2026-11-15",
  "medicines": [
    {
      "name": "Metformin",
      "dosage": "500 mg",
      "frequency_per_day": 2,
      "slots": ["MORNING", "EVENING"],
      "duration_days": 30,
      "instructions": "After food",
      "confidence": "HIGH"
    },
    {
      "name": "Amlodipine",
      "dosage": "5 mg",
      "frequency_per_day": 1,
      "slots": ["MORNING"],
      "duration_days": 30,
      "instructions": null,
      "confidence": "MEDIUM"
    },
    {
      "name": "Atorvastatin",
      "dosage": "10 mg",
      "frequency_per_day": 1,
      "slots": [],
      "duration_days": null,
      "instructions": "At night",
      "confidence": "LOW"
    }
  ]
}
```

The third row is deliberately incomplete so the demo shows a highlighted row.

Create `src/lib/gemini/extract.ts`:

```ts
import "server-only";
import demoPrescription from "../../../fixtures/gemini/prescription-1.json";
import { getEnv } from "@/lib/env";
import { extractWithGemini, type ExtractResult } from "./client";
import { extractionSchema } from "./schema";

export async function extractMedicines(bytes: Uint8Array, mimeType: string): Promise<ExtractResult> {
  const env = getEnv();
  if (env.demoMode) {
    return { ok: true, extraction: extractionSchema.parse(demoPrescription) };
  }
  if (!env.geminiApiKey || !env.geminiModel) {
    return { ok: false, code: "AI_NOT_CONFIGURED", raw: null };
  }
  return extractWithGemini({ bytes, mimeType, apiKey: env.geminiApiKey, model: env.geminiModel });
}
```

If importing the JSON file fails to type-check, make sure `tsconfig.json` has `"resolveJsonModule": true` (create-next-app sets it).

**Check:** `npm run typecheck` exits 0.

### Task 6 — Strings

Add to `src/strings/en.ts`:

```ts
  documents: {
    title: "Documents",
    empty: "No documents yet.",
    upload: "Add a document",
    uploadTitle: "Add a document",
    chooseFile: "Photo or PDF of the document",
    fileHint: "JPEG, PNG, or PDF. Up to 10 MB. PDFs up to 5 pages.",
    type: "Type of document",
    types: {
      PRESCRIPTION: "Prescription",
      LAB_REPORT: "Lab report",
      DISCHARGE_SUMMARY: "Discharge summary",
      OTHER: "Other",
    },
    doctorName: "Doctor's name",
    clinicName: "Clinic or hospital",
    issueDate: "Date on the document",
    uploading: "Uploading…",
    uploadButton: "Upload",
    statuses: {
      PENDING: "Not read yet",
      PARSING: "Reading…",
      PARSED: "Ready to check",
      FAILED: "Could not read",
      VERIFIED: "Checked and approved",
    },
    open: "Open",
    openPdf: "Open the PDF",
    previewFailed: "The preview could not be loaded. Reload the page to try again.",
    readWithAi: "Read with AI",
    reading: "Reading the document. This can take up to 30 seconds…",
    tryAgain: "Try again",
    detailsTitle: "Document details",
    saveDetails: "Save details",
    extractedTitle: "What the AI read",
    extractedIntro: "Check every row against the document. Nothing is used until you approve it.",
    demoBadge: "Demo mode: this answer is recorded, not read from your file.",
    noMedicines: "No medicines were found on this document.",
    columns: {
      name: "Medicine",
      dosage: "Dose",
      frequency: "Times a day",
      slots: "When",
      duration: "Days",
      instructions: "Directions",
      confidence: "AI confidence",
    },
    confidence: { HIGH: "High", MEDIUM: "Medium", LOW: "Low" },
    flags: {
      missingField: "Name or dose missing",
      slotMismatch: "Times do not match times a day",
      lowConfidence: "Hard to read",
    },
    checkPhoto: "Some rows were hard to read. Compare them carefully with the photo.",
    notSet: "Not set",
  },
  slots: {
    MORNING: "Morning",
    AFTERNOON: "Afternoon",
    EVENING: "Evening",
    BEDTIME: "Bedtime",
  },
  consent: {
    title: "Consent for documents",
    notice:
      "Documents you add for this person are stored privately in CareCircle. When you press Read with AI, the document is sent to Google's Gemini service to read the medicines. Only people you invite can see documents. You can delete documents at any time, and the owner can withdraw this consent at any time.",
    agree: "I agree",
    given: "Consent given on",
    withdraw: "Withdraw consent",
    confirmWithdraw: "Withdraw consent? No new documents can be added or read until consent is given again.",
    needed: "Consent is needed before adding documents.",
  },
```

Add a Documents tab to `PATIENT_TABS` in `src/lib/patients/tabs.ts`, after Overview:

```ts
  { href: (id) => `/patients/${id}/documents`, label: strings.tabs.documents, roles: ["OWNER", "CAREGIVER", "VIEWER"] },
```

and add `documents: "Documents",` to `strings.tabs`.

### Task 7 — Routes

Create `src/app/api/patients/[patientId]/consent/route.ts`:

```ts
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import { CONSENT_NOTICE_VERSION } from "@/lib/documents/constants";
import { isUuid } from "@/lib/ids";

export const POST = handleRoute<{ patientId: string }>(async (_request, { params }) => {
  if (!isUuid(params.patientId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { data, error } = await supabase.rpc("give_consent", {
    p_patient: params.patientId,
    p_notice_version: CONSENT_NOTICE_VERSION,
  });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ consentId: data }, 201);
});

export const DELETE = handleRoute<{ patientId: string }>(async (_request, { params }) => {
  if (!isUuid(params.patientId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { error } = await supabase.rpc("withdraw_consent", { p_patient: params.patientId });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ ok: true });
});
```

Create `src/app/api/patients/[patientId]/documents/route.ts`:

```ts
import { z } from "zod";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import { DOCUMENT_BUCKET, DOCUMENT_TYPES, MIME_BY_EXTENSION } from "@/lib/documents/constants";
import { sha256Hex } from "@/lib/documents/digest";
import { checkFileSize, detectFileType } from "@/lib/documents/file-check";
import { checkPdf } from "@/lib/documents/pdf";
import { isUuid, uuidSchema } from "@/lib/ids";
import { parseInput, readJsonBody } from "@/lib/validation";

const registerSchema = z.object({
  documentId: uuidSchema,
  extension: z.enum(["jpg", "png", "pdf"]),
  documentType: z.enum(DOCUMENT_TYPES),
  doctorName: z.string().trim().max(128).optional(),
  clinicName: z.string().trim().max(128).optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const POST = handleRoute<{ patientId: string }>(async (request, { params }) => {
  if (!isUuid(params.patientId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const input = parseInput(registerSchema, await readJsonBody(request));
  const path = `${params.patientId}/${input.documentId}.${input.extension}`;
  const { data: blob, error: downloadError } = await supabase.storage.from(DOCUMENT_BUCKET).download(path);
  if (downloadError || !blob) {
    throw appError("VALIDATION_FAILED");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sizeProblem = checkFileSize(bytes.byteLength);
  if (sizeProblem) {
    throw appError(sizeProblem);
  }
  const detected = detectFileType(bytes);
  if (!detected || detected !== MIME_BY_EXTENSION[input.extension]) {
    throw appError("UNSUPPORTED_FILE_TYPE");
  }
  if (detected === "application/pdf") {
    const pdfProblem = await checkPdf(bytes);
    if (pdfProblem) {
      throw appError(pdfProblem);
    }
  }
  const { data, error } = await supabase.rpc("register_document", {
    p_document: input.documentId,
    p_patient: params.patientId,
    p_mime_type: detected,
    p_size_bytes: bytes.byteLength,
    p_sha256: sha256Hex(bytes),
    p_document_type: input.documentType,
    p_doctor_name: input.doctorName ?? undefined,
    p_clinic_name: input.clinicName ?? undefined,
    p_issue_date: input.issueDate ?? undefined,
  });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ documentId: data }, 201);
});
```

A user without access cannot download the file (storage rules), so the download fails before any check. The download of a just-uploaded file works through the `medical_documents_files_read_unregistered` rule (task 1). The document row is only created after every check passes.

Create `src/app/api/documents/[documentId]/url/route.ts`:

```ts
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError } from "@/lib/db-errors";
import { DOCUMENT_BUCKET } from "@/lib/documents/constants";
import { isUuid } from "@/lib/ids";

export const GET = handleRoute<{ documentId: string }>(async (_request, { params }) => {
  if (!isUuid(params.documentId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { data: doc } = await supabase
    .from("medical_documents")
    .select("file_path, mime_type")
    .eq("id", params.documentId)
    .maybeSingle();
  if (!doc) {
    throw appError("NOT_FOUND");
  }
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(doc.file_path, 60);
  if (error || !data) {
    throw appError("NOT_FOUND");
  }
  return jsonOk({ url: data.signedUrl, mimeType: doc.mime_type, expiresInSeconds: 60 });
});
```

Create `src/app/api/documents/[documentId]/route.ts` with PATCH. Body schema: `documentType` (enum, optional), `doctorName`, `clinicName` (trimmed strings up to 128, optional; empty string becomes null), `issueDate` (`YYYY-MM-DD` or empty string → null, optional). At least one field required, otherwise `VALIDATION_FAILED`. Check the role with `my_role` on the document's patient (read `patient_id` from `medical_documents` first; missing row → `NOT_FOUND`; role not OWNER or CAREGIVER → `FORBIDDEN`). Update with `supabase.from("medical_documents").update({...}).eq("id", documentId)`. Map errors with `fromDb`.

Create `src/app/api/documents/[documentId]/parse/route.ts`:

```ts
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import { DOCUMENT_BUCKET } from "@/lib/documents/constants";
import { extractMedicines } from "@/lib/gemini/extract";
import { isUuid } from "@/lib/ids";

export const POST = handleRoute<{ documentId: string }>(async (_request, { params }) => {
  if (!isUuid(params.documentId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { data: claim, error: claimError } = await supabase.rpc("claim_document_for_parse", {
    p_document: params.documentId,
  });
  if (claimError) {
    throw fromDb(claimError);
  }
  const claimed = claim as { file_path: string; mime_type: string };
  const { data: blob } = await supabase.storage.from(DOCUMENT_BUCKET).download(claimed.file_path);
  const result = blob
    ? await extractMedicines(new Uint8Array(await blob.arrayBuffer()), claimed.mime_type)
    : ({ ok: false, code: "AI_UNAVAILABLE", raw: null } as const);
  const { data: status, error: recordError } = await supabase.rpc("record_parse_result", {
    p_document: params.documentId,
    p_ok: result.ok,
    p_raw: result.ok ? result.extraction : result.raw,
    p_error_code: result.ok ? undefined : result.code,
  });
  if (recordError) {
    throw fromDb(recordError);
  }
  return jsonOk({ status, code: result.ok ? null : result.code });
});
```

If the server stops between the claim and the record (for example a deploy), the document stays PARSING; after 2 minutes it can be claimed again (task 1).

If the generated types do not accept `null` or `undefined` for `p_raw` or `p_error_code`, pass `null` where the column allows it and adjust the call; do not use `any`.

**Check:** `npm run typecheck` and `npm run build` succeed.

### Task 8 — Pages and components

Create `src/components/documents/status-badge.tsx`: a `<span>` showing `strings.documents.statuses[status]`, with a border colour per status (PENDING `border-line`, PARSING `border-accent`, PARSED `border-warn`, FAILED `border-danger`, VERIFIED `border-ok`) and the same colour for the text. Rounded, padded, `text-base`.

Create `src/app/patients/[patientId]/documents/page.tsx` (server component). Specification:

- `loadPatientContext`. If role is PATIENT, `notFound()`.
- Consent: `supabase.from("consents").select("id, given_at").eq("patient_id", patientId).is("withdrawn_at", null).maybeSingle()`.
- Documents: `supabase.from("medical_documents").select("id, document_type, doctor_name, issue_date, extraction_status, created_at").eq("patient_id", patientId).order("created_at", { ascending: false })`.
- If role is OWNER or CAREGIVER, render `<ConsentPanel patientId consent role />`.
- If role is OWNER or CAREGIVER and consent exists, show a link-button `strings.documents.upload` to `/patients/{id}/documents/upload`.
- List each document as a link to `/patients/{id}/documents/{documentId}` showing type label, doctor name (or `notSet`), issue date (or upload date), and `StatusBadge`.
- Empty list: `strings.documents.empty`.

Create `src/app/patients/[patientId]/documents/consent-panel.tsx` (client). Specification:

- Props: `patientId`, `consent: { given_at: string } | null`, `role`.
- No consent: show `strings.consent.title`, the full `strings.consent.notice`, and an "I agree" button calling POST `/api/patients/{id}/consent`, then `router.refresh()`.
- Consent given: show `strings.consent.given` and the date (local format). If role is OWNER, a "Withdraw consent" button that confirms with `strings.consent.confirmWithdraw`, then calls DELETE on the same URL and `router.refresh()`.
- Errors via `ErrorMessage`.

Create `src/app/patients/[patientId]/documents/upload/page.tsx`: `loadPatientContext`; role must be OWNER or CAREGIVER, otherwise `notFound()`; if there is no active consent, `redirect` to `/patients/{id}/documents`; render heading `strings.documents.uploadTitle` and `<UploadForm patientId />`.

Create `src/app/patients/[patientId]/documents/upload/upload-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi, type ApiFailure } from "@/lib/client/call-api";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DOCUMENT_BUCKET, DOCUMENT_TYPES, EXTENSION_BY_MIME, type DocumentType } from "@/lib/documents/constants";
import { checkFileSize, detectFileType } from "@/lib/documents/file-check";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { ErrorMessage } from "@/components/error-message";
import { strings } from "@/strings/en";

export function UploadForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>("PRESCRIPTION");
  const [doctorName, setDoctorName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError({ code: "VALIDATION_FAILED" });
      return;
    }
    const sizeProblem = checkFileSize(file.size);
    if (sizeProblem) {
      setError({ code: sizeProblem });
      return;
    }
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const mime = detectFileType(head);
    if (!mime) {
      setError({ code: "UNSUPPORTED_FILE_TYPE" });
      return;
    }
    setBusy(true);
    const documentId = crypto.randomUUID();
    const extension = EXTENSION_BY_MIME[mime];
    const supabase = createSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(`${patientId}/${documentId}.${extension}`, file, { contentType: mime, upsert: false });
    if (uploadError) {
      setBusy(false);
      setError({ code: "FORBIDDEN" });
      return;
    }
    const result = await callApi<{ documentId: string }>(`/api/patients/${patientId}/documents`, "POST", {
      documentId,
      extension,
      documentType,
      doctorName: doctorName.trim() || undefined,
      clinicName: clinicName.trim() || undefined,
      issueDate: issueDate || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/patients/${patientId}/documents/${result.data.documentId}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="font-semibold">{strings.documents.chooseFile}</label>
        <input
          id="file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          required
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="min-h-12 text-lg"
        />
        <p className="text-base text-muted">{strings.documents.fileHint}</p>
      </div>
      <SelectField id="documentType" label={strings.documents.type} value={documentType} onChange={(event) => setDocumentType(event.target.value as DocumentType)}>
        {DOCUMENT_TYPES.map((type) => (
          <option key={type} value={type}>{strings.documents.types[type]}</option>
        ))}
      </SelectField>
      <TextField id="doctorName" label={strings.documents.doctorName} value={doctorName} maxLength={128} onChange={(event) => setDoctorName(event.target.value)} />
      <TextField id="clinicName" label={strings.documents.clinicName} value={clinicName} maxLength={128} onChange={(event) => setClinicName(event.target.value)} />
      <TextField id="issueDate" label={strings.documents.issueDate} type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
      <ErrorMessage error={error} />
      <Button type="submit" disabled={busy}>{busy ? strings.documents.uploading : strings.documents.uploadButton}</Button>
    </form>
  );
}
```

Create `src/components/documents/document-preview.tsx` (client). Specification:

- Props: `documentId`, `mimeType`.
- On mount, call `callApi<{ url: string }>(\`/api/documents/${documentId}/url\`, "GET")`.
- Image: `<img src={url} alt={strings.documents.previewAlt} className="max-h-[70vh] w-full rounded-lg border border-line object-contain" />`. Use a plain `img`, because the URL is short-lived and image optimisation would cache a link that expires. The Next.js linter may print a warning for `<img>`; a warning is acceptable here. Do not add a rule-suppression comment. Add `previewAlt: "The uploaded document",` to `strings.documents`.
- PDF: show an `<iframe src={url} title={strings.documents.openPdf} className="h-[70vh] w-full rounded-lg border border-line" />` and below it a link `strings.documents.openPdf` that opens a fresh signed URL in a new tab (fetch a new URL on click, then `window.open`).
- If the image fails to load (the link expired after 60 seconds, for example on a slow phone), fetch a new URL once. If it fails again, show `strings.documents.previewFailed`.

Create `src/components/documents/document-details-form.tsx` (client): fields type, doctor, clinic, issue date with current values; Save calls PATCH `/api/documents/{id}`; `router.refresh()` on success; read-only text instead of fields when `canEdit` is false.

Create `src/components/documents/parse-button.tsx` (client): props `documentId`, `status`. Shows `strings.documents.readWithAi` when status is PENDING and `strings.documents.tryAgain` when FAILED. On click, set busy and show `strings.documents.reading`, call POST `/api/documents/{id}/parse`, then `router.refresh()`. If the response has `status: "FAILED"`, show `strings.errors[code]`. If the call itself fails, show `ErrorMessage`.

Create `src/components/documents/extraction-table.tsx` (server component). Specification:

- Props: `extraction: Extraction`, `demoMode: boolean`.
- If `demoMode`, show `<Notice tone="warning">{strings.documents.demoBadge}</Notice>` first.
- Heading `strings.documents.extractedTitle` and `strings.documents.extractedIntro`.
- If any row `needsAttention`, show `<Notice tone="warning">{strings.documents.checkPhoto}</Notice>`.
- On screens 768 px and wider: a table with the columns in `strings.documents.columns`. On smaller screens: one card per medicine with the same labels. Use Tailwind `hidden md:table` and `md:hidden` to switch.
- Slots shown as `strings.slots[slot]` joined by ", "; empty → `strings.documents.notSet`.
- Each row that `needsAttention` has `border-l-4 border-warn` and lists the matching `strings.documents.flags` labels in text (not colour alone).
- Empty `medicines`: `strings.documents.noMedicines`.

Create `src/app/patients/[patientId]/documents/[documentId]/page.tsx` (server component). Specification:

- `loadPatientContext`; role PATIENT → `notFound()`. Validate `documentId` with `isUuid` → `notFound()`.
- Load the document (`select *`); missing → `notFound()`.
- Layout: two columns on screens 1024 px and wider (`lg:grid lg:grid-cols-2 lg:gap-6`), one column below.
  - Left: `<DocumentPreview />`, then `<DocumentDetailsForm canEdit={role is OWNER or CAREGIVER} />`.
  - Right: `<StatusBadge />`; if role is OWNER or CAREGIVER and status is PENDING or FAILED, `<ParseButton />`; if status is FAILED and `extraction_error` is set, show `strings.errors[extraction_error]`; if status is PARSED or VERIFIED and `extraction_raw` passes `extractionSchema.safeParse`, `<ExtractionTable extraction demoMode={getEnv().demoMode} />`.
- P3 adds the approval editor to the right column for PARSED documents.

**Check:** `npm run build` succeeds. By hand (demo mode on): give consent, upload any JPEG, open it, press "Read with AI", see three rows with the third highlighted and the demo notice.

### Task 9 — Unit tests

Add the `server-only` alias to `vitest.config.ts` so server files can be imported in tests. Create `src/test/empty-module.ts` containing:

```ts
export {};
```

and change the `resolve.alias` in `vitest.config.ts` to:

```ts
alias: {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "server-only": fileURLToPath(new URL("./src/test/empty-module.ts", import.meta.url)),
},
```

Create `src/test/file-check.test.ts`:

- `FR-4.1` PNG signature bytes → `image/png`; JPEG `ff d8 ff e0` → `image/jpeg`; `%PDF-1.7` → `application/pdf`.
- `MZ` (Windows executable start, `0x4d 0x5a`) → `null`. `GIF89a` → `null`. Empty array → `null`. Only `0x89 0x50` (truncated PNG) → `null`.
- `checkFileSize(0)` → `FILE_EMPTY`; `10 * 1024 * 1024` → `null`; `10 * 1024 * 1024 + 1` → `FILE_TOO_LARGE`.

Create `src/test/pdf.test.ts` (build PDFs in the test with `pdf-lib`):

- `FR-4.1` a 1-page PDF → `null`; a 5-page PDF → `null`; a 6-page PDF → `PDF_TOO_LONG`; random bytes starting with `%PDF-` → `UNSUPPORTED_FILE_TYPE`.
- Encrypted PDFs cannot be created with `pdf-lib`; test that case by hand in task 12 with a password-protected PDF exported from any PDF tool.

Create `src/test/gemini-schema.test.ts`:

- The demo fixture passes `extractionSchema`.
- `frequency_per_day: 0` fails; `slots: ["NIGHT"]` fails; `confidence: "SURE"` fails; 31 medicines fail.
- `flagsFor`: the fixture's first row has no flags; the third row has `slotMismatch` and `lowConfidence`; a row with `name: " "` has `missingField`; `slots: ["MORNING","MORNING"]` with frequency 2 has `slotMismatch` (duplicates do not count twice).

Create `src/test/gemini-client.test.ts`. Pass a fake `fetchImpl` that returns a prepared `Response`:

- `FR-5.1` a 200 response whose `candidates[0].content.parts[0].text` is the fixture JSON → `ok: true` with 3 medicines.
- The request sent has header `x-goog-api-key`, URL containing the model ID, and `generationConfig.responseMimeType` `application/json`.
- Status 429 → `AI_UNAVAILABLE`. Status 404 → `AI_NOT_CONFIGURED`. Status 403 → `AI_NOT_CONFIGURED`.
- `promptFeedback.blockReason: "SAFETY"` → `AI_BLOCKED`. `finishReason: "SAFETY"` → `AI_BLOCKED`.
- Text `"not json"` → `AI_INVALID_OUTPUT` with `raw.text` set.
- Valid JSON that fails the schema → `AI_INVALID_OUTPUT`.
- A `fetchImpl` that rejects with an `AbortError` (timeout) → `AI_UNAVAILABLE`.
- With `timeoutMs: 10` and a `fetchImpl` that waits for the abort signal, the result is `AI_UNAVAILABLE` within one second.

**Check:** `npm test` passes.

### Task 10 — Synthetic prescription file

Create a synthetic prescription for demos and the real-model check:

1. On paper, write a prescription header "Dr. A. Sharma (synthetic) — Synthetic Family Clinic, Mysuru — 15/11/2026", the patient name "Ramesh Demo", and these lines:
   - `Tab. Metformin 500 mg   1-0-1   after food   x 30 days`
   - `Tab. Amlodipine 5 mg    1-0-0   x 30 days`
   - `Tab. Atorvastatin 10 mg  HS`
2. Photograph it in good light and save it as `fixtures/documents/synthetic-prescription-1.jpg`, under 3 MB.

Never use a real prescription.

### Task 11 — Browser tests

Create `e2e/documents.spec.ts`. Tests run with `DEMO_MODE=true`. Use `page.setInputFiles` with a buffer so tests do not depend on the photo:

```ts
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
await page.setInputFiles("#file", { name: "prescription.png", mimeType: "image/png", buffer: PNG_BYTES });
```

Tests:

1. `FR-4.2 upload is not offered before consent`: owner opens Documents; no upload link; consent notice visible.
2. `FR-4.2 FR-4.1 FR-5.1 owner consents, uploads, and reads with AI`: press "I agree", upload the PNG buffer as a prescription, land on the document page with "Not read yet", press "Read with AI", see "Ready to check", three rows, the demo notice, and "Hard to read" on the Atorvastatin row.
3. `FR-4.1 a renamed text file is refused`: upload `Buffer.from("hello")` named `x.png`; see `strings.errors.UNSUPPORTED_FILE_TYPE`; no new document in the list.
4. `FR-4.1 an oversize file is refused`: upload a buffer of `10 * 1024 * 1024 + 1` bytes that starts with the PNG signature; see `strings.errors.FILE_TOO_LARGE`.
5. `FR-4.3 a viewer can open the signed link and an outsider cannot`: with the document from test 2 (or created in the test), `page.request.get("/api/documents/{id}/url")` as the viewer returns 200 and `expiresInSeconds: 60`; as an outsider it returns 404.
6. `FR-4.6 owner edits the document details`: change the doctor name, save, reload, see the new name.
7. `FR-4.5 withdrawn consent hides upload`: owner withdraws; the upload link disappears; going to the upload URL redirects to Documents.

Run `npm run db:reset` first.

**Check:** `npm run test:e2e` passes.

### Task 12 — Real-model check (by hand)

1. Set `DEMO_MODE=false` in `.env.local`. Make sure `GEMINI_MODEL` and `GEMINI_API_KEY` are set.
2. `npm run dev`. Upload `fixtures/documents/synthetic-prescription-1.jpg`. Press "Read with AI".
3. Expected: status "Ready to check" within 30 seconds; Metformin 500 mg with Morning and Evening; Amlodipine 5 mg with Morning; Atorvastatin 10 mg with Bedtime (HS). Small differences are fine; the review step exists for them.
4. Upload a password-protected PDF. Expected: `strings.errors.PDF_ENCRYPTED`.
5. Temporarily set `GEMINI_MODEL=not-a-model`, restart, read again. Expected: "Could not read" with `strings.errors.AI_NOT_CONFIGURED`. Restore the real ID.
6. Set `DEMO_MODE=true` again.

Write the results, including the model ID, in the Exit log.

---

## Exit checks

| Command | Expected |
|---|---|
| `npm run db:reset` | no error |
| `npm run db:test` | 60 passed |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | all pass |
| `npm run build` | succeeds |
| `npm run test:e2e` | all pass |
| Task 12 by hand | all five expectations met |

## Exit log

```
(Gemini model ID, pass lines, task 12 results)
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

- Approving medicines, schedules, times (P3).
- Deleting documents and purging orphaned files (P6).
- Rate limiting parse calls (P6).
