"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi, type ApiFailure } from "@/lib/client/call-api";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { strings } from "@/strings/en";

export function RevokeButton({ patientId, userId }: { patientId: string; userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  async function revoke() {
    if (!window.confirm(strings.people.confirmRevoke)) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/patients/${patientId}/caregivers/${userId}`, "DELETE");
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }
  return (
    <>
      <Button type="button" variant="danger" disabled={busy} onClick={revoke}>
        {busy ? strings.common.saving : strings.people.revoke}
      </Button>
      {error ? <ErrorMessage error={error} /> : null}
    </>
  );
}

export function RemoveLoginButton({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  async function remove() {
    if (!window.confirm(strings.people.confirmRemoveLogin)) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/patients/${patientId}/patient-login`, "DELETE");
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }
  return (
    <>
      <Button type="button" variant="danger" disabled={busy} onClick={remove}>
        {busy ? strings.common.saving : strings.people.removeLogin}
      </Button>
      {error ? <ErrorMessage error={error} /> : null}
    </>
  );
}

export function CancelInviteButton({ patientId, inviteId }: { patientId: string; inviteId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  async function cancel() {
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/patients/${patientId}/invites/${inviteId}`, "DELETE");
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }
  return (
    <>
      <Button type="button" variant="danger" disabled={busy} onClick={cancel}>
        {busy ? strings.common.saving : strings.people.revokeInvite}
      </Button>
      {error ? <ErrorMessage error={error} /> : null}
    </>
  );
}