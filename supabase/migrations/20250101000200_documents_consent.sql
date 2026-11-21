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
