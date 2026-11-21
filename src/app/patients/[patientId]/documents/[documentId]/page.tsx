import { loadPatientContext } from "@/lib/patients/context";
import { isUuid } from "@/lib/ids";
import { DocumentPreview } from "@/components/documents/document-preview";
import { DocumentDetailsForm } from "@/components/documents/document-details-form";
import { StatusBadge } from "@/components/documents/status-badge";
import { ParseButton } from "@/components/documents/parse-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ExtractionTable } from "@/components/documents/extraction-table";
import { getEnv } from "@/lib/env";
import { extractionSchema, type Extraction } from "@/lib/gemini/schema";
import { strings } from "@/strings/en";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ patientId: string; documentId: string }>;
}) {
  const { patientId } = await params;
  const { role } = await loadPatientContext(patientId, `/patients/${patientId}`);
  if (role === "PATIENT") {
    return <div>not found</div>;
  }
  const { documentId } = await params;
  if (!isUuid(documentId)) {
    return <div>not found</div>;
  }
  const supabase = await createSupabaseServerClient();
  const { data: doc } = await supabase.from("medical_documents").select("*").eq("id", documentId).maybeSingle();
  if (!doc) {
    return <div>not found</div>;
  }
  const canEdit = role === "OWNER" || role === "CAREGIVER";
  const canParse = canEdit && (doc.extraction_status === "PENDING" || doc.extraction_status === "FAILED");
  const showExtraction =
    (doc.extraction_status === "PARSED" || doc.extraction_status === "VERIFIED") &&
    doc.extraction_raw &&
    extractionSchema.safeParse(doc.extraction_raw).success;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        <div className="flex flex-col gap-4">
          <DocumentPreview documentId={documentId} mimeType={doc.mime_type} />
          <DocumentDetailsForm
            documentId={documentId}
            documentType={doc.document_type}
            doctorName={doc.doctor_name}
            clinicName={doc.clinic_name}
            issueDate={doc.issue_date}
            canEdit={canEdit}
          />
        </div>
        <div className="flex flex-col gap-4">
          <StatusBadge status={doc.extraction_status} />
          {canParse && <ParseButton documentId={documentId} status={doc.extraction_status} />}
          {doc.extraction_status === "FAILED" && doc.extraction_error && (
            <p className="text-base text-danger">{strings.errors[doc.extraction_error as keyof typeof strings.errors]}</p>
          )}
          {showExtraction && <ExtractionTable extraction={doc.extraction_raw as unknown as Extraction} demoMode={getEnv().demoMode} />}
        </div>
      </div>
    </div>
  );
}
