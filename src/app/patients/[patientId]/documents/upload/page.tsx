import { loadPatientContext } from "@/lib/patients/context";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";
import { strings } from "@/strings/en";

export default async function UploadPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const { role } = await loadPatientContext(patientId, `/patients/${patientId}`);
  if (role !== "OWNER" && role !== "CAREGIVER") {
    return <div>not found</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data: consent } = await supabase
    .from("consents")
    .select("id")
    .eq("patient_id", patientId)
    .is("withdrawn_at", null)
    .maybeSingle();
  if (!consent) {
    redirect(`/patients/${patientId}/documents`);
  }
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-3xl font-semibold">{strings.documents.uploadTitle}</h1>
      <UploadForm patientId={patientId} />
    </div>
  );
}
