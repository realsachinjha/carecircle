import { loadPatientContext } from "@/lib/patients/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { describeSchedule } from "@/lib/medicines/describe";
import type { ScheduleDraft } from "@/lib/medicines/defaults";
import { strings } from "@/strings/en";

export default async function MedicinesPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const { role } = await loadPatientContext(patientId, `/patients/${patientId}`);
  if (role === "PATIENT") {
    return <div>not found</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data: medications } = await supabase
    .from("medications")
    .select("id, name, dosage, instructions, status, stopped_at, document_id, replaces_id, created_at, medication_schedules(slot, target_time, frequency_type, weekdays, interval_days, start_date, end_date)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  const canEdit = role === "OWNER" || role === "CAREGIVER";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-3xl font-semibold">{strings.medicines.title}</h1>
      <div className="flex flex-col gap-4">
        <section className="rounded-xl border border-line bg-paper p-4">
          <h2 className="text-xl font-semibold">{strings.medicines.active}</h2>
          {(medications?.filter((m) => m.status === "ACTIVE") || []).map((med) => (
            <div key={med.id} className="flex flex-col gap-2 p-4 rounded-lg border border-line bg-paper">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{med.name}</p>
                  <p className="text-sm text-muted">{med.dosage}</p>
                  {med.instructions && <p className="text-sm text-muted">{med.instructions}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  {med.medication_schedules?.map((s) => (
                    <span key={`${med.id}-${s.slot}`} className="text-sm text-muted">
                      {strings.medicines.describe.at} {s.target_time.substring(0, 5)},{" "}
                      {describeSchedule({ ...s, slot: s.slot, weekdays: s.weekdays ?? [] } as ScheduleDraft)}
                    </span>
                  ))}
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 mt-2">
                  <a href={`/patients/${patientId}/medicines/${med.id}/change`} className="text-sm text-accent underline">
                    {strings.medicines.change}
                  </a>
                  <button className="text-sm text-danger underline">
                    {strings.medicines.stop}
                  </button>
                </div>
              )}
            </div>
          ))}
          {medications?.filter((m) => m.status === "ACTIVE").length === 0 && (
            <p className="text-muted">{strings.medicines.empty}</p>
          )}
        </section>
        <section className="rounded-xl border border-line bg-paper p-4">
          <h2 className="text-xl font-semibold">{strings.medicines.stopped}</h2>
          {(medications?.filter((m) => m.status === "STOPPED") || []).map((med) => (
            <div key={med.id} className="flex items-center justify-between p-2 rounded-lg border border-line bg-paper">
              <div>
                <p className="font-semibold">{med.name}</p>
                <p className="text-sm text-muted">{med.dosage}</p>
              </div>
              <p className="text-sm text-muted">{strings.medicines.stoppedOn} {med.stopped_at}</p>
            </div>
          ))}
          {medications?.filter((m) => m.status === "STOPPED").length === 0 && (
            <p className="text-muted">{strings.medicines.empty}</p>
          )}
        </section>
        {canEdit && (
          <a href={`/patients/${patientId}/medicines/new`} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-5 text-lg font-semibold text-accent-ink">
            {strings.medicines.add}
          </a>
        )}
      </div>
    </div>
  );
}