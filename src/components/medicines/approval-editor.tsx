"use client";

import { useRouter } from "next/navigation";
import { callApi } from "@/lib/client/call-api";
import { Notice } from "@/components/ui/notice";
import { MedicineEditor } from "@/components/medicines/medicine-editor";
import { Extraction } from "@/lib/gemini/schema";
import type { MedicineDraft } from "@/lib/medicines/defaults";
import { strings } from "@/strings/en";

export function ApprovalEditor({
  documentId,
  patientId,
  extraction,
  today,
  demoMode,
}: {
  documentId: string;
  patientId: string;
  extraction: Extraction;
  today: string;
  demoMode: boolean;
}) {
  const router = useRouter();

  async function submit() {
    const result = await callApi(`/api/documents/${documentId}/approve`, "POST", {
      medicines: extraction.medicines.map((m) => ({
        name: m.name,
        dosage: m.dosage,
        instructions: m.instructions,
        schedules: m.slots.map((s) => ({
          slot: s,
          target_time: "08:00",
          frequency_type: "DAILY",
          weekdays: [],
          interval_days: 2,
          start_date: today,
          end_date: m.duration_days ? today : "",
        })),
      })),
    });
    if (!result.ok) {
      return result.error;
    }
    router.push(`/patients/${patientId}/medicines`);
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{strings.medicines.approveTitle}</h2>
      <p className="text-base">{strings.medicines.approveIntro}</p>
      {demoMode && <Notice tone="warning">{strings.medicines.demoBadge}</Notice>}
      <MedicineEditor
        initial={extraction.medicines.map((m) => ({
          name: m.name,
          dosage: m.dosage,
          instructions: m.instructions ?? "",
          schedules: m.slots.map((s) => ({
            slot: s,
            target_time: "08:00",
            frequency_type: "DAILY",
            weekdays: [],
            interval_days: 2,
            start_date: today,
            end_date: m.duration_days ? today : "",
          })),
        })) as MedicineDraft[]}
        today={today}
        allowMultiple
        onSubmit={submit}
      />
    </div>
  );
}
