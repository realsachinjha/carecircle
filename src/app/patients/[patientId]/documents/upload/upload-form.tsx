"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi, type ApiFailure } from "@/lib/client/call-api";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DOCUMENT_BUCKET, DOCUMENT_TYPES, EXTENSION_BY_MIME, type DocumentType } from "@/lib/documents/constants";
import { checkFileSize, detectFileType } from "@/lib/documents/file-check";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { ErrorMessage } from "@/components/error-message";
import { strings } from "@/strings/en";

export function UploadForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>("PRESCRIPTION");
  const [doctorName, setDoctorName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError({ code: "VALIDATION_FAILED" });
      return;
    }
    const sizeProblem = checkFileSize(file.size);
    if (sizeProblem) {
      setError({ code: sizeProblem });
      return;
    }
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const mime = detectFileType(head);
    if (!mime) {
      setError({ code: "UNSUPPORTED_FILE_TYPE" });
      return;
    }
    setBusy(true);
    const documentId = crypto.randomUUID();
    const extension = EXTENSION_BY_MIME[mime];
    const supabase = createSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(`${patientId}/${documentId}.${extension}`, file, { contentType: mime, upsert: false });
    if (uploadError) {
      setBusy(false);
      setError({ code: "FORBIDDEN" });
      return;
    }
    const result = await callApi<{ documentId: string }>(`/api/patients/${patientId}/documents`, "POST", {
      documentId,
      extension,
      documentType,
      doctorName: doctorName.trim() || undefined,
      clinicName: clinicName.trim() || undefined,
      issueDate: issueDate || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/patients/${patientId}/documents/${result.data.documentId}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="font-semibold">{strings.documents.chooseFile}</label>
        <input
          id="file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          required
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="min-h-12 text-lg"
        />
        <p className="text-base text-muted">{strings.documents.fileHint}</p>
      </div>
      <SelectField id="documentType" label={strings.documents.type} value={documentType} onChange={(event) => setDocumentType(event.target.value as DocumentType)}>
        {DOCUMENT_TYPES.map((type) => (
          <option key={type} value={type}>{strings.documents.types[type]}</option>
        ))}
      </SelectField>
      <TextField id="doctorName" label={strings.documents.doctorName} value={doctorName} maxLength={128} onChange={(event) => setDoctorName(event.target.value)} />
      <TextField id="clinicName" label={strings.documents.clinicName} value={clinicName} maxLength={128} onChange={(event) => setClinicName(event.target.value)} />
      <TextField id="issueDate" label={strings.documents.issueDate} type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
      <ErrorMessage error={error} />
      <Button type="submit" disabled={busy}>{busy ? strings.documents.uploading : strings.documents.uploadButton}</Button>
    </form>
  );
}
