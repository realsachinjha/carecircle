import { describe, expect, it } from "vitest";
import { medicineSchema, approvalSchema } from "@/lib/medicines/schema";

describe("medicineSchema", () => {
  it("FR-6.1 a valid DAILY medicine passes", () => {
    const result = medicineSchema.safeParse({
      name: "Metformin",
      dosage: "500 mg",
      instructions: "After food",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "DAILY",
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("target_time 8:00 passes", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "DAILY",
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("target_time 24:00 fails", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "24:00",
          frequency_type: "DAILY",
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("target_time 12:60 fails", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "12:60",
          frequency_type: "DAILY",
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("target_time 00:00 passes", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "00:00",
          frequency_type: "DAILY",
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("target_time 23:59 passes", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "23:59",
          frequency_type: "DAILY",
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("SPECIFIC_DAYS with weekdays [] fails", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "SPECIFIC_DAYS",
          weekdays: [],
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("SPECIFIC_DAYS with [1, 1] fails", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "SPECIFIC_DAYS",
          weekdays: [1, 1],
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("SPECIFIC_DAYS with [1, 4] passes", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "SPECIFIC_DAYS",
          weekdays: [1, 4],
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("SPECIFIC_DAYS with [0] fails", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "SPECIFIC_DAYS",
          weekdays: [0],
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("SPECIFIC_DAYS with [8] fails", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "SPECIFIC_DAYS",
          weekdays: [8],
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("EVERY_N_DAYS with interval_days 1 fails", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "EVERY_N_DAYS",
          interval_days: 1,
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("EVERY_N_DAYS with interval_days 31 fails", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "EVERY_N_DAYS",
          interval_days: 31,
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("EVERY_N_DAYS with interval_days 2 passes", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "EVERY_N_DAYS",
          interval_days: 2,
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("EVERY_N_DAYS with interval_days 30 passes", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "EVERY_N_DAYS",
          interval_days: 30,
          start_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("end_date before start_date fails", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "DAILY",
          start_date: "2026-03-10",
          end_date: "2026-03-01",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("end_date equal to start_date passes", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [
        {
          slot: "MORNING",
          target_time: "08:00",
          frequency_type: "DAILY",
          start_date: "2026-03-10",
          end_date: "2026-03-10",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("no schedules fails", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: [],
    });
    expect(result.success).toBe(false);
  });

  it("7 schedules fails", () => {
    const result = medicineSchema.safeParse({
      name: "Test",
      dosage: "1",
      schedules: Array(7).fill({
        slot: "MORNING",
        target_time: "08:00",
        frequency_type: "DAILY",
        start_date: "2026-03-01",
      }),
    });
    expect(result.success).toBe(false);
  });

  it("approvalSchema with 0 medicines fails", () => {
    const result = approvalSchema.safeParse({
      medicines: [],
    });
    expect(result.success).toBe(false);
  });

  it("approvalSchema with 31 medicines fails", () => {
    const result = approvalSchema.safeParse({
      medicines: Array(31).fill({
        name: "Test",
        dosage: "1",
        schedules: [
          {
            slot: "MORNING",
            target_time: "08:00",
            frequency_type: "DAILY",
            start_date: "2026-03-01",
          },
        ],
      }),
    });
    expect(result.success).toBe(false);
  });
});