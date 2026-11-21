import type { ReactNode } from "react";

const TONE_CLASSES = {
  info: "border-accent text-ink",
  success: "border-ok text-ok",
  warning: "border-warn text-warn",
  error: "border-danger text-danger",
} as const;

export function Notice({ tone = "info", children }: { tone?: keyof typeof TONE_CLASSES; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border-l-4 bg-panel p-4 text-base ${TONE_CLASSES[tone]}`}>
      {children}
    </div>
  );
}
