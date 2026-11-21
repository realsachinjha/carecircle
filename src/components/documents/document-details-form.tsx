"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi, type ApiFailure } from "@/lib/client/call-api";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { ErrorMessage } from "@/components/error-message";
import { DOCUMENT_TYPES } from "@/lib/documents/constants";
import { strings } from "@/strings/en";

export function DocumentDetailsForm({
  documentId,
  documentType,
  doctorName,
  clinicName,
  issueDate,
  canEdit,
}: {
  documentId: string;
  documentType: string;
  doctorName: string | null;
  clinicName: string | null;
  issueDate: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [saved, setSaved] = useState(false);
  const [type, setType] = useState(documentType);
  const [name, setName] = useState(doctorName ?? "");
  const [clinic, setClinic] = useState(clinicName ?? "");
  const [date, setDate] = useState(issueDate ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/documents/${documentId}`, "PATCH", {
      documentType: type,
      doctorName: name || undefined,
      clinicName: clinic || undefined,
      issueDate: date || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  if (!canEdit) {
    return (
      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="text-xl font-semibold">{strings.documents.detailsTitle}</h2>
        <dl className="flex flex-col gap-2">
          <div className="flex justify-between">
            <dt className="text-muted">{strings.documents.type}</dt>
            <dd>{strings.documents.types[documentType as keyof typeof strings.documents.types]}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{strings.documents.doctorName}</dt>
            <dd>{doctorName ?? strings.documents.notSet}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{strings.documents.clinicName}</dt>
            <dd>{clinicName ?? strings.documents.notSet}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{strings.documents.issueDate}</dt>
            <dd>{issueDate ?? strings.documents.notSet}</dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="rounded-xl border border-line bg-paper p-5 flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{strings.documents.detailsTitle}</h2>
      <SelectField id="documentType" label={strings.documents.type} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
        {DOCUMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {strings.documents.types[t]}
          </option>
        ))}
      </SelectField>
      <TextField id="doctorName" label={strings.documents.doctorName} value={name} maxLength={128} onChange={(e) => setName(e.target.value)} />
      <TextField id="clinicName" label={strings.documents.clinicName} value={clinic} maxLength={128} onChange={(e) => setClinic(e.target.value)} />
      <TextField id="issueDate" label={strings.documents.issueDate} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <ErrorMessage error={error} />
      {saved && <p className="text-base text-ok">{strings.documents.saved}</p>}
      <Button type="submit" disabled={busy || saved}>{busy ? strings.common.saving : strings.documents.saveDetails}</Button>
    </form>
  );
}
