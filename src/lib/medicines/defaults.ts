import type { Extraction } from "@/lib/gemini/schema";
import { addDays } from "@/lib/time/local-date";

export const DEFAULT_SLOT_TIMES = {
  MORNING: "08:00",
  AFTERNOON: "13:00",
  EVENING: "19:00",
  BEDTIME: "22:00",
} as const;

export type Slot = keyof typeof DEFAULT_SLOT_TIMES;

export type FrequencyType = "DAILY" | "SPECIFIC_DAYS" | "EVERY_N_DAYS";

export type ScheduleDraft = {
  slot: string;
  target_time: string;
  frequency_type: FrequencyType;
  weekdays: number[];
  interval_days: number;
  start_date: string;
  end_date: string;
};

export type MedicineDraft = {
  name: string;
  dosage: string;
  instructions: string;
  schedules: ScheduleDraft[];
};

export function newScheduleDraft(slot: string, startDate: string, endDate = ""): ScheduleDraft {
  return {
    slot,
    target_time: DEFAULT_SLOT_TIMES[slot as keyof typeof DEFAULT_SLOT_TIMES],
    frequency_type: "DAILY" as const,
    weekdays: [],
    interval_days: 2,
    start_date: startDate,
    end_date: endDate,
  };
}

export function draftsFromExtraction(extraction: Extraction, today: string): MedicineDraft[] {
  return extraction.medicines.map((medicine) => {
    const endDate = medicine.duration_days ? addDays(today, medicine.duration_days - 1) : "";
    const uniqueSlots = [...new Set(medicine.slots)];
    return {
      name: medicine.name,
      dosage: medicine.dosage,
      instructions: medicine.instructions ?? "",
      schedules: uniqueSlots.map((slot) => newScheduleDraft(slot as string, today, endDate)),
    };
  });
}

export function draftToInput(draft: MedicineDraft) {
  return {
    name: draft.name,
    dosage: draft.dosage,
    instructions: draft.instructions.trim() === "" ? null : draft.instructions,
    schedules: draft.schedules.map((schedule) => {
      const base = {
        slot: schedule.slot,
        target_time: schedule.target_time,
        start_date: schedule.start_date,
        end_date: schedule.end_date === "" ? null : schedule.end_date,
      };
      if (schedule.frequency_type === "SPECIFIC_DAYS") {
        return { ...base, frequency_type: "SPECIFIC_DAYS" as const, weekdays: [...schedule.weekdays].sort() };
      }
      if (schedule.frequency_type === "EVERY_N_DAYS") {
        return { ...base, frequency_type: "EVERY_N_DAYS" as const, interval_days: schedule.interval_days };
      }
      return { ...base, frequency_type: "DAILY" as const, weekdays: [], interval_days: undefined };
    }),
  };
}