"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi, type ApiFailure } from "@/lib/client/call-api";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { strings } from "@/strings/en";

export function StopButton({ medicationId }: { medicationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  async function stop() {
    if (!window.confirm(strings.medicines.confirmStop)) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/medications/${medicationId}/stop`, "DELETE");
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }
  return (
    <>
      <Button type="button" variant="danger" disabled={busy} onClick={stop}>
        {busy ? strings.common.saving : strings.medicines.stop}
      </Button>
      {error ? <ErrorMessage error={error} /> : null}
    </>
  );
}