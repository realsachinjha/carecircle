import { describe, expect, it } from "vitest";
import { describeSchedule } from "@/lib/medicines/describe";

describe("describeSchedule", () => {
  it("DAILY frequency", () => {
    const result = describeSchedule({
      slot: "MORNING",
      target_time: "08:00",
      frequency_type: "DAILY",
      weekdays: [],
      interval_days: 2,
      start_date: "2026-03-01",
      end_date: "2026-03-30",
    });
    expect(result).toBe("at 08:00, every day, from 2026-03-01 until 2026-03-30");
  });

  it("SPECIFIC_DAYS frequency", () => {
    const result = describeSchedule({
      slot: "MORNING",
      target_time: "08:00",
      frequency_type: "SPECIFIC_DAYS",
      weekdays: [1, 4],
      interval_days: 2,
      start_date: "2026-03-01",
      end_date: "",
    });
    expect(result).toBe("at 08:00, on Mon, Thu");
  });

  it("EVERY_N_DAYS frequency", () => {
    const result = describeSchedule({
      slot: "MORNING",
      target_time: "08:00",
      frequency_type: "EVERY_N_DAYS",
      weekdays: [],
      interval_days: 3,
      start_date: "2026-03-01",
      end_date: "",
    });
    expect(result).toBe("at 08:00, every 3 days");
  });

  it("target_time with seconds is trimmed", () => {
    const result = describeSchedule({
      slot: "MORNING",
      target_time: "08:00:00",
      frequency_type: "DAILY",
      weekdays: [],
      interval_days: 2,
      start_date: "2026-03-01",
      end_date: "",
    });
    expect(result).toBe("at 08:00, every day");
  });
});