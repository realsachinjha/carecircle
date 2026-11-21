import type { ReactNode } from "react";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-5">
      {title ? <h2 className="text-xl font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}
