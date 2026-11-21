"use client";

import { useState } from "react";
import { callApi, type ApiFailure } from "@/lib/client/call-api";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { strings } from "@/strings/en";

export function InvitePanel({ patientId, hasPatientLogin }: { patientId: string; hasPatientLogin: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("CAREGIVER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const roles = ["CAREGIVER", "VIEWER", ...(hasPatientLogin ? [] : ["PATIENT"])] as const;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setLink(null);
    const result = await callApi<{ inviteId: string; link: string }>(`/api/patients/${patientId}/invites`, "POST", {
      email,
      role,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLink(result.data.link);
  }

  async function copy() {
    if (!link) {
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    if (!link || !navigator.share) {
      return;
    }
    await navigator.share({ title: strings.appName, text: strings.people.inviteShareText, url: link });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField id="invite-email" label={strings.people.inviteEmail} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <SelectField id="invite-role" label={strings.people.inviteRole} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
        {roles.map((r) => (
          <option key={r} value={r}>
            {strings.roles[r as keyof typeof strings.roles]}
          </option>
        ))}
      </SelectField>
      <p className="text-base text-muted">{strings.people.inviteRoleHelp[role as keyof typeof strings.people.inviteRoleHelp]}</p>
      {error ? <ErrorMessage error={error} /> : null}
      <Button type="submit" disabled={busy}>{busy ? strings.common.saving : strings.people.createInvite}</Button>
      {link ? (
        <div className="flex flex-col gap-3">
          <Notice tone="success">{strings.people.inviteReady}</Notice>
          <div className="flex gap-2">
            <input id="invite-link" readOnly value={link} className="flex-1 min-h-12 rounded-lg border-2 border-line px-3 text-lg" />
            <Button type="button" onClick={copy}>{copied ? strings.common.copied : strings.common.copy}</Button>
            {typeof (navigator as { share?: () => Promise<void> }).share === "function" ? <Button type="button" variant="secondary" onClick={share}>{strings.common.share}</Button> : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}
