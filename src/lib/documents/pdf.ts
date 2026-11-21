import "server-only";
import { PDFDocument } from "pdf-lib";
import { MAX_PDF_PAGES } from "./constants";

export type PdfProblem = "PDF_ENCRYPTED" | "PDF_TOO_LONG" | "UNSUPPORTED_FILE_TYPE";

export async function checkPdf(bytes: Uint8Array): Promise<PdfProblem | null> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (error instanceof Error && error.name === "EncryptedPDFError") {
      return "PDF_ENCRYPTED";
    }
    return "UNSUPPORTED_FILE_TYPE";
  }
  if (document.isEncrypted) {
    return "PDF_ENCRYPTED";
  }
  if (document.getPageCount() > MAX_PDF_PAGES) {
    return "PDF_TOO_LONG";
  }
  return null;
}
