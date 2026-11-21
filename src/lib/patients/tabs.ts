import type { PatientRole } from "./context";
import { strings } from "@/strings/en";

type Tab = { href: (patientId: string) => string; label: string; roles: PatientRole[] };

export const PATIENT_TABS: Tab[] = [
  { href: (id) => `/patients/${id}`, label: strings.tabs.overview, roles: ["OWNER", "CAREGIVER", "VIEWER"] },
  { href: (id) => `/patients/${id}/people`, label: strings.tabs.people, roles: ["OWNER", "CAREGIVER", "VIEWER"] },
];

export function tabsFor(role: PatientRole) {
  return PATIENT_TABS.filter((tab) => tab.roles.includes(role));
}
