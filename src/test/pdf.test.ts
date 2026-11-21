import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { checkPdf } from "@/lib/documents/pdf";

describe("checkPdf", () => {
  it("returns null for a 1-page PDF", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    expect(await checkPdf(bytes)).toBeNull();
  });

  it("returns null for a 5-page PDF", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 5; i++) {
      doc.addPage();
    }
    const bytes = await doc.save();
    expect(await checkPdf(bytes)).toBeNull();
  });

  it("returns PDF_TOO_LONG for a 6-page PDF", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 6; i++) {
      doc.addPage();
    }
    const bytes = await doc.save();
    expect(await checkPdf(bytes)).toBe("PDF_TOO_LONG");
  });

  it("returns UNSUPPORTED_FILE_TYPE for random bytes starting with %PDF-", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3, 4, 5]);
    expect(await checkPdf(bytes)).toBe("UNSUPPORTED_FILE_TYPE");
  });
});
