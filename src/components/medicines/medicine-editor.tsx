"use client";

import { useState } from "react";
import type { ApiFailure } from "@/lib/client/call-api";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/field";
import { SLOTS } from "@/lib/gemini/schema";
import { strings } from "@/strings/en";
import type { MedicineDraft, ScheduleDraft } from "@/lib/medicines/defaults";
import { DEFAULT_SLOT_TIMES, draftToInput } from "@/lib/medicines/defaults";
import { medicineSchema } from "@/lib/medicines/schema";

export function MedicineEditor({
  initial,
  today,
  allowMultiple,
  onSubmit,
}: {
  initial: MedicineDraft[];
  today: string;
  allowMultiple: boolean;
  onSubmit: (drafts: MedicineDraft[]) => Promise<ApiFailure | null>;
}) {
  const [drafts, setDrafts] = useState<MedicineDraft[]>(initial);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    const results = await Promise.all(
      drafts.map(async (draft) => {
        const result = medicineSchema.safeParse(draftToInput(draft));
        if (!result.success) {
          return { ok: false as const, draft };
        }
        return { ok: true as const, draft };
      }),
    );
    const failed = results.find((r) => !r.ok);
    if (failed) {
      return;
    }
    const result = await onSubmit(drafts);
    if (result) {
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  function addMedicine() {
    const newDraft: MedicineDraft = {
      name: "",
      dosage: "",
      instructions: "",
      schedules: [
        {
          slot: "MORNING",
          target_time: DEFAULT_SLOT_TIMES.MORNING,
          frequency_type: "DAILY",
          weekdays: [],
          interval_days: 2,
          start_date: today,
          end_date: "",
        },
      ],
    };
    setDrafts([...drafts, newDraft]);
  }

  function removeMedicine(index: number) {
    if (drafts.length <= 1 && !allowMultiple) return;
    setDrafts(drafts.filter((_, i) => i !== index));
  }

  function addSchedule(medicineIndex: number) {
    setDrafts((drafts) => {
      const draftsCopy = [...drafts];
      const medicine = draftsCopy[medicineIndex]!;
      draftsCopy[medicineIndex] = {
        ...medicine,
        schedules: [
          ...medicine.schedules,
          {
            slot: "MORNING",
            target_time: DEFAULT_SLOT_TIMES.MORNING,
            frequency_type: "DAILY",
            weekdays: [],
            interval_days: 2,
            start_date: medicine.schedules[medicine.schedules.length - 1]?.end_date ?? "",
            end_date: "",
          },
        ],
      };
      return draftsCopy;
    });
  }

  function removeSchedule(medicineIndex: number, scheduleIndex: number) {
    setDrafts((drafts) => {
      const draftsCopy = [...drafts];
      const medicine = draftsCopy[medicineIndex]!;
      if (medicine.schedules.length <= 1) return drafts;
      draftsCopy[medicineIndex] = {
        ...medicine,
        schedules: medicine.schedules.filter((_, i) => i !== scheduleIndex),
      };
      return draftsCopy;
    });
  }

  function updateField(medicineIndex: number, field: string, value: string) {
    setDrafts((drafts) => {
      const draftsCopy = [...drafts];
      draftsCopy[medicineIndex] = { ...drafts[medicineIndex]!, [field]: value };
      return draftsCopy;
    });
  }

  function updateScheduleField(
    medicineIndex: number,
    scheduleIndex: number,
    field: string,
    value: string,
  ) {
    setDrafts((drafts) => {
      const draftsCopy = [...drafts];
      const medicine = { ...drafts[medicineIndex]! };
      const schedules = [...medicine.schedules];
      schedules[scheduleIndex] = { ...schedules[scheduleIndex]!, [field]: value };
      draftsCopy[medicineIndex] = { ...medicine, schedules };
      return draftsCopy;
    });
  }

  function renderSchedule(
    medicineIndex: number,
    scheduleIndex: number,
    schedule: ScheduleDraft,
  ) {
    return (
      <div key={scheduleIndex} className="flex flex-col gap-3 p-4 rounded-lg border border-line bg-paper">
        <div className="flex items-center justify-between gap-2">
          <SelectField
            id={`medicine-${medicineIndex}-schedule-${scheduleIndex}-slot`}
            label={strings.medicines.slot}
            value={schedule.slot}
            onChange={(e) =>
              updateScheduleField(medicineIndex, scheduleIndex, "slot", e.target.value as string)
            }
          >
            {SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {strings.slots[slot as keyof typeof strings.slots]}
              </option>
            ))}
          </SelectField>
          <TextField
            id={`medicine-${medicineIndex}-schedule-${scheduleIndex}-time`}
            label={strings.medicines.time}
            type="time"
            value={schedule.target_time}
            onChange={(e) =>
              updateScheduleField(medicineIndex, scheduleIndex, "target_time", e.target.value)
            }
          />
          <Button type="button" variant="danger" onClick={() => removeSchedule(medicineIndex, scheduleIndex)}>
            {strings.medicines.removeSchedule}
          </Button>
        </div>
        <div className="flex items-center gap-4">
          <SelectField
            id={`medicine-${medicineIndex}-schedule-${scheduleIndex}-frequency`}
            label={strings.medicines.frequency}
            value={schedule.frequency_type}
            onChange={(e) =>
              updateScheduleField(medicineIndex, scheduleIndex, "frequency_type", e.target.value as string)
            }
          >
            <option value="DAILY">{strings.medicines.frequencies.DAILY}</option>
            <option value="SPECIFIC_DAYS">{strings.medicines.frequencies.SPECIFIC_DAYS}</option>
            <option value="EVERY_N_DAYS">{strings.medicines.frequencies.EVERY_N_DAYS}</option>
          </SelectField>
          {schedule.frequency_type === "SPECIFIC_DAYS" && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">{strings.medicines.weekdays}:</span>
              {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day, idx) => (
                <label key={day} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schedule.weekdays!.includes(idx + 1)}
                    onChange={() => {
                      setDrafts((drafts) => {
                        const draftsCopy = [...drafts];
                        const medicine = { ...drafts[medicineIndex]! };
                        const schedules = [...medicine.schedules];
                        const weekdays = [...schedules[scheduleIndex]!.weekdays];
                        if (weekdays.includes(idx + 1)) {
                          schedules[scheduleIndex]!.weekdays = weekdays.filter((d) => d !== idx + 1);
                        } else {
                          schedules[scheduleIndex]!.weekdays = [...weekdays, idx + 1];
                        }
                        draftsCopy[medicineIndex] = { ...medicine, schedules };
                        return draftsCopy;
                      });
                    }}
                  />
                  {day}
                </label>
              ))}
            </div>
          )}
          {schedule.frequency_type === "EVERY_N_DAYS" && (
            <TextField
              id={`medicine-${medicineIndex}-schedule-${scheduleIndex}-interval`}
              label={strings.medicines.intervalDays}
              type="number"
              min="2"
              max="30"
              value={schedule.interval_days?.toString() ?? ""}
              onChange={(e) =>
                updateScheduleField(medicineIndex, scheduleIndex, "interval_days", e.target.value)
              }
            />
          )}
          <TextField
            id={`medicine-${medicineIndex}-schedule-${scheduleIndex}-start`}
            label={strings.medicines.startDate}
            type="date"
            value={schedule.start_date}
            onChange={(e) =>
              updateScheduleField(medicineIndex, scheduleIndex, "start_date", e.target.value)
            }
          />
          <TextField
            id={`medicine-${medicineIndex}-schedule-${scheduleIndex}-end`}
            label={strings.medicines.endDate}
            type="date"
            value={schedule.end_date ?? ""}
            onChange={(e) =>
              updateScheduleField(medicineIndex, scheduleIndex, "end_date", e.target.value)
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {drafts.map((medicine, medicineIndex) => (
        <section key={medicineIndex} className="rounded-xl border border-line bg-paper p-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{strings.medicines.editTitle}</h2>
              {allowMultiple && drafts.length > 1 && (
                <Button type="button" variant="danger" onClick={() => removeMedicine(medicineIndex)}>
                  {strings.medicines.removeMedicine}
                </Button>
              )}
            </div>
            <TextField
              id={`medicine-${medicineIndex}-name`}
              label={strings.medicines.name}
              value={medicine.name}
              maxLength={255}
              onChange={(e) => updateField(medicineIndex, "name", e.target.value)}
            />
            <TextField
              id={`medicine-${medicineIndex}-dosage`}
              label={strings.medicines.dosage}
              value={medicine.dosage}
              maxLength={64}
              onChange={(e) => updateField(medicineIndex, "dosage", e.target.value)}
            />
            <TextField
              id={`medicine-${medicineIndex}-instructions`}
              label={strings.medicines.instructions}
              value={medicine.instructions}
              maxLength={1000}
              onChange={(e) => updateField(medicineIndex, "instructions", e.target.value)}
            />
            <div className="flex flex-col gap-4">
              <h3 className="text-lg font-semibold">{strings.medicines.schedules}</h3>
              {medicine.schedules.map((schedule, scheduleIndex) =>
                renderSchedule(medicineIndex, scheduleIndex, schedule)
              )}
              <Button type="button" variant="secondary" onClick={() => addSchedule(medicineIndex)}>
                {strings.medicines.addSchedule}
              </Button>
            </div>
          </div>
        </section>
      ))}
      {allowMultiple && (
        <Button type="button" variant="secondary" onClick={addMedicine}>
          {strings.medicines.addMedicine}
        </Button>
      )}
      <div className="flex justify-end">
        <Button type="button" disabled={busy} onClick={handleSubmit}>
          {busy ? strings.common.saving : strings.medicines.save}
        </Button>
      </div>
    </div>
  );
}