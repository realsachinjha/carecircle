import { notFound } from "next/navigation";
import { isUuid } from "@/lib/ids";
import { requirePageUser } from "@/lib/auth/session";

export type PatientRole = "OWNER" | "CAREGIVER" | "VIEWER" | "PATIENT";

export async function loadPatientContext(patientId: string, returnTo: string) {
  if (!isUuid(patientId)) {
    notFound();
  }
  const { supabase, user } = await requirePageUser(returnTo);
  const { data: patient } = await supabase.from("patients").select("*").eq("id", patientId).maybeSingle();
  const { data: role } = await supabase.rpc("my_role", { p_patient: patientId });
  if (!patient || !role) {
    notFound();
  }
  return { supabase, user, patient, role: role as PatientRole };
}
