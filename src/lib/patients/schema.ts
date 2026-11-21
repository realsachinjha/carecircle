import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const patientFieldsSchema = z.object({
  fullName: z.string().trim().min(1).max(128),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().trim().min(1).max(64),
  missedAfterMinutes: z.number().int().min(30).max(480),
  bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
  primaryCondition: optionalText(2000),
  notes: optionalText(4000),
  emergencyContactName: optionalText(128),
  emergencyContactPhone: optionalText(32),
  physicianName: optionalText(128),
  physicianPhone: optionalText(32),
});

export const patientPatchSchema = patientFieldsSchema.partial();

export type PatientFields = z.infer<typeof patientFieldsSchema>;
export type PatientPatch = z.infer<typeof patientPatchSchema>;

const COLUMN_BY_FIELD = {
  fullName: "full_name",
  dateOfBirth: "date_of_birth",
  timezone: "timezone",
  missedAfterMinutes: "missed_after_minutes",
  bloodGroup: "blood_group",
  primaryCondition: "primary_condition",
  notes: "notes",
  emergencyContactName: "emergency_contact_name",
  emergencyContactPhone: "emergency_contact_phone",
  physicianName: "physician_name",
  physicianPhone: "physician_phone",
} as const;

export function toPatientColumns(patch: PatientPatch): Record<string, string | number | null> {
  const columns: Record<string, string | number | null> = {};
  for (const [field, column] of Object.entries(COLUMN_BY_FIELD)) {
    const value = patch[field as keyof PatientPatch];
    if (value !== undefined) {
      columns[column] = value;
    }
  }
  return columns;
}
