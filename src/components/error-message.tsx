import type { ApiFailure } from "@/lib/client/call-api";
import { Notice } from "@/components/ui/notice";
import { strings } from "@/strings/en";

export function ErrorMessage({ error }: { error: ApiFailure | null }) {
  if (!error) {
    return null;
  }
  const text = error.code === "OFFLINE" ? strings.offline : strings.errors[error.code];
  return (
    <Notice tone="error">
      {text}
      {error.code === "INTERNAL" && error.requestId ? ` ${error.requestId}` : null}
    </Notice>
  );
}
