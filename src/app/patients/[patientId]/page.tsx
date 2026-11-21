import Link from "next/link";
import { loadPatientContext } from "@/lib/patients/context";
import { Card } from "@/components/ui/card";
import { strings } from "@/strings/en";

function ageOf(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export default async function PatientOverviewPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const { patient, role } = await loadPatientContext(patientId, `/patients/${patientId}`);
  const fields = [
    { label: strings.patients.fields.dateOfBirth, value: `${patient.date_of_birth} (${ageOf(patient.date_of_birth)} years)` },
    { label: strings.patients.fields.bloodGroup, value: patient.blood_group ?? strings.patients.notSet },
    { label: strings.patients.fields.primaryCondition, value: patient.primary_condition ?? strings.patients.notSet },
    { label: strings.patients.fields.notes, value: patient.notes ?? strings.patients.notSet },
    { label: strings.patients.fields.emergencyContactName, value: patient.emergency_contact_name ?? strings.patients.notSet },
    { label: strings.patients.fields.emergencyContactPhone, value: patient.emergency_contact_phone ?? strings.patients.notSet },
    { label: strings.patients.fields.physicianName, value: patient.physician_name ?? strings.patients.notSet },
    { label: strings.patients.fields.physicianPhone, value: patient.physician_phone ?? strings.patients.notSet },
    { label: strings.patients.fields.timezone, value: patient.timezone },
    { label: strings.patients.fields.missedAfterMinutes, value: `${patient.missed_after_minutes} minutes` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card title={strings.patients.editTitle}>
        <ul className="flex flex-col gap-2">
          {fields.map((field) => (
            <li key={field.label} className="flex justify-between border-b border-line py-2">
              <span className="text-muted">{field.label}</span>
              <span>{field.value}</span>
            </li>
          ))}
        </ul>
      </Card>
      {(role === "OWNER" || role === "CAREGIVER") && (
        <Link href={`/patients/${patientId}/edit`} className="inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-accent bg-paper px-5 text-lg font-semibold text-accent">
          {strings.common.edit}
        </Link>
      )}
    </div>
  );
}
