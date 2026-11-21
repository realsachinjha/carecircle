import { strings } from "@/strings/en";

const BORDER_CLASSES: Record<string, string> = {
  PENDING: "border-line text-ink",
  PARSING: "border-accent text-accent-ink",
  PARSED: "border-warn text-warn",
  FAILED: "border-danger text-danger",
  VERIFIED: "border-ok text-ok",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-lg border-2 px-2 py-1 text-base ${BORDER_CLASSES[status] ?? "border-line text-ink"}`}>
      {strings.documents.statuses[status as keyof typeof strings.documents.statuses] ?? status}
    </span>
  );
}
