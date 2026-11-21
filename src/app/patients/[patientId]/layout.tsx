import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { loadPatientContext } from "@/lib/patients/context";
import { tabsFor } from "@/lib/patients/tabs";
import { strings } from "@/strings/en";

export default async function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const { patient, role } = await loadPatientContext(patientId, `/patients/${patientId}`);
  return (
    <>
      <AppHeader />
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
        <div>
          <h1 className="text-3xl font-semibold">{patient.full_name}</h1>
          <p className="text-muted">{strings.patients.yourRole}: {strings.roles[role]}</p>
        </div>
        <nav aria-label={patient.full_name} className="flex flex-wrap gap-2">
          {tabsFor(role).map((tab) => (
            <Link key={tab.label} href={tab.href(patientId)} className="min-h-12 rounded-lg border border-line px-4 py-3">
              {tab.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </>
  );
}
