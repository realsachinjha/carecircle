import { describe, expect, it } from "vitest";
import { extractionSchema, flagsFor, type ExtractedMedicine } from "@/lib/gemini/schema";
import demoPrescription from "../../fixtures/gemini/prescription-1.json";

describe("gemini-schema", () => {
  it("demo fixture passes extractionSchema", () => {
    const result = extractionSchema.safeParse(demoPrescription);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.medicines).toHaveLength(3);
    }
  });

  it("frequency_per_day: 0 fails", () => {
    const result = extractionSchema.safeParse({
      ...demoPrescription,
      medicines: [{ ...demoPrescription.medicines[0], frequency_per_day: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("slots: [NIGHT] fails", () => {
    const result = extractionSchema.safeParse({
      ...demoPrescription,
      medicines: [{ ...demoPrescription.medicines[0], slots: ["NIGHT"] }],
    });
    expect(result.success).toBe(false);
  });

  it("confidence: SURE fails", () => {
    const result = extractionSchema.safeParse({
      ...demoPrescription,
      medicines: [{ ...demoPrescription.medicines[0], confidence: "SURE" }],
    });
    expect(result.success).toBe(false);
  });

  it("31 medicines fails", () => {
    const result = extractionSchema.safeParse({
      ...demoPrescription,
      medicines: Array(31).fill(demoPrescription.medicines[0]),
    });
    expect(result.success).toBe(false);
  });

  describe("flagsFor", () => {
    it("fixture first row has no flags", () => {
      const result = extractionSchema.parse(demoPrescription);
      expect(flagsFor(result.medicines[0]!)).toEqual({
        missingField: false,
        slotMismatch: false,
        lowConfidence: false,
        needsAttention: false,
      });
    });

    it("fixture third row has slotMismatch and lowConfidence", () => {
      const result = extractionSchema.parse(demoPrescription);
      expect(flagsFor(result.medicines[2]!)).toEqual({
        missingField: false,
        slotMismatch: true,
        lowConfidence: true,
        needsAttention: true,
      });
    });

    it("row with name: ' ' has missingField", () => {
      const result = flagsFor({ ...(demoPrescription.medicines[0] as ExtractedMedicine), name: " " });
      expect(result.missingField).toBe(true);
    });

    it("slots: [MORNING, MORNING] with frequency 2 has slotMismatch", () => {
      const result = flagsFor({
        ...(demoPrescription.medicines[0] as ExtractedMedicine),
        slots: ["MORNING", "MORNING"],
        frequency_per_day: 2,
      });
      expect(result.slotMismatch).toBe(true);
    });
  });
});
