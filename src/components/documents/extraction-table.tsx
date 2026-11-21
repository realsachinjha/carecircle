import { Notice } from "@/components/ui/notice";
import { Extraction, ExtractedMedicine, flagsFor } from "@/lib/gemini/schema";
import { strings } from "@/strings/en";

function renderSlots(slots: string[]): string {
  if (slots.length === 0) {
    return strings.documents.notSet;
  }
  return slots.map((s) => strings.slots[s as keyof typeof strings.slots]).join(", ");
}

function medicineCard(medicine: ExtractedMedicine, flags: ReturnType<typeof flagsFor>) {
  const flagLabels: string[] = [];
  if (flags.missingField) {
    flagLabels.push(strings.documents.flags.missingField);
  }
  if (flags.slotMismatch) {
    flagLabels.push(strings.documents.flags.slotMismatch);
  }
  if (flags.lowConfidence) {
    flagLabels.push(strings.documents.flags.lowConfidence);
  }
  return (
    <section key={medicine.name} className={`rounded-lg border border-line bg-paper p-4 ${flags.needsAttention ? "border-l-4 border-warn" : ""}`}>
      <dl className="flex flex-col gap-2">
        <div className="flex justify-between">
          <dt className="text-muted">{strings.documents.columns.name}</dt>
          <dd>{medicine.name}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{strings.documents.columns.dosage}</dt>
          <dd>{medicine.dosage}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{strings.documents.columns.frequency}</dt>
          <dd>{medicine.frequency_per_day}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{strings.documents.columns.slots}</dt>
          <dd>{renderSlots(medicine.slots)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{strings.documents.columns.duration}</dt>
          <dd>{medicine.duration_days ?? strings.documents.notSet}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{strings.documents.columns.instructions}</dt>
          <dd>{medicine.instructions ?? strings.documents.notSet}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{strings.documents.columns.confidence}</dt>
          <dd>{strings.documents.confidence[medicine.confidence]}</dd>
        </div>
      </dl>
      {flags.needsAttention && (
        <p className="text-sm text-muted mt-2">{flagLabels.join(", ")}</p>
      )}
    </section>
  );
}

export function ExtractionTable({ extraction, demoMode }: { extraction: Extraction; demoMode: boolean }) {
  if (demoMode) {
    return (
      <>
        <Notice tone="warning">{strings.documents.demoBadge}</Notice>
        <ExtractionTableBody extraction={extraction} />
      </>
    );
  }
  return <ExtractionTableBody extraction={extraction} />;
}

function ExtractionTableBody({ extraction }: { extraction: Extraction }) {
  if (extraction.medicines.length === 0) {
    return <p className="text-lg">{strings.documents.noMedicines}</p>;
  }

  const needsAnyAttention = extraction.medicines.some((m) => flagsFor(m).needsAttention);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{strings.documents.extractedTitle}</h2>
      <p className="text-base">{strings.documents.extractedIntro}</p>
      {needsAnyAttention && (
        <Notice tone="warning">{strings.documents.checkPhoto}</Notice>
      )}
      <div className="md:hidden flex flex-col gap-3">
        {extraction.medicines.map((medicine) => medicineCard(medicine, flagsFor(medicine)))}
      </div>
      <table className="hidden md:table w-full border-collapse">
        <thead>
          <tr className="border-b border-line text-left">
            {["name", "dosage", "frequency", "slots", "duration", "instructions", "confidence"].map((col) => (
              <th key={col} className="pb-2 text-muted font-semibold">{strings.documents.columns[col as keyof typeof strings.documents.columns]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {extraction.medicines.map((medicine) => {
            const flags = flagsFor(medicine);
            return (
              <tr key={medicine.name} className={`border-b border-line ${flags.needsAttention ? "border-l-4 border-warn" : ""}`}>
                <td className="py-2">{medicine.name}</td>
                <td className="py-2">{medicine.dosage}</td>
                <td className="py-2">{medicine.frequency_per_day}</td>
                <td className="py-2">{renderSlots(medicine.slots)}</td>
                <td className="py-2">{medicine.duration_days ?? strings.documents.notSet}</td>
                <td className="py-2">{medicine.instructions ?? strings.documents.notSet}</td>
                <td className="py-2">{strings.documents.confidence[medicine.confidence]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
