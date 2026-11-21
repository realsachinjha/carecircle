import { loadPatientContext } from "@/lib/patients/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MedicineEditor } from "@/components/medicines/medicine-editor";
import { MedicineDraft, draftToInput, DEFAULT_SLOT_TIMES } from "@/lib/medicines/defaults";
import { todayInZone } from "@/lib/time/local-date";
import { strings } from "@/strings/en";

export default async function NewMedicinePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const { role } = await loadPatientContext(patientId, `/patients/${patientId}`);
  if (role !== "OWNER" && role !== "CAREGIVER") {
    return <div>not found</div>;
  }
  const today = todayInZone("Asia/Kolkata");
  const initial: MedicineDraft[] = [
    {
      name: "",
      dosage: "",
      instructions: "",
      schedules: [
        {
          slot: "MORNING",
          target_time: DEFAULT_SLOT_TIMES.MORNING as string,
          frequency_type: "DAILY",
          weekdays: [],
          interval_days: 2,
          start_date: today,
          end_date: "",
        },
      ],
    },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-3xl font-semibold">{strings.medicines.addTitle}</h1>
      <MedicineEditor
        initial={initial}
        today={today}
        allowMultiple={false}
        onSubmit={async (drafts) => {
          const supabase = await createSupabaseServerClient();
          const body = draftToInput(drafts[0]!);
          const { error } = await supabase.rpc("add_medication", {
            p_patient: patientId,
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