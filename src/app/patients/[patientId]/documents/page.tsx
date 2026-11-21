import { loadPatientContext } from "@/lib/patients/context";
import { ConsentPanel } from "./consent-panel";
import { strings } from "@/strings/en";

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const { role, supabase } = await loadPatientContext(patientId, `/patients/${patientId}`);
  if (role === "PATIENT") {
    return <div>not found</div>;
  }

  const { data: consent } = await supabase
    .from("consents")
    .select("id, given_at")
    .eq("patient_id", patientId)
    .is("withdrawn_at", null)
    .maybeSingle();

  const { data: documents } = await supabase
    .from("medical_documents")
    .select("id, document_type, doctor_name, issue_date, extraction_status, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-3xl font-semibold">{strings.documents.title}</h1>
      {role === "OWNER" || role === "CAREGIVER" ? (
        <ConsentPanel patientId={patientId} consent={consent} role={role} />
      ) : null}
      {role === "OWNER" || role === "CAREGIVER" ? consent ? (
        <a
          href={`/patients/${patientId}/documents/upload`}
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-5 text-lg font-semibold text-accent-ink"
        >
          {strings.documents.upload}
        </a>
      ) : null : null}
      {documents?.length === 0 ? (
        <p className="text-lg">{strings.documents.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(documents ?? []).map((doc) => (
            <li key={doc.id}>
              <a href={`/patients/${patientId}/documents/${doc.id}`} className="block min-h-12 rounded-lg border-2 border-line px-4 py-3 text-lg hover:bg-panel">
                <span className="flex justify-between">
                  <span>{strings.documents.types[doc.document_type as keyof typeof strings.documents.types]}</span>
                  <span className="ml-2 text-muted">{doc.doctor_name ?? strings.documents.notSet}</span>
                </span>
                <span className="text-muted">{doc.issue_date ?? doc.created_at}</span>
                <span className="ml-auto">
                  <span className="mr-2">{doc.extraction_status}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
