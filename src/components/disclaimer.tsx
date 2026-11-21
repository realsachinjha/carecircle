import { strings } from "@/strings/en";

export function Disclaimer({ variant = "full" }: { variant?: "full" | "footer" }) {
  return (
    <p role="note" className="text-base text-ink">
      {variant === "footer" ? strings.footerDisclaimer : strings.disclaimer}
    </p>
  );
}
