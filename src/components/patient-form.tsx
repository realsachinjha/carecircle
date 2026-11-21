"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi, type ApiFailure } from "@/lib/client/call-api";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { TextArea } from "@/components/ui/field";
import { SelectField } from "@/components/ui/field";
import { BLOOD_GROUPS, type PatientFields } from "@/lib/patients/schema";
import { strings } from "@/strings/en";

export function PatientForm({
  mode,
  patientId,
  initial,
}: {
  mode: "create" | "edit";
  patientId?: string;
  initial?: Partial<PatientFields>;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth ?? "");
  const [timezone, setTimezone] = useState(initial?.timezone ?? "Asia/Kolkata");
  const [missedAfterMinutes, setMissedAfterMinutes] = useState(String(initial?.missedAfterMinutes ?? 120));
  const [bloodGroup, setBloodGroup] = useState<string | null>(initial?.bloodGroup ?? null);
  const [primaryCondition, setPrimaryCondition] = useState<string | null>(initial?.primaryCondition ?? null);
  const [notes, setNotes] = useState<string | null>(initial?.notes ?? null);
  const [emergencyContactName, setEmergencyContactName] = useState<string | null>(initial?.emergencyContactName ?? null);
  const [emergencyContactPhone, setEmergencyContactPhone] = useState<string | null>(initial?.emergencyContactPhone ?? null);
  const [physicianName, setPhysicianName] = useState<string | null>(initial?.physicianName ?? null);
  const [physicianPhone, setPhysicianPhone] = useState<string | null>(initial?.physicianPhone ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      fullName,
      dateOfBirth,
      timezone,
      missedAfterMinutes: Number(missedAfterMinutes),
      bloodGroup: bloodGroup === null || bloodGroup === "" ? null : bloodGroup,
      primaryCondition: primaryCondition === null || primaryCondition === "" ? null : primaryCondition,
      notes: notes === null || notes === "" ? null : notes,
      emergencyContactName: emergencyContactName === null || emergencyContactName === "" ? null : emergencyContactName,
      emergencyContactPhone: emergencyContactPhone === null || emergencyContactPhone === "" ? null : emergencyContactPhone,
      physicianName: physicianName === null || physicianName === "" ? null : physicianName,
      physicianPhone: physicianPhone === null || physicianPhone === "" ? null : physicianPhone,
    };
    let result;
    if (mode === "create") {
      result = await callApi<{ patientId: string }>("/api/patients", "POST", body);
      if (result.ok) {
        router.push(`/patients/${result.data.patientId}`);
      }
    } else {
      result = await callApi(`/api/patients/${patientId}`, "PATCH", body);
      if (result.ok) {
        router.push(`/patients/${patientId}`);
        router.refresh();
      }
    }
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField id="fullName" label={strings.patients.fields.fullName} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <TextField id="dateOfBirth" label={strings.patients.fields.dateOfBirth} type="date" required max={today} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
      <TextField id="timezone" label={strings.patients.fields.timezone} required hint={strings.patients.fields.timezoneHint} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
      <TextField id="missedAfterMinutes" label={strings.patients.fields.missedAfterMinutes} type="number" min={30} max={480} step={15} hint={strings.patients.fields.missedAfterHint} value={missedAfterMinutes} onChange={(e) => setMissedAfterMinutes(e.target.value)} />
      <SelectField id="bloodGroup" label={strings.patients.fields.bloodGroup} value={bloodGroup ?? ""} onChange={(e) => setBloodGroup(e.target.value || null)}>
        <option value="">{strings.patients.notSet}</option>
        {BLOOD_GROUPS.map((group) => (
          <option key={group} value={group}>{group}</option>
        ))}
      </SelectField>
      <TextArea id="primaryCondition" label={strings.patients.fields.primaryCondition} value={primaryCondition ?? ""} onChange={(e) => setPrimaryCondition(e.target.value)} />
      <TextArea id="notes" label={strings.patients.fields.notes} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
      <TextField id="emergencyContactName" label={strings.patients.fields.emergencyContactName} value={emergencyContactName ?? ""} onChange={(e) => setEmergencyContactName(e.target.value)} />
      <TextField id="emergencyContactPhone" label={strings.patients.fields.emergencyContactPhone} type="tel" value={emergencyContactPhone ?? ""} onChange={(e) => setEmergencyContactPhone(e.target.value)} />
      <TextField id="physicianName" label={strings.patients.fields.physicianName} value={physicianName ?? ""} onChange={(e) => setPhysicianName(e.target.value)} />
      <TextField id="physicianPhone" label={strings.patients.fields.physicianPhone} type="tel" value={physicianPhone ?? ""} onChange={(e) => setPhysicianPhone(e.target.value)} />
      <ErrorMessage error={error} />
      <Button type="submit" disabled={busy}>{busy ? strings.common.saving : mode === "create" ? strings.patients.create : strings.common.save}</Button>
    </form>
  );
}
