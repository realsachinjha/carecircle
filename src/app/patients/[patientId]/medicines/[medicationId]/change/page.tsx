import { loadPatientContext } from "@/lib/patients/context";
import { isUuid } from "@/lib/ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MedicineEditor } from "@/components/medicines/medicine-editor";
import { MedicineDraft, draftToInput, FrequencyType } from "@/lib/medicines/defaults";
import { todayInZone } from "@/lib/time/local-date";
import { strings } from "@/strings/en";

export default async function EditMedicinePage({
  params,
}: {
  params: Promise<{ patientId: string; medicationId: string }>;
}) {
  const { patientId } = await params;
  const { role } = await loadPatientContext(patientId, `/patients/${patientId}`);
  if (role !== "OWNER" && role !== "CAREGIVER") {
    return <div>not found</div>;
  }
  const { medicationId } = await params;
  if (!isUuid(medicationId)) {
    return <div>not found</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data: med } = await supabase
    .from("medications")
    .select("id, name, dosage, instructions, status, medication_schedules(slot, target_time, frequency_type, weekdays, interval_days, start_date, end_date)")
    .eq("id", medicationId)
    .eq("patient_id", patientId)
    .maybeSingle();
  if (!med || med.status !== "ACTIVE") {
    return <div>not found</div>;
  }
  const today = todayInZone("Asia/Kolkata");
  const draft: MedicineDraft = {
    name: med.name,
    dosage: med.dosage,
    instructions: med.instructions ?? "",
    schedules: med.medication_schedules.map((s) => ({
      slot: s.slot,
      target_time: s.target_time.substring(0, 5),
      frequency_type: s.frequency_type as FrequencyType,
      weekdays: s.weekdays ?? [],
      interval_days: s.interval_days ?? 2,
      start_date: s.start_date,
      end_date: s.end_date ?? today,
    })),
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-3xl font-semibold">{strings.medicines.changeTitle}</h1>
      <p className="text-base">{strings.medicines.changeIntro}</p>
      <MedicineEditor
        initial={[draft]}
        today={today}
        allowMultiple={false}
        onSubmit={async (drafts) => {
          const sb = await createSupabaseServerClient();
          const body = draftToInput(drafts[0]!);
          const { error } = await sb.rpc("change_medication", {
            p_medication: medicationId,
            p_medicine: body,
          });
          if (error) {
            return { code: "VALIDATION_FAILED" } as const;
          }
          return null;
        }}
      />
    </div>
  );
}