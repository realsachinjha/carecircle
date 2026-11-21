import { describe, expect, it } from "vitest";
import type { MedicineDraft } from "@/lib/medicines/defaults";
import { draftsFromExtraction, draftToInput } from "@/lib/medicines/defaults";
import type { Extraction } from "@/lib/gemini/schema";
import { medicineSchema } from "@/lib/medicines/schema";
import demoPrescription from "@/fixtures/gemini/prescription-1.json";

describe("medicine-defaults", () => {
  it("FR-2.1 FR-6.6 draftsFromExtraction fixture", () => {
    const parsed = demoPrescription as unknown as Extraction;
    const rows = draftsFromExtraction(parsed, "2026-03-10");

    const metformin = rows[0]!;
    expect(metformin.schedules).toHaveLength(2);
    expect(metformin.schedules[0]!.start_date).toBe("2026-03-10");
    expect(metformin.schedules[0]!.end_date).toBe("2026-04-08");

    const amlodipine = rows[1]!;
    expect(amlodipine.schedules).toHaveLength(1);
    expect(amlodipine.schedules[0]!.end_date).toBe("");
  });

  it("draftToInput turns empty strings into null", () => {
    const draft: MedicineDraft = {
      name: "Test",
      dosage: "1",
      instructions: "",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "DAILY",
          weekdays: [],
          interval_days: 2,
          start_date: "2026-03-10",
          end_date: "",
        },
      ],
    };

    const result = draftToInput(draft);
    const schedule = result.schedules[0]!;
    expect(result.instructions).toBeNull();
    expect(schedule.end_date).toBeNull();
    expect("weekdays" in schedule ? schedule.weekdays : []).toEqual([]);
    expect("interval_days" in schedule ? schedule.interval_days : undefined).toBeUndefined();
  });

  it("draftToInput passes medicineSchema", () => {
    const draft: MedicineDraft = {
      name: "Test",
      dosage: "1",
      instructions: "After food",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "DAILY",
          weekdays: [],
          interval_days: 2,
          start_date: "2026-03-10",
          end_date: "2026-03-20",
        },
      ],
    };

    const input = draftToInput(draft);
    const result = medicineSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
