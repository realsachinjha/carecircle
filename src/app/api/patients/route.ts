import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { fromDb } from "@/lib/db-errors";
import type { Database } from "@/lib/supabase/database.types";
import { patientFieldsSchema } from "@/lib/patients/schema";
import { parseInput, readJsonBody } from "@/lib/validation";

type CreatePatientArgs = Database["public"]["Functions"]["create_patient"]["Args"];

export const POST = handleRoute(async (request) => {
  const { supabase } = await requireApiUser();
  const input = parseInput(patientFieldsSchema, await readJsonBody(request));
  const args: CreatePatientArgs = {
    p_full_name: input.fullName,
    p_date_of_birth: input.dateOfBirth,
    p_timezone: input.timezone,
    p_missed_after_minutes: input.missedAfterMinutes,
  };
  if (input.bloodGroup != null) {
    args.p_blood_group = input.bloodGroup;
  }
  if (input.primaryCondition != null) {
    args.p_primary_condition = input.primaryCondition;
  }
  if (input.notes != null) {
    args.p_notes = input.notes;
  }
  if (input.emergencyContactName != null) {
    args.p_emergency_contact_name = input.emergencyContactName;
  }
  if (input.emergencyContactPhone != null) {
    args.p_emergency_contact_phone = input.emergencyContactPhone;
  }
  if (input.physicianName != null) {
    args.p_physician_name = input.physicianName;
  }
  if (input.physicianPhone != null) {
    args.p_physician_phone = input.physicianPhone;
  }
  const { data, error } = await supabase.rpc("create_patient", args);
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ patientId: data }, 201);
});
