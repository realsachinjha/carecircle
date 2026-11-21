import { requirePageUser } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";
import { PatientForm } from "@/components/patient-form";
import { strings } from "@/strings/en";

export default async function NewPatientPage() {
  await requirePageUser("/patients/new");
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <AppHeader />
      <h1 className="text-3xl font-semibold">{strings.patients.newTitle}</h1>
      <PatientForm mode="create" />
    </div>
  );
}
