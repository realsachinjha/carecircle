# Phase 4 — Patient experience

## Goal

The patient opens CareCircle on a phone, sees today's doses as large cards grouped by time of day, and taps "I took it" or "I did not take it". Taps made while the connection is down are queued and sent later. The app can be added to the phone's home screen.

## Requirements covered

FR-8.1 to FR-8.7. PRD section 10 (accessibility, layout, connection loss).

## Before you start

- Phase 3 exit checks pass.
- Read PRD FR-8 and section 10.
- Design for a 360 px wide phone first, then check wider screens.

## Rules for this phase

- **Only the PATIENT acknowledges.** The database function refuses everyone else.
- **Acknowledging is idempotent.** Sending the same tap twice changes nothing. This makes the connection-loss queue safe to retry.
- **No advice.** A missed dose shows "Not marked as taken" and the sentence "This app does not give medical advice." Nothing else.
- **Too early.** A dose more than 2 hours in the future shows "Later today" and no buttons. The database refuses it too (`TOO_EARLY`).

## Files this phase creates or changes

| Path | Purpose |
|---|---|
| `supabase/migrations/20250101000400_patient_ack.sql` | `acknowledge_dose`, `doses_for_day` |
| `supabase/tests/04_acknowledgement.test.sql` | database tests |
| `src/lib/supabase/database.types.ts` | regenerated |
| `src/lib/doses/view.ts` | dose display state and slot grouping |
| `src/lib/offline/ack-queue.ts` | connection-loss queue |
| `src/strings/en.ts` | new keys |
| `src/app/api/reminders/[reminderId]/ack/route.ts` | POST acknowledge or skip |
| `src/components/patient/slot-icon.tsx` | slot icons |
| `src/components/patient/dose-card.tsx` | one dose |
| `src/components/patient/patient-today.tsx` | the today view (client) |
| `src/components/patient/home-screen-tip.tsx` | one-time "add to home screen" tip |
| `src/app/me/page.tsx` | patient home |
| `src/app/patients/[patientId]/layout.tsx` | sends PATIENT users to `/me` |
| `src/app/manifest.ts` | installable app manifest |
| `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png` | app icons |
| `src/test/*.test.ts` | unit tests |
| `e2e/patient.spec.ts` | browser tests |

---

## Tasks

### Task 1 — Migration

Create `supabase/migrations/20250101000400_patient_ack.sql`:

```sql
create or replace function public.acknowledge_dose(p_reminder uuid, p_action text)
returns public.medication_reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder public.medication_reminders%rowtype;
  caller_role text;
begin
  if p_action is null or p_action not in ('ACKNOWLEDGED', 'SKIPPED') then
    raise exception 'VALIDATION_FAILED';
  end if;
  select * into reminder from public.medication_reminders where id = p_reminder for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  caller_role := public.my_role(reminder.patient_id);
  if caller_role is null then
    raise exception 'NOT_FOUND';
  end if;
  if caller_role <> 'PATIENT' then
    raise exception 'FORBIDDEN';
  end if;
  if reminder.status = p_action then
    return reminder;
  end if;
  if reminder.scheduled_for > now() + interval '2 hours' then
    raise exception 'TOO_EARLY';
  end if;
  if reminder.status = 'PENDING' or (reminder.status = 'MISSED' and p_action = 'ACKNOWLEDGED') then
    update public.medication_reminders
    set status = p_action, acknowledged_at = now(), acknowledged_by = auth.uid()
    where id = reminder.id
    returning * into reminder;
    return reminder;
  end if;
  raise exception 'CONFLICT';
end;
$$;

create or replace function public.doses_for_day(p_patient uuid, p_day date default null)
returns table (
  reminder_id uuid,
  scheduled_for timestamptz,
  status text,
  acknowledged_at timestamptz,
  slot text,
  medication_name text,
  dosage text,
  instructions text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id,
    r.scheduled_for,
    r.status,
    r.acknowledged_at,
    s.slot,
    m.name::text,
    m.dosage::text,
    m.instructions
  from public.medication_reminders r
  join public.medication_schedules s on s.id = r.schedule_id
  join public.medications m on m.id = s.medication_id
  join public.patients p on p.id = r.patient_id
  where r.patient_id = p_patient
    and r.scheduled_for >= (coalesce(p_day, (now() at time zone p.timezone)::date)::timestamp at time zone p.timezone)
    and r.scheduled_for < ((coalesce(p_day, (now() at time zone p.timezone)::date) + 1)::timestamp at time zone p.timezone)
  order by r.scheduled_for, m.name;
$$;

revoke all on function public.acknowledge_dose(uuid, text) from public, anon;
revoke all on function public.doses_for_day(uuid, date) from public, anon;
grant execute on function public.acknowledge_dose(uuid, text) to authenticated;
grant execute on function public.doses_for_day(uuid, date) to authenticated;
```

`doses_for_day` is `security invoker`: it runs as the caller, so row-level security decides which rows come back. P5 uses it on the dashboard too.

Run `npx supabase db reset` and `npm run db:types`.

**Check:** both succeed.

### Task 2 — Database tests

Create `supabase/tests/04_acknowledgement.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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

insert into public.patients (id, full_name, date_of_birth, created_by, timezone) values
  ('00000000-0000-0000-0000-0000000000b1', 'Ramesh Test', '1957-03-04', '00000000-0000-0000-0000-0000000000a1', 'Asia/Kolkata'),
  ('00000000-0000-0000-0000-0000000000b2', 'Other Test', '1950-01-01', '00000000-0000-0000-0000-0000000000a5', 'Asia/Kolkata');
insert into public.caregiver_links (patient_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'OWNER'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'CAREGIVER'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'VIEWER'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a5', 'OWNER');
insert into public.patient_links (patient_id, user_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a4');

insert into public.medications (id, patient_id, name, dosage, created_by) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'Metformin', '500 mg', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b2', 'Other', '1', '00000000-0000-0000-0000-0000000000a5');
insert into public.medication_schedules (id, medication_id, patient_id, slot, target_time, frequency_type, start_date) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'MORNING', '08:00', 'DAILY', '2026-01-01'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b2', 'MORNING', '08:00', 'DAILY', '2026-01-01');

insert into public.medication_reminders (id, schedule_id, patient_id, scheduled_for, status) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', now() - interval '30 minutes', 'PENDING'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', now() + interval '5 hours', 'PENDING'),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', now() - interval '5 hours', 'MISSED'),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', now() + interval '1 hour', 'PENDING'),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b2', now() - interval '10 minutes', 'PENDING'),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', now() - interval '6 hours', 'MISSED'),
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', now() - interval '40 minutes', 'PENDING'),
  ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '2026-03-10 08:00:00+05:30', 'PENDING'),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '2026-03-10 23:30:00+05:30', 'PENDING'),
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '2026-03-11 00:30:00+05:30', 'PENDING'),
  ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '2026-03-09 23:59:00+05:30', 'PENDING');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.acknowledge_dose('00000000-0000-0000-0000-0000000000f1', 'ACKNOWLEDGED')$$, 'P0001', 'FORBIDDEN', 'FR-8.6 a caregiver cannot acknowledge');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$select public.acknowledge_dose('00000000-0000-0000-0000-0000000000f1', 'ACKNOWLEDGED')$$, 'P0001', 'FORBIDDEN', 'FR-8.6 a viewer cannot acknowledge');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select throws_ok($$select public.acknowledge_dose('00000000-0000-0000-0000-0000000000f1', 'ACKNOWLEDGED')$$, 'P0001', 'NOT_FOUND', 'FR-8.6 an outsider gets NOT_FOUND');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
select throws_ok($$select public.acknowledge_dose('00000000-0000-0000-0000-0000000000f1', 'TAKEN')$$, 'P0001', 'VALIDATION_FAILED', 'an unknown action is refused');
select is((public.acknowledge_dose('00000000-0000-0000-0000-0000000000f1', 'ACKNOWLEDGED')).status, 'ACKNOWLEDGED', 'FR-8.2 the patient acknowledges a due dose');
select is(
  (select acknowledged_by from public.medication_reminders where id = '00000000-0000-0000-0000-0000000000f1'),
  '00000000-0000-0000-0000-0000000000a4'::uuid,
  'FR-8.2 the patient is recorded as the person who acknowledged'
);
select is(
  (public.acknowledge_dose('00000000-0000-0000-0000-0000000000f1', 'ACKNOWLEDGED')).acknowledged_at,
  (select acknowledged_at from public.medication_reminders where id = '00000000-0000-0000-0000-0000000000f1'),
  'FR-8.2 a repeated tap changes nothing'
);
select throws_ok($$select public.acknowledge_dose('00000000-0000-0000-0000-0000000000f1', 'SKIPPED')$$, 'P0001', 'CONFLICT', 'FR-8.3 an acknowledged dose cannot be changed to skipped');
select throws_ok($$select public.acknowledge_dose('00000000-0000-0000-0000-0000000000f2', 'ACKNOWLEDGED')$$, 'P0001', 'TOO_EARLY', 'FR-8.4 a dose 5 hours ahead is too early');
select is((public.acknowledge_dose('00000000-0000-0000-0000-0000000000f4', 'ACKNOWLEDGED')).status, 'ACKNOWLEDGED', 'FR-8.4 a dose 1 hour ahead can be acknowledged');
select is((public.acknowledge_dose('00000000-0000-0000-0000-0000000000f3', 'ACKNOWLEDGED')).status, 'ACKNOWLEDGED', 'FR-8.5 a missed dose can be marked taken late');
select throws_ok($$select public.acknowledge_dose('00000000-0000-0000-0000-0000000000f6', 'SKIPPED')$$, 'P0001', 'CONFLICT', 'FR-8.5 a missed dose cannot be changed to skipped');
select is((public.acknowledge_dose('00000000-0000-0000-0000-0000000000f7', 'SKIPPED')).status, 'SKIPPED', 'FR-8.3 the patient records a skipped dose');
select throws_ok($$select public.acknowledge_dose('00000000-0000-0000-0000-0000000000f5', 'ACKNOWLEDGED')$$, 'P0001', 'NOT_FOUND', 'FR-8.6 the patient cannot touch another patient''s dose');
select is((select count(*)::int from public.doses_for_day('00000000-0000-0000-0000-0000000000b1', '2026-03-10')), 2, 'FR-8.1 the day view holds only that local day''s doses');
select is(
  (select scheduled_for from public.doses_for_day('00000000-0000-0000-0000-0000000000b1', '2026-03-10') limit 1),
  '2026-03-10 08:00:00+05:30'::timestamptz,
  'FR-8.1 the day view is ordered by time'
);
reset role;

select is(
  (select count(*)::int from public.audit_logs
   where target_table = 'medication_reminders' and target_id = '00000000-0000-0000-0000-0000000000f1'
     and actor_id = '00000000-0000-0000-0000-0000000000a4'),
  1,
  'FR-8.2 the acknowledgement is audited once (the repeated tap wrote nothing)'
);

select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select is((select count(*)::int from public.doses_for_day('00000000-0000-0000-0000-0000000000b1', '2026-03-10')), 0, 'an outsider''s day view is empty');
reset role;

select * from finish();
rollback;
```

**Check:** `npm run db:test` reports 99 + 18 = 117 passed.

### Task 3 — Dose display logic

Create `src/lib/doses/view.ts`:

```ts
import type { Slot } from "@/lib/gemini/schema";

export const SLOT_ORDER: Slot[] = ["MORNING", "AFTERNOON", "EVENING", "BEDTIME"];
export const EARLY_LIMIT_MS = 2 * 60 * 60 * 1000;

export type DoseStatus = "PENDING" | "ACKNOWLEDGED" | "SKIPPED" | "MISSED";

export type Dose = {
  reminder_id: string;
  scheduled_for: string;
  status: DoseStatus;
  acknowledged_at: string | null;
  slot: Slot;
  medication_name: string;
  dosage: string;
  instructions: string | null;
};

export type DoseView = "due" | "later" | "taken" | "skipped" | "missed" | "queued";

export function doseView(dose: Dose, now: Date, queued: boolean): DoseView {
  if (dose.status === "ACKNOWLEDGED") {
    return "taken";
  }
  if (dose.status === "SKIPPED") {
    return "skipped";
  }
  if (queued) {
    return "queued";
  }
  if (dose.status === "MISSED") {
    return "missed";
  }
  return new Date(dose.scheduled_for).getTime() - now.getTime() > EARLY_LIMIT_MS ? "later" : "due";
}

export function groupBySlot(doses: Dose[]): Array<{ slot: Slot; doses: Dose[] }> {
  return SLOT_ORDER.map((slot) => ({
    slot,
    doses: doses
      .filter((dose) => dose.slot === slot)
      .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for) || a.medication_name.localeCompare(b.medication_name)),
  })).filter((group) => group.doses.length > 0);
}
```

`scheduled_for` values from the database are ISO strings in UTC with the same format, so `localeCompare` sorts them by time.

Create `src/lib/offline/ack-queue.ts`:

```ts
export type AckAction = "ACKNOWLEDGED" | "SKIPPED";
export type QueuedAck = { reminderId: string; action: AckAction; queuedAt: string };
export type SendOutcome = "done" | "retry";

export const QUEUE_KEY = "carecircle.ackQueue.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isQueuedAck(value: unknown): value is QueuedAck {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.reminderId === "string" &&
    (item.action === "ACKNOWLEDGED" || item.action === "SKIPPED") &&
    typeof item.queuedAt === "string"
  );
}

export function readQueue(storage: StorageLike): QueuedAck[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isQueuedAck) : [];
  } catch {
    return [];
  }
}

function writeQueue(storage: StorageLike, queue: QueuedAck[]) {
  storage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueue(storage: StorageLike, item: QueuedAck): QueuedAck[] {
  const queue = readQueue(storage).filter((existing) => existing.reminderId !== item.reminderId);
  queue.push(item);
  writeQueue(storage, queue);
  return queue;
}

export function removeFromQueue(storage: StorageLike, reminderId: string): QueuedAck[] {
  const queue = readQueue(storage).filter((existing) => existing.reminderId !== reminderId);
  writeQueue(storage, queue);
  return queue;
}

export async function flushQueue(
  storage: StorageLike,
  send: (item: QueuedAck) => Promise<SendOutcome>,
): Promise<QueuedAck[]> {
  for (const item of readQueue(storage)) {
    const outcome = await send(item);
    if (outcome === "retry") {
      break;
    }
    removeFromQueue(storage, item.reminderId);
  }
  return readQueue(storage);
}
```

`send` returns `"retry"` when the device is offline or the server had a temporary problem (`OFFLINE`, `INTERNAL`, `RATE_LIMITED`). It returns `"done"` on success and on errors that will never succeed (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `TOO_EARLY`, `VALIDATION_FAILED`). Flushing stops at the first `"retry"` so taps are sent in order.

### Task 4 — Strings

Add to `src/strings/en.ts`:

```ts
  patient: {
    greeting: "Hello",
    todayTitle: "Today's medicines",
    noDoses: "No medicines for today.",
    tookIt: "I took it",
    didNotTake: "I did not take it",
    confirmSkip: "Are you sure you did not take it?",
    yesSkip: "Yes, I did not take it",
    noGoBack: "No, go back",
    takenAt: "Taken at",
    skipped: "Not taken",
    later: "Later today",
    missed: "Not marked as taken",
    queued: "Waiting to send. It will be sent when you are back online.",
    at: "at",
    noAdvice: "This app does not give medical advice.",
    offlineBanner: "You are offline. Your taps are saved and will be sent later.",
    tooEarly: "This dose is not due yet.",
    homeScreenTip: "Tip: open your browser menu and choose “Add to Home screen” to open CareCircle like an app.",
    dismiss: "OK",
    notPatient: "This page is for the person receiving care.",
  },
```

### Task 5 — Acknowledge route

Create `src/app/api/reminders/[reminderId]/ack/route.ts`:

```ts
import { z } from "zod";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";
import { parseInput, readJsonBody } from "@/lib/validation";

const ackSchema = z.object({ action: z.enum(["ACKNOWLEDGED", "SKIPPED"]) });

export const POST = handleRoute<{ reminderId: string }>(async (request, { params }) => {
  if (!isUuid(params.reminderId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { action } = parseInput(ackSchema, await readJsonBody(request));
  const { data, error } = await supabase.rpc("acknowledge_dose", { p_reminder: params.reminderId, p_action: action });
  if (error) {
    throw fromDb(error);
  }
  const row = data as { status: string; acknowledged_at: string | null };
  return jsonOk({ status: row.status, acknowledgedAt: row.acknowledged_at });
});
```

### Task 6 — Patient components

Create `src/components/patient/slot-icon.tsx`: a component `SlotIcon({ slot })` that returns an inline `<svg>` 40×40 with `aria-hidden="true"`, `stroke="currentColor"`, `fill="none"`, `strokeWidth={2}`:

- MORNING: a half sun on a horizon line with three short rays.
- AFTERNOON: a full sun (circle) with eight rays.
- EVENING: a half sun below a horizon line with a downward arrow.
- BEDTIME: a crescent moon.

Keep each icon to simple `circle`, `line`, and `path` elements. Colour comes from the parent text colour.

Create `src/components/patient/dose-card.tsx` (client). Props: `dose: Dose`, `view: DoseView`, `timeZone: string`, `onAck: (action: AckAction) => void`, `busy: boolean`. Specification:

- An `<article>` with a 2 px border, rounded, padding 20 px, `aria-labelledby` pointing at the medicine name.
- Top row: medicine name (`text-2xl font-semibold`) and dosage (`text-xl`). Second line: `strings.patient.at` + time in the patient's timezone (`timeInZone`). Instructions in `text-xl text-muted` when present.
- By `view`:
  - `due`: a full-width primary button `strings.patient.tookIt` (`min-h-16 text-2xl`) and below it a secondary button `strings.patient.didNotTake`. Tapping "I did not take it" replaces both buttons with `strings.patient.confirmSkip`, a danger button `strings.patient.yesSkip`, and a secondary button `strings.patient.noGoBack`. Only `yesSkip` calls `onAck("SKIPPED")`.
  - `later`: text `strings.patient.later`, no buttons, card border `border-line`.
  - `taken`: a check mark, `strings.patient.takenAt` + time of `acknowledged_at` in the patient's timezone, text and border `ok`.
  - `skipped`: `strings.patient.skipped`, border `line`.
  - `missed`: `strings.patient.missed` in `warn` colour, then `strings.patient.noAdvice` in muted text, then the primary `strings.patient.tookIt` button (taken late). No skip button.
  - `queued`: `strings.patient.queued` with `role="status"`.
- Buttons are disabled while `busy`.
- Every state is described by text, never by colour alone.

Create `src/components/patient/patient-today.tsx` (client). Props: `patientId: string`, `patientName: string`, `timeZone: string`, `initialDoses: Dose[]`. Specification:

- State: `doses` (from props), `queuedIds: Set<string>` (from `readQueue(localStorage)` on mount), `busyId: string | null`, `message: string | null`, `now: Date` (updated every 60 seconds with `setInterval`), `online: boolean` (from `navigator.onLine`, updated on `online` and `offline` events).
- When `initialDoses` changes (after `router.refresh()`), replace `doses` with it.
- `send(item)`: calls `callApi<{ status: DoseStatus; acknowledgedAt: string | null }>(\`/api/reminders/${item.reminderId}/ack\`, "POST", { action: item.action })`.
  - On success, update that dose's `status` and `acknowledged_at`, remove it from `queuedIds`, return `"done"`.
  - On `OFFLINE`, `INTERNAL`, or `RATE_LIMITED`, return `"retry"`.
  - On `TOO_EARLY`, set `message` to `strings.patient.tooEarly`, return `"done"`.
  - On any other error, remove it from `queuedIds`, call `router.refresh()` so the card shows the real state, return `"done"`.
- `handleAck(dose, action)`: set `busyId`; `enqueue(localStorage, { reminderId, action, queuedAt: new Date().toISOString() })`; add to `queuedIds`; then `flushQueue(localStorage, send)`; clear `busyId`.
- On mount, on the `online` event, and every 30 seconds while the queue is not empty, call `flushQueue(localStorage, send)`.
- Every 5 minutes, while the page is visible (`document.visibilityState === "visible"`) and online, call `router.refresh()` so new doses and changes appear.
- When offline, show a `Notice` with `strings.patient.offlineBanner` at the top.
- Render: heading `strings.patient.greeting` + first name; `strings.patient.todayTitle`; then `groupBySlot(doses)`. Each group has a heading with `SlotIcon` and `strings.slots[slot]` (`text-2xl`). Each dose renders `DoseCard` with `view = doseView(dose, now, queuedIds.has(dose.reminder_id))`.
- No doses: `strings.patient.noDoses`.
- An `aria-live="polite"` region shows `message`.

Create `src/components/patient/home-screen-tip.tsx` (client): shows `strings.patient.homeScreenTip` with an OK button, once per device (store `carecircle.homeTipDismissed = "1"` in `localStorage` when OK is pressed). Hide it when the page is already running as an installed app (`window.matchMedia("(display-mode: standalone)").matches`).

### Task 7 — Patient home and redirects

Create `src/app/me/page.tsx` (server component):

```tsx
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Disclaimer } from "@/components/disclaimer";
import { HomeScreenTip } from "@/components/patient/home-screen-tip";
import { PatientToday } from "@/components/patient/patient-today";
import { requirePageUser } from "@/lib/auth/session";
import type { Dose } from "@/lib/doses/view";

export default async function PatientHomePage() {
  const { supabase, user } = await requirePageUser("/me");
  const { data: link } = await supabase
    .from("patient_links")
    .select("patient_id, patients(full_name, timezone)")
    .eq("user_id", user.id)
    .maybeSingle();
  const patient = link?.patients;
  if (!link || !patient) {
    redirect("/patients");
  }
  const { data: doses } = await supabase.rpc("doses_for_day", { p_patient: link.patient_id });
  return (
    <>
      <AppHeader showCaregiverNav={false} />
      <main className="mx-auto flex max-w-xl flex-col gap-6 p-4 text-xl">
        <HomeScreenTip />
        <PatientToday
          patientId={link.patient_id}
          patientName={patient.full_name}
          timeZone={patient.timezone}
          initialDoses={(doses ?? []) as Dose[]}
        />
        <footer className="border-t border-line pt-4">
          <Disclaimer variant="footer" />
        </footer>
      </main>
    </>
  );
}
```

If the generated types make `link.patients` an array instead of an object, take the first element; check the type in `database.types.ts` and note it.

Edit `src/app/patients/[patientId]/layout.tsx`: right after `loadPatientContext`, if `role === "PATIENT"`, call `redirect("/me")` (import `redirect` from `next/navigation`).

### Task 8 — Installable app

Create `public/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0b5cad"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#ffffff" stroke-width="36"/>
  <path d="M256 330 C200 290 176 262 176 230 a40 40 0 0 1 80 -10 a40 40 0 0 1 80 10 c0 32 -24 60 -80 100z" fill="#ffffff"/>
</svg>
```

Export it as two PNG files, `public/icon-192.png` (192×192) and `public/icon-512.png` (512×512), with any image editor you trust. Open both to check they look right.

Create `src/app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";
import { strings } from "@/strings/en";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: strings.appName,
    short_name: strings.appName,
    description: strings.landing.body,
    start_url: "/start",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b5cad",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
```

In `src/app/layout.tsx`, add `themeColor: "#0b5cad"` to the exported `viewport` object.

**Check:** `npm run build`, `npm run start`, open `http://localhost:3000/manifest.webmanifest`; it returns the JSON above. In Chrome DevTools, Application, Manifest shows no errors.

### Task 9 — Unit tests

`src/test/dose-view.test.ts`:

- FR-8.4 a PENDING dose 2 hours and 1 minute ahead → `later`; exactly 2 hours ahead → `due`; 10 minutes ago → `due`.
- FR-8.5 MISSED → `missed`; MISSED and queued → `queued`.
- ACKNOWLEDGED → `taken` even if queued; SKIPPED → `skipped`.
- FR-8.1 `groupBySlot` returns groups in the order MORNING, AFTERNOON, EVENING, BEDTIME, leaves out empty slots, and sorts doses inside a group by time then name.

`src/test/ack-queue.test.ts` (use a small in-memory object with `getItem` and `setItem` as storage):

- FR-8.7 `enqueue` twice for the same reminder keeps one item, the latest action.
- `readQueue` returns `[]` for missing data, for `"not json"`, and for `[{"reminderId": 1}]`.
- `flushQueue` with `send` always `"done"` empties the queue and calls `send` in order.
- `flushQueue` with `send` returning `"retry"` for the first item stops and keeps all items.
- `flushQueue` with `"done"`, then `"retry"` removes only the first item.

**Check:** `npm test` passes.

### Task 10 — Browser tests

Create `e2e/patient.spec.ts`. Set-up for each test, using `e2e/helpers/users.ts`:

1. Create an owner and a patient user. Owner creates a patient (timezone `Asia/Kolkata`) with `createPatientAs`.
2. Owner invites the patient user as PATIENT and the patient user accepts, both through `userClient` RPC calls (`create_invite` with a hash from `newInviteToken()` in `src/lib/auth/invite-token.ts`, then `accept_invite` with the same hash). Import with a relative path, for example `../src/lib/auth/invite-token`.
3. Owner adds medicines with `add_medication` through `userClient`:
   - "Due Pill" at the patient's local time 10 minutes ago (compute with `timeInZone(new Date(Date.now() - 10 * 60_000), "Asia/Kolkata")`), DAILY, start date = patient's today (`todayInZone`).
   - "Later Pill" at local time 3 hours from now, DAILY, same start date.
   `add_medication` generates doses at once.
4. Sign in as the patient through the UI (password tab).

If "Later Pill" would fall on the next local day (the test runs late in the evening), skip the "Later" assertion with `test.skip` for that one check and say why in the skip message.

Tests (they run in both projects; the phone project is the one that matters):

1. `FR-8.1 the patient lands on today's medicines`: after sign-in the URL is `/me`; "Today's medicines" is visible; "Due Pill" has an "I took it" button.
2. `FR-8.2 I took it records the dose`: tap "I took it" on Due Pill; "Taken at" appears; reload; it is still there.
3. `FR-8.3 skipping needs a second tap`: tap "I did not take it"; "Are you sure you did not take it?" appears; tap "No, go back"; the buttons return; tap "I did not take it" then "Yes, I did not take it"; "Not taken" appears.
4. `FR-8.4 a later dose has no buttons`: the Later Pill card shows "Later today" and has no button.
5. `FR-8.7 a tap while offline is sent when back online`: `await context.setOffline(true)`; the offline banner appears; tap "I took it"; "Waiting to send" appears; `await context.setOffline(false)`; within 15 seconds "Taken at" appears.
6. `FR-8.5 a missed dose can be marked taken late`: update the Due Pill reminder to MISSED with the admin client; reload; "Not marked as taken" and "This app does not give medical advice." are visible and there is no "I did not take it" button; tap "I took it"; "Taken at" appears.
7. `FR-8.6 a caregiver cannot acknowledge`: as the owner, `page.request.post("/api/reminders/{id}/ack", { data: { action: "ACKNOWLEDGED" } })` returns 403.
8. `the patient is sent to /me from caregiver pages`: as the patient, open `/patients/{patientId}`; the URL becomes `/me`.

**Check:** `npm run test:e2e` passes.

### Task 11 — Phone check by hand

1. Run `npm run dev -- --hostname 0.0.0.0`. Find your computer's LAN IP address. On an Android phone on the same Wi-Fi, open `http://<ip>:3000`.
2. Note: sign-in links in emails point to `localhost`; use the 6-digit code instead.
3. Sign in as a patient. Check: text is easy to read without zooming; every button is easy to hit with a thumb; nothing scrolls sideways at 360 px.
4. Turn on airplane mode, tap "I took it", see "Waiting to send", turn airplane mode off, see "Taken at".
5. Turn on TalkBack (Android screen reader). Move through one dose card: the medicine name, time, and button labels are read out.
6. From the browser menu, add CareCircle to the home screen and open it from the icon.

Write the results in the Exit log.

---

## Exit checks

| Command | Expected |
|---|---|
| `npm run db:reset` | no error |
| `npm run db:test` | 117 passed |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | all pass |
| `npm run build` | succeeds |
| `npm run test:e2e` | all pass |
| Task 11 by hand | all six checks pass |

## Exit log

```
(pass lines and the phone check results)
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

- Web Push notifications and a service worker (stretch goals).
- Upcoming checkups on the patient page (P5).
- Hindi text.
