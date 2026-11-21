import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { strings } from "@/strings/en";

type PatientLink = {
  role: string;
  patients: { id: string; full_name: string; date_of_birth: string } | null;
};

export default async function PatientsPage() {
  const { user } = await requirePageUser("/patients");
  const supabase = await createSupabaseServerClient();
  const { data: links } = await supabase
    .from("caregiver_links")
    .select("role, patients(id, full_name, date_of_birth)")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE");

  const patients = (links ?? [])
    .map((link) => link as PatientLink)
    .filter((link): link is PatientLink & { patients: NonNullable<PatientLink["patients"]> } => !!link.patients)
    .sort((a, b) => a.patients.full_name.localeCompare(b.patients.full_name));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <AppHeader />
      <h1 className="text-3xl font-semibold">{strings.patients.listTitle}</h1>
      <Link href="/patients/new" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-5 text-lg font-semibold text-accent-ink">
        {strings.patients.add}
      </Link>
      {patients.length === 0 ? (
        <p className="text-lg">{strings.patients.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {patients.map((link) => (
            <li key={link.patients.id}>
              <Link href={`/patients/${link.patients.id}`} className="block min-h-12 rounded-lg border-2 border-line px-4 py-3 text-lg hover:bg-panel">
                <span>{link.patients.full_name}</span>
                <span className="ml-auto text-muted">{strings.roles[link.role as keyof typeof strings.roles]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
