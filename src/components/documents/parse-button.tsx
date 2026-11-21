"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi, type ApiFailure } from "@/lib/client/call-api";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/error-message";
import { strings } from "@/strings/en";

export function ParseButton({ documentId, status }: { documentId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  async function parse() {
    setBusy(true);
    setError(null);
    const result = await callApi<{ status: string; code: string | null }>(`/api/documents/${documentId}/parse`, "POST");
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data.status === "FAILED") {
      setError({ code: (result.data.code ?? "AI_UNAVAILABLE") as ApiFailure["code"] });
      return;
    }
    router.refresh();
  }

  const label = status === "FAILED" ? strings.documents.tryAgain : strings.documents.readWithAi;

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" disabled={busy} onClick={parse}>
        {busy ? strings.documents.reading : label}
      </Button>
      {error ? <ErrorMessage error={error} /> : null}
    </div>
  );
}
