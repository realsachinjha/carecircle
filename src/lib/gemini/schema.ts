import { z } from "zod";

export const SLOTS = ["MORNING", "AFTERNOON", "EVENING", "BEDTIME"] as const;
export type Slot = (typeof SLOTS)[number];

export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    doctor_name: { type: "STRING", nullable: true },
    clinic_name: { type: "STRING", nullable: true },
    issue_date: { type: "STRING", nullable: true, description: "YYYY-MM-DD" },
    medicines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          dosage: { type: "STRING" },
          frequency_per_day: { type: "INTEGER" },
          slots: { type: "ARRAY", items: { type: "STRING", enum: [...SLOTS] } },
          duration_days: { type: "INTEGER", nullable: true },
          instructions: { type: "STRING", nullable: true },
          confidence: { type: "STRING", enum: ["HIGH", "MEDIUM", "LOW"] },
        },
        required: ["name", "dosage", "frequency_per_day", "slots", "confidence"],
      },
    },
  },
  required: ["medicines"],
} as const;

export const extractedMedicineSchema = z.object({
  name: z.string().max(255),
  dosage: z.string().max(64),
  frequency_per_day: z.number().int().min(1).max(6),
  slots: z.array(z.enum(SLOTS)).max(6),
  duration_days: z.number().int().min(1).max(365).nullable().optional(),
  instructions: z.string().max(1000).nullable().optional(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

export const extractionSchema = z.object({
  doctor_name: z.string().max(128).nullable().optional(),
  clinic_name: z.string().max(128).nullable().optional(),
  issue_date: z.string().max(10).nullable().optional(),
  medicines: z.array(extractedMedicineSchema).max(30),
});

export type ExtractedMedicine = z.infer<typeof extractedMedicineSchema>;
export type Extraction = z.infer<typeof extractionSchema>;

export type RowFlags = {
  missingField: boolean;
  slotMismatch: boolean;
  lowConfidence: boolean;
  needsAttention: boolean;
};

export function flagsFor(medicine: ExtractedMedicine): RowFlags {
  const uniqueSlots = new Set(medicine.slots);
  const missingField = medicine.name.trim() === "" || medicine.dosage.trim() === "";
  const slotMismatch = uniqueSlots.size !== medicine.frequency_per_day;
  const lowConfidence = medicine.confidence === "LOW";
  return { missingField, slotMismatch, lowConfidence, needsAttention: missingField || slotMismatch || lowConfidence };
}
