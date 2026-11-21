# Phase 6 — Hardening, staging, and submission

## Goal

Finish the privacy and security work (rate limits, export, deletion, 30-day purge, security headers), prove the database is locked down with automated checks, set up the staging Supabase project and Amplify for the real demo, load synthetic demo data, and pass the full golden path by hand on staging.

## Requirements covered

FR-2.3, FR-2.4, FR-4.4, PRD sections 9, 10 (security, performance), 11, 13.2.

## Before you start

- Phase 5 exit checks pass.
- You have the staging Supabase project from P0 and the Amplify app.

## Files this phase creates or changes

| Path | Purpose |
|---|---|
| `supabase/migrations/20250101000600_hardening.sql` | rate limits, delete, export, purge helpers |
| `supabase/tests/06_hardening.test.sql` | lock-down checks and tests |
| `src/lib/supabase/database.types.ts` | regenerated |
| `src/app/api/documents/[documentId]/parse/route.ts` | rate limit |
| `src/app/api/patients/[patientId]/invites/route.ts` | rate limit |
| `src/app/api/invites/accept/route.ts` | rate limit |
| `src/app/api/patients/[patientId]/route.ts` | DELETE |
| `src/app/api/patients/[patientId]/export/route.ts` | GET export |
| `src/app/api/documents/[documentId]/route.ts` | DELETE |
| `src/app/patients/[patientId]/edit/danger-zone.tsx` | export and delete patient |
| `src/components/documents/delete-document-button.tsx` | delete document |
| `next.config.ts` | security headers |
| `src/app/error.tsx`, `src/app/not-found.tsx` | error pages |
| `scripts/purge-deleted.ts` | daily purge |
| `scripts/seed-demo.ts` | synthetic demo data |
| `.github/workflows/purge.yml` | runs the purge daily |
| `e2e/a11y.spec.ts`, `e2e/privacy.spec.ts`, `e2e/golden-path.spec.ts` | final browser tests |
| `docs/demo-script.md` | the live demo |
| `README.md` (app root) | project README for judges |

---

## Tasks

### Task 1 — Migration

Create `supabase/migrations/20250101000600_hardening.sql`:

```sql
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

create or replace function public.check_rate_limit(p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  limit_count integer;
  window_seconds integer;
  bucket timestamptz;
  used integer;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  case p_action
    when 'PARSE' then
      limit_count := 20;
      window_seconds := 3600;
    when 'INVITE_CREATE' then
      limit_count := 20;
      window_seconds := 3600;
    when 'INVITE_ACCEPT' then
      limit_count := 10;
      window_seconds := 600;
    else
      raise exception 'VALIDATION_FAILED';
  end case;
  bucket := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);
  insert into public.rate_limits (key, window_start, hits)
  values (p_action || ':' || auth.uid()::text, bucket, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into used;
  if used > limit_count then
    raise exception 'RATE_LIMITED';
  end if;
end;
$$;

create or replace function public.soft_delete_patient(p_patient uuid)
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
  update public.patients set deleted_at = now() where id = p_patient and deleted_at is null;
end;
$$;

create or replace function public.soft_delete_document(p_document uuid)
returns void
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
  if not public.has_role(doc.patient_id, array['OWNER']) then
    raise exception 'FORBIDDEN';
  end if;
  update public.medical_documents set deleted_at = now() where id = doc.id;
end;
$$;

create or replace function public.export_patient(p_patient uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if public.my_role(p_patient) is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_role(p_patient, array['OWNER', 'CAREGIVER']) then
    raise exception 'FORBIDDEN';
  end if;
  select jsonb_build_object(
    'exportedAt', now(),
    'patient', (select to_jsonb(p) - 'deleted_at' from public.patients p where p.id = p_patient),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('role', cl.role, 'status', cl.status, 'name', pr.full_name, 'email', pr.email, 'since', cl.created_at))
      from public.caregiver_links cl join public.profiles pr on pr.id = cl.user_id
      where cl.patient_id = p_patient
    ), '[]'::jsonb),
    'patientLogin', (
      select jsonb_build_object('name', pr.full_name, 'email', pr.email, 'since', pl.created_at)
      from public.patient_links pl join public.profiles pr on pr.id = pl.user_id
      where pl.patient_id = p_patient
    ),
    'consents', coalesce((select jsonb_agg(to_jsonb(c)) from public.consents c where c.patient_id = p_patient), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(to_jsonb(d) - 'deleted_at') from public.medical_documents d
      where d.patient_id = p_patient and d.deleted_at is null
    ), '[]'::jsonb),
    'medications', coalesce((select jsonb_agg(to_jsonb(m)) from public.medications m where m.patient_id = p_patient), '[]'::jsonb),
    'schedules', coalesce((select jsonb_agg(to_jsonb(s)) from public.medication_schedules s where s.patient_id = p_patient), '[]'::jsonb),
    'doses', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.scheduled_for) from public.medication_reminders r where r.patient_id = p_patient
    ), '[]'::jsonb),
    'checkups', coalesce((select jsonb_agg(to_jsonb(cs)) from public.checkup_schedules cs where cs.patient_id = p_patient), '[]'::jsonb),
    'checkupCompletions', coalesce((select jsonb_agg(to_jsonb(cc)) from public.checkup_completions cc where cc.patient_id = p_patient), '[]'::jsonb)
  ) into result;
  insert into public.audit_logs (actor_id, patient_id, action, target_table, target_id, ip)
  values (auth.uid(), p_patient, 'EXPORT', 'patients', p_patient, public.request_ip());
  return result;
end;
$$;

create or replace function public.purge_candidates()
returns table (path text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.file_path
  from public.medical_documents d
  join public.patients p on p.id = d.patient_id
  where d.deleted_at < now() - interval '30 days' or p.deleted_at < now() - interval '30 days'
  union
  select o.name
  from storage.objects o
  where o.bucket_id = 'medical-documents'
    and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.medical_documents d where d.file_path = o.name);
$$;

create or replace function public.purge_finish()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  documents_deleted integer;
  patients_deleted integer;
begin
  delete from public.medical_documents d
  using public.patients p
  where p.id = d.patient_id
    and (d.deleted_at < now() - interval '30 days' or p.deleted_at < now() - interval '30 days')
    and not exists (select 1 from storage.objects o where o.bucket_id = 'medical-documents' and o.name = d.file_path);
  get diagnostics documents_deleted = row_count;
  delete from public.patients p
  where p.deleted_at < now() - interval '30 days'
    and not exists (select 1 from public.medical_documents d where d.patient_id = p.id);
  get diagnostics patients_deleted = row_count;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return jsonb_build_object('documents', documents_deleted, 'patients', patients_deleted);
end;
$$;

revoke all on function public.check_rate_limit(text) from public, anon;
revoke all on function public.soft_delete_patient(uuid) from public, anon;
revoke all on function public.soft_delete_document(uuid) from public, anon;
revoke all on function public.export_patient(uuid) from public, anon;
revoke all on function public.purge_candidates() from public, anon, authenticated;
revoke all on function public.purge_finish() from public, anon, authenticated;

grant execute on function public.check_rate_limit(text) to authenticated;
grant execute on function public.soft_delete_patient(uuid) to authenticated;
grant execute on function public.soft_delete_document(uuid) to authenticated;
grant execute on function public.export_patient(uuid) to authenticated;
grant execute on function public.purge_candidates() to service_role;
grant execute on function public.purge_finish() to service_role;
```

How the purge works:

1. `purge_candidates` lists files to remove: files of documents deleted more than 30 days ago, files of patients deleted more than 30 days ago, and files uploaded more than a day ago that were never registered.
2. The purge script removes those files through the storage API (task 6).
3. `purge_finish` deletes document rows whose files are gone, then patients deleted more than 30 days ago that have no documents left. Deleting a patient removes every row that belongs to them. The audit trigger writes nothing for a patient that no longer exists (P1).

Files are removed before rows. If removing files fails, the rows stay and the next run tries again.

Run `npx supabase db reset` and `npm run db:types`.

**Check:** both succeed.

### Task 2 — Lock-down tests

Create `supabase/tests/06_hardening.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

select is_empty(
  $$select tablename from pg_tables where schemaname = 'public' and not rowsecurity$$,
  'every public table has row-level security on'
);
select is_empty(
  $$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')$$,
  'anonymous visitors cannot run any public function'
);
select is_empty(
  $$select tablename from pg_tables where schemaname = 'public'
    and (has_table_privilege('anon', format('public.%I', tablename), 'SELECT')
      or has_table_privilege('anon', format('public.%I', tablename), 'INSERT')
      or has_table_privilege('anon', format('public.%I', tablename), 'UPDATE')
      or has_table_privilege('anon', format('public.%I', tablename), 'DELETE'))$$,
  'anonymous visitors have no table privileges'
);
select is_empty(
  $$select tablename from pg_tables where schemaname = 'public'
    and (has_table_privilege('authenticated', format('public.%I', tablename), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', tablename), 'DELETE'))$$,
  'signed-in users cannot insert or delete rows directly; all writes go through checked functions'
);
select ok(
  not has_function_privilege('authenticated', 'public.purge_finish()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.purge_candidates()', 'EXECUTE'),
  'signed-in users cannot run the purge'
);

select pg_temp.make_user('00000000-0000-0000-0000-0000000000a1', 'owner@test.local');
select pg_temp.make_user('00000000-0000-0000-0000-0000000000a2', 'care@test.local');
select pg_temp.make_user('00000000-0000-0000-0000-0000000000a3', 'viewer@test.local');

insert into public.patients (id, full_name, date_of_birth, created_by)
values ('00000000-0000-0000-0000-0000000000b1', 'Ramesh Test', '1957-03-04', '00000000-0000-0000-0000-0000000000a1');
insert into public.caregiver_links (patient_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'OWNER'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'CAREGIVER'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'VIEWER');
insert into public.medical_documents (id, patient_id, uploaded_by, file_path, mime_type, size_bytes, sha256, document_type)
values (
  '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg', 'image/jpeg', 100, repeat('a', 64), 'PRESCRIPTION'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$select public.check_rate_limit('PARSE') from generate_series(1, 20)$$, 'the first 20 parse calls in an hour are allowed');
select throws_ok($$select public.check_rate_limit('PARSE')$$, 'P0001', 'RATE_LIMITED', 'the 21st parse call in an hour is refused');
select throws_ok($$select public.check_rate_limit('ANYTHING')$$, 'P0001', 'VALIDATION_FAILED', 'an unknown rate-limit action is refused');
select throws_ok($$select public.soft_delete_patient('00000000-0000-0000-0000-0000000000b1')$$, 'P0001', 'FORBIDDEN', 'FR-2.3 a caregiver cannot delete a patient');
select ok(
  public.export_patient('00000000-0000-0000-0000-0000000000b1') ?& array['patient', 'people', 'consents', 'documents', 'medications', 'schedules', 'doses', 'checkups'],
  'FR-2.4 a caregiver exports every section'
);
reset role;

select is((select count(*)::int from public.audit_logs where action = 'EXPORT'), 1, 'FR-2.4 the export is audited');

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$select public.export_patient('00000000-0000-0000-0000-0000000000b1')$$, 'P0001', 'FORBIDDEN', 'FR-2.4 a viewer cannot export');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.soft_delete_document('00000000-0000-0000-0000-0000000000c1')$$, 'FR-4.4 the owner deletes a document');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from public.medical_documents), 0, 'FR-4.4 a deleted document disappears for everyone');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.soft_delete_patient('00000000-0000-0000-0000-0000000000b1')$$, 'FR-2.3 the owner deletes a patient');
select is((select count(*)::int from public.patients), 0, 'FR-2.3 the deleted patient disappears for the owner');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.patients), 0, 'FR-2.3 the deleted patient disappears for the caregiver');
reset role;

update public.medical_documents set deleted_at = now() - interval '31 days' where id = '00000000-0000-0000-0000-0000000000c1';
update public.patients set deleted_at = now() - interval '31 days' where id = '00000000-0000-0000-0000-0000000000b1';
select is(
  (select count(*)::int from public.purge_candidates() where path = '00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg'),
  1,
  'FR-4.4 a document deleted 31 days ago is listed for purging'
);
select is(
  public.purge_finish(),
  '{"documents": 1, "patients": 1}'::jsonb,
  'FR-2.3 FR-4.4 the purge removes the document row and then the patient'
);

select * from finish();
rollback;
```

**Check:** `npm run db:test` reports 139 + 19 = 158 passed.

If the "no public function is executable by anon" check fails, the output lists the function names. Add the missing `revoke all on function ... from public, anon;` in a new migration (do not edit applied ones), then run again.

### Task 3 — Wire rate limits

In each of these routes, call the rate limit right after `requireApiUser()` and before any other work:

```ts
const { error: limitError } = await supabase.rpc("check_rate_limit", { p_action: "PARSE" });
if (limitError) {
  throw fromDb(limitError);
}
```

| Route | `p_action` |
|---|---|
| `src/app/api/documents/[documentId]/parse/route.ts` | `PARSE` |
| `src/app/api/patients/[patientId]/invites/route.ts` | `INVITE_CREATE` |
| `src/app/api/invites/accept/route.ts` | `INVITE_ACCEPT` |

Supabase Auth already limits how often sign-in emails can be sent. Check the limits in the dashboard (Authentication, Rate Limits) on staging and write them in the Exit log.

### Task 4 — Export, delete patient, delete document

Add strings:

```ts
  privacy: {
    dangerTitle: "Data and deletion",
    export: "Download all data (JSON)",
    exportHint: "A file with everything stored about this person in CareCircle.",
    deletePatient: "Delete this person",
    deletePatientHint: "Everyone loses access at once. All data is removed for good after 30 days.",
    typeNameToConfirm: "Type the person's full name to confirm",
    deleteDocument: "Delete document",
    confirmDeleteDocument: "Delete this document? Nobody will be able to see it. The file is removed for good after 30 days.",
  },
```

Create `src/app/api/patients/[patientId]/export/route.ts`:

```ts
import { handleRoute } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";

export const GET = handleRoute<{ patientId: string }>(async (_request, { params }) => {
  if (!isUuid(params.patientId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { data, error } = await supabase.rpc("export_patient", { p_patient: params.patientId });
  if (error) {
    throw fromDb(error);
  }
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="carecircle-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
```

Add `DELETE` to `src/app/api/patients/[patientId]/route.ts` calling `soft_delete_patient({ p_patient })`, and `DELETE` to `src/app/api/documents/[documentId]/route.ts` calling `soft_delete_document({ p_document })`. Both return `jsonOk({ ok: true })`.

Create `src/app/patients/[patientId]/edit/danger-zone.tsx` (client), shown on the edit page only to the OWNER (the export link is shown to OWNER and CAREGIVER):

- A `Card` titled `strings.privacy.dangerTitle`.
- A link styled as a secondary button to `/api/patients/{id}/export` with the `download` attribute, and `exportHint` below.
- OWNER only: a text field labelled `typeNameToConfirm`, and a danger button `deletePatient` that stays disabled until the typed text equals the patient's full name exactly (after trimming). On click: DELETE `/api/patients/{id}`, then `router.replace("/patients")` and `router.refresh()`.

Create `src/components/documents/delete-document-button.tsx` (client): OWNER only, on the document page; confirm with `confirmDeleteDocument`; DELETE `/api/documents/{id}`; then go to the documents list.

**Check:** `npm run build` succeeds.

### Task 5 — Security headers and error pages

Replace `next.config.ts` with:

```ts
import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
const supabaseSocket = supabaseOrigin.replace(/^http/, "ws");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  `frame-src ${supabaseOrigin}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseSocket}`,
  "font-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const headers =
      process.env.NODE_ENV === "production"
        ? [...securityHeaders, { key: "Content-Security-Policy", value: contentSecurityPolicy }]
        : securityHeaders;
    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;
```

If `next.config.ts` already has other settings from earlier phases, keep them and add these.

The policy allows inline scripts because Next.js uses them; it still blocks scripts from other sites, framing of the app, and connections anywhere except the app and Supabase. The policy applies only to production builds because the development server needs extra permissions.

The file picker in the upload form opens the phone's camera through the operating system, which `camera=()` does not block. Check this on a phone in task 10.

Create `src/app/not-found.tsx`: heading "We could not find that page" (add to strings), a link to `/start`.

Create `src/app/error.tsx` (client component, as required by Next.js): heading from strings, the `digest` value as the reference when present, and a "Try again" button calling `reset()`. Show no error message text from the exception.

**Check:** `npm run build && npm run start`; open `/`, `/sign-in`, a patient page, a document preview, and `/me`; the browser console shows no "Content Security Policy" errors. `curl -sI http://localhost:3000/` shows the headers above.

### Task 6 — Purge script and schedule

Install the script runner:

```
npm install -D tsx
```

Create `scripts/purge-deleted.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

const BUCKET = "medical-documents";
const BATCH = 100;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function main() {
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: candidates, error } = await supabase.rpc("purge_candidates");
  if (error) {
    throw new Error(`purge_candidates failed: ${error.code}`);
  }
  const paths = (candidates ?? []).map((row: { path: string }) => row.path);
  for (let start = 0; start < paths.length; start += BATCH) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths.slice(start, start + BATCH));
    if (removeError) {
      throw new Error(`storage remove failed at batch ${start / BATCH}`);
    }
  }
  const { data: finished, error: finishError } = await supabase.rpc("purge_finish");
  if (finishError) {
    throw new Error(`purge_finish failed: ${finishError.code}`);
  }
  console.log(JSON.stringify({ filesRemoved: paths.length, ...(finished as object) }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "purge failed");
  process.exit(1);
});
```

The script logs counts only, never file names.

Add to `package.json` scripts:

```json
"purge": "tsx --env-file=.env.local scripts/purge-deleted.ts",
"seed:demo": "tsx --env-file=.env.local scripts/seed-demo.ts"
```

If your `tsx` version does not support `--env-file`, use `node --env-file=.env.local --import tsx scripts/...` and note it.

Create `.github/workflows/purge.yml`:

```yaml
name: purge
on:
  schedule:
    - cron: "30 21 * * *"
  workflow_dispatch:
jobs:
  purge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tsx scripts/purge-deleted.ts
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY }}
```

`30 21 * * *` is 03:00 in India. Add the two secrets in GitHub (Settings, Secrets and variables, Actions) after task 8.

**Check:** locally, `npm run purge` prints `{"filesRemoved":0,"documents":0,"patients":0}` on a fresh database.

### Task 7 — Synthetic demo data

Create `scripts/seed-demo.ts`. Specification:

- Reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `DEMO_PASSWORD` (at least 12 characters) from the environment. Exits with an error naming any missing variable.
- Creates four users with the admin client (`auth.admin.createUser`, `email_confirm: true`, the demo password, `user_metadata.full_name`):
  - `rahul.demo@<your domain or example.test>` "Rahul (demo)"
  - `ramesh.demo@...` "Ramesh (demo)"
  - `priya.demo@...` "Priya (demo)"
  - `suresh.demo@...` "Suresh (demo)"
  Use addresses you can receive mail at if you will sign in with codes on staging. If a user already exists, stop with the message "Demo data already exists" and exit with code 1.
- Signs in as Rahul with the anon key (a normal user session), then through RPC calls:
  - `create_patient` for "Ramesh (demo)", date of birth `1957-03-04`, `Asia/Kolkata`, grace 120, primary condition "Type 2 diabetes, hypertension (synthetic)", physician "Dr. A. Sharma (synthetic)".
  - `create_invite` and, signed in as each invitee, `accept_invite`: Ramesh as PATIENT, Priya as CAREGIVER, Suresh as VIEWER. Use `newInviteToken()` from `src/lib/auth/invite-token.ts` (relative import).
  - `give_consent` with `CONSENT_NOTICE_VERSION`.
  - `add_medication` three times, all starting 7 days ago (patient's local date) and DAILY: Metformin 500 mg morning 08:00 and evening 19:00, after food; Amlodipine 5 mg morning 08:00; Atorvastatin 10 mg bedtime 22:00.
  - `save_checkup`: lab test "Synthetic Diagnostics, Mysuru", the day after tomorrow at 09:30 local, reminder 24 hours.
- With the admin client, inserts past doses for the last 6 days and earlier today so the dashboard has history. For each schedule and each past day, insert a `medication_reminders` row at the scheduled local time. Status pattern, fixed so the demo is the same every time: day index × schedule index modulo 7 equal to 3 → MISSED; equal to 5 → SKIPPED (with `acknowledged_at` 10 minutes after); otherwise ACKNOWLEDGED (with `acknowledged_at` 5 minutes after and `acknowledged_by` Ramesh's id). Only insert times before now. Use `upsert` with `onConflict: "schedule_id,scheduled_for"` and `ignoreDuplicates: true`.
- Prints the four emails and "Demo data created". Never prints the password.

The admin inserts in this script are the only place rows are written without a database function. They are allowed because this is a one-off data loader run by the builder, not part of the app.

**Check:** `npm run db:reset`, add `DEMO_PASSWORD=<any 12+ characters>` to `.env.local`, `npm run seed:demo` prints "Demo data created". Sign in as Rahul: the dashboard shows 7 days of bars, Ramesh has today's doses, and running the script again prints "Demo data already exists".

### Task 8 — Staging Supabase

1. `npx supabase login`.
2. `npx supabase link --project-ref <staging project ref>` (the ref is in the staging project's URL).
3. `npx supabase db push`. Expected: the six migrations are applied.
4. Run the lock-down tests against staging in the SQL editor: paste the five `is_empty` and `ok` queries from `06_hardening.test.sql` as plain `select` statements. Every one returns no rows (or `true` for the last).
5. In the staging dashboard:
   - Authentication, URL Configuration: Site URL = Amplify URL; Redirect URLs = `https://<amplify host>/**`.
   - Authentication, Providers, Email: confirm email on; email OTP length 6; OTP expiry 3600 seconds.
   - Authentication, Email Templates: paste the two templates from P1 task 1 into "Confirm signup" and "Magic Link", with the same subjects.
   - Database, Extensions: `pg_cron` is enabled; Integrations or Cron shows the three CareCircle jobs.
   - Storage: the bucket `medical-documents` exists and is private.
6. Custom email sending through Amazon SES (Supabase's built-in email sends only a few emails per hour):
   - In the AWS console, open Amazon SES in the same region as Amplify. Verify a sender identity (a domain you own, or one email address).
   - SES starts in sandbox mode: it only sends to verified addresses. For the demo, verify the four demo email addresses too, or request production access (this can take a day).
   - Create SMTP credentials in SES.
   - In Supabase, Authentication, SMTP Settings (or Emails, SMTP): enable custom SMTP with the SES host, port 587, the SMTP user and password, and the verified sender address.
   - Send yourself a code from the staging sign-in page to confirm it arrives.
7. Seed staging: create `.env.staging.local` (git-ignored by `.env*.local`) with the staging URL, anon key, service-role key, and a demo password. Run `npx tsx --env-file=.env.staging.local scripts/seed-demo.ts`.
8. Add the GitHub secrets for the purge workflow. Run the workflow once by hand (Actions, purge, Run workflow); it succeeds.

Write each result in the Exit log. Never write keys or passwords in the log.

### Task 9 — Amplify production settings

In Amplify, environment variables for branch `main`:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | staging URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon or publishable key |
| `GEMINI_API_KEY` | billing-enabled key |
| `GEMINI_MODEL` | model ID from P2 |
| `DEMO_MODE` | `false` for the real demo |
| `APP_URL` | the Amplify URL |

Redeploy. Open the staging URL and run the golden path in task 11.

To switch to demo mode quickly during the event (for example if the Gemini quota runs out), set `DEMO_MODE=true` and redeploy. Measure how long a redeploy takes now and write it in the Exit log, so you know whether this fallback is usable during the presentation. The other fallback needs no redeploy: "Enter medicines by hand" on the medicines page.

### Task 10 — Final automated tests

Install the accessibility checker:

```
npm install -D @axe-core/playwright
```

Create `e2e/a11y.spec.ts`: for `/`, `/sign-in`, `/sign-up`, the owner dashboard, a document review page, the medicines page, and `/me` (using the scenario helpers), run `new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()` and expect no violations with impact `serious` or `critical`. Fix the app, never the test, when this fails.

Create `e2e/privacy.spec.ts`:

1. `FR-2.4 export downloads a JSON file`: as the owner, start a download from the export link; the file name starts with `carecircle-export-` and the JSON has `patient.full_name`.
2. `FR-2.3 delete patient needs the exact name`: the delete button is disabled until the full name is typed; after deleting, the list no longer shows the patient and the caregiver's patient URL shows the 404 page.
3. `FR-4.4 delete document`: the owner deletes a document; the viewer's documents list no longer shows it; the signed URL route returns 404.
4. `parse is rate-limited`: call `POST /api/documents/{id}/parse` 21 times with `page.request` (the first call claims, later ones return 409 CONFLICT); the 21st returns 429.
5. `security headers are present`: `page.request.get("/")` response has `x-frame-options: DENY`, `x-content-type-options: nosniff`, and a `content-security-policy` header (the test server runs a production build).

Create `e2e/golden-path.spec.ts`: PRD section 13.2 steps 1–10 as one test in demo mode, with Rahul, Ramesh, and Priya in three browser contexts. For step 1, create Rahul with the admin helper (email confirmation is covered by FR-1.1). For step 8, set one past dose to MISSED with the admin client, then check the dashboard and the notification bell.

Run the whole suite on a clean database:

```
npm run db:reset
npm run lint
npm run typecheck
npm test
npm run db:test
npm run build
npm run test:e2e
```

### Task 11 — Manual checks on staging

Do each check and write "pass" or what went wrong in the Exit log.

1. **Golden path by hand** (PRD 13.2) on the staging URL, with a laptop as Rahul and an Android phone as Ramesh, real Gemini, using `fixtures/documents/synthetic-prescription-1.jpg`.
2. **Phone sign-in** with the 6-digit code from a real email (SES).
3. **Performance**: in Chrome DevTools on the laptop, choose Network "Fast 4G" and CPU "4× slowdown", open `/me` as Ramesh; the doses appear in under 2 seconds. Write the time.
4. **Screen reader**: TalkBack on Android through one full acknowledgement.
5. **Camera upload**: on the phone, Add a document, choose the camera, take a photo, upload. It works.
6. **Logs**: open the Amplify server logs for the last hour. Lines are JSON with `requestId`, `route`, `status`, `durationMs`. No names, emails, medicine names, file contents, or AI output appear. Search for "Metformin" and for a demo email: no results.
7. **Secrets**: `git log -p | rg -i "service_role|sb_secret|GEMINI_API_KEY=.+"` finds nothing. `rg -n "SUPABASE_SERVICE_ROLE_KEY" src` finds nothing.
8. **Comments**: these two commands find nothing. Remove any comment they find.
   - `rg -n "^\s*(//|/\*)|\s//\s" -g "*.ts" -g "*.tsx" -g "*.mjs" src scripts e2e`
   - `rg -n "^\s*--|\s--\s" -g "*.sql" supabase`
   CSS custom properties such as `--color-ink` in `globals.css` are code, not comments; that is why CSS files are not scanned with the SQL pattern.
9. **Disclaimer**: visible on the landing page, sign-up page, review screen, and the footer of `/me`.

### Task 12 — Demo script and README

Create `docs/demo-script.md`:

```markdown
# CareCircle — 5-minute demo

## Before the demo (10 minutes earlier)
- Laptop: signed in as Rahul (demo) on the staging URL, dashboard of "Ramesh (demo)" open.
- Phone: signed in as Ramesh (demo), `/me` open, added to the home screen.
- The synthetic prescription photo is on the laptop.
- Check one dose for Ramesh is due now (seed data) or add a medicine 5 minutes in the past.
- Fallbacks ready: "Enter medicines by hand", and DEMO_MODE (redeploy time measured in P6 task 9).

## 1. The problem (40 s)
Rahul lives in Bangalore. His father Ramesh, 68, lives in Mysuru with diabetes and hypertension. Prescriptions are handwritten, medicines change, and Rahul has no way to know if doses are taken.

## 2. From paper to schedule (90 s)
- Documents → Add a document → upload the photo.
- Read with AI. Point at the side-by-side view: the scan on the left, the rows on the right, and the highlighted row the AI was unsure about.
- Fix the highlighted row, set times, Approve. "Nothing the AI reads is used until a person approves it."

## 3. Ramesh's phone (60 s)
- Show the phone: big cards, morning and evening, one button.
- Tap "I took it".
- Turn to the laptop: the dashboard updated without a reload.

## 4. Family coordination (40 s)
- People: Priya is a caregiver, Suresh can only view. Each person sees only what their role allows; the database enforces it.
- Notifications: a missed-dose alert and an upcoming lab test.

## 5. Safety and privacy (40 s)
- Not a medical device; no advice about missed doses.
- Consent before any document is sent to the AI; data in an Indian AWS region; export and delete in two clicks; everything audited.

## 6. Close (10 s)
"CareCircle turns a paper prescription into a routine the whole family can see, safely."
```

Replace the app root `README.md` (created by `create-next-app`) with a project README containing: one-paragraph summary, the safety disclaimer, screenshots (dashboard, review screen, phone today view; take them from staging and save them in `docs/screenshots/`), the stack table from `plan/README.md` section 3, "Run locally" steps (Node 22, Docker, `npm install`, `npx supabase start`, copy `.env.example` to `.env.local` and fill it from `supabase status`, `npm run db:reset`, `npm run seed:demo`, `npm run dev`), "Tests" (the commands from task 10), and "Privacy and security" (the bullet points from PRD section 9 and the access rules summary from PRD section 5.3).

Commit, push, and confirm Amplify deploys the final version.

---

## Exit checks

| Command or check | Expected |
|---|---|
| `npm run db:reset` | no error |
| `npm run db:test` | 158 passed |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | all pass |
| `npm run build` | succeeds |
| `npm run test:e2e` | all pass, including a11y, privacy, and golden path |
| `npm run purge` (local) | prints counts, exit 0 |
| Staging lock-down queries (task 8 step 4) | no rows |
| GitHub Actions `ci` and `purge` | green |
| Task 11 manual checks | all nine pass |
| `docs/demo-script.md` rehearsed once on staging, start to finish | under 5 minutes |

## Exit log

```
(pass lines, staging results, Supabase Auth rate limits, Amplify redeploy time, performance time,
and the result of each manual check; no keys or passwords)
```

## Notes

```
(differences from the plan)
```

## Blocked

```
(none)
```

## After the hackathon (not part of this plan)

- Web Push reminders and a service worker for full offline loading.
- Printable weekly summary.
- Hindi and other languages.
- Legal review of the consent notice and disclaimer.
- Owner transfer and account deletion.
