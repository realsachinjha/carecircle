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
