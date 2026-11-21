"use client";

import { useState } from "react";
import { callApi, type ApiFailure } from "@/lib/client/call-api";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { strings } from "@/strings/en";

export function ConsentPanel({
  patientId,
  consent,
  role,
}: {
  patientId: string;
  consent: { given_at: string } | null;
  role: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  async function give() {
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/patients/${patientId}/consent`, "POST");
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.reload();
  }

  async function withdraw() {
    if (!window.confirm(strings.consent.confirmWithdraw)) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/patients/${patientId}/consent`, "DELETE");
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.reload();
  }

  if (!consent) {
    return (
      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="text-xl font-semibold">{strings.consent.title}</h2>
        <p className="text-base">{strings.consent.needed}</p>
        <p className="text-base">{strings.consent.notice}</p>
        <Button type="button" disabled={busy} onClick={give}>
          {busy ? strings.common.saving : strings.consent.agree}
        </Button>
        {error ? <ErrorMessage error={error} /> : null}
      </section>
    );
  }

  const givenAt = new Date(consent.given_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="rounded-xl border border-line bg-paper p-5">
      <h2 className="text-xl font-semibold">{strings.consent.title}</h2>
      <p className="text-base">{strings.consent.given} {givenAt}</p>
      {role === "OWNER" ? (
        <Button type="button" variant="danger" disabled={busy} onClick={withdraw}>
          {busy ? strings.common.saving : strings.consent.withdraw}
        </Button>
      ) : null}
      {error ? <ErrorMessage error={error} /> : null}
    </section>
  );
}
