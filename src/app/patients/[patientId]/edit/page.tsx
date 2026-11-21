import { notFound } from "next/navigation";
import { loadPatientContext } from "@/lib/patients/context";
import { PatientForm } from "@/components/patient-form";
import { BLOOD_GROUPS } from "@/lib/patients/schema";
import { strings } from "@/strings/en";

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const { patient, role } = await loadPatientContext(patientId, `/patients/${patientId}`);
  if (role !== "OWNER" && role !== "CAREGIVER") {
    notFound();
  }
  const initial = {
    fullName: patient.full_name,
    dateOfBirth: patient.date_of_birth,
    timezone: patient.timezone,
    missedAfterMinutes: patient.missed_after_minutes,
    bloodGroup: (patient.blood_group ?? null) as typeof BLOOD_GROUPS[number] | null,
    primaryCondition: patient.primary_condition,
    notes: patient.notes,
    emergencyContactName: patient.emergency_contact_name,
    emergencyContactPhone: patient.emergency_contact_phone,
    physicianName: patient.physician_name,
    physicianPhone: patient.physician_phone,
  };
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-3xl font-semibold">{strings.patients.editTitle}</h1>
      <PatientForm mode="edit" patientId={patientId} initial={initial} />
    </div>
  );
}
