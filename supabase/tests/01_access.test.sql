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
