import { z } from "zod";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import { DOCUMENT_BUCKET, DOCUMENT_TYPES, MIME_BY_EXTENSION } from "@/lib/documents/constants";
import { sha256Hex } from "@/lib/documents/digest";
import { checkFileSize, detectFileType } from "@/lib/documents/file-check";
import { checkPdf } from "@/lib/documents/pdf";
import { isUuid, uuidSchema } from "@/lib/ids";
import { parseInput, readJsonBody } from "@/lib/validation";

const registerSchema = z.object({
  documentId: uuidSchema,
  extension: z.enum(["jpg", "png", "pdf"]),
  documentType: z.enum(DOCUMENT_TYPES),
  doctorName: z.string().trim().max(128).optional(),
  clinicName: z.string().trim().max(128).optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const POST = handleRoute<{ patientId: string }>(async (request, { params }) => {
  if (!isUuid(params.patientId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const input = parseInput(registerSchema, await readJsonBody(request));
  const path = `${params.patientId}/${input.documentId}.${input.extension}`;
  const { data: blob, error: downloadError } = await supabase.storage.from(DOCUMENT_BUCKET).download(path);
  if (downloadError || !blob) {
    throw appError("VALIDATION_FAILED");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sizeProblem = checkFileSize(bytes.byteLength);
  if (sizeProblem) {
    throw appError(sizeProblem);
  }
  const detected = detectFileType(bytes);
  if (!detected || detected !== MIME_BY_EXTENSION[input.extension]) {
    throw appError("UNSUPPORTED_FILE_TYPE");
  }
  if (detected === "application/pdf") {
    const pdfProblem = await checkPdf(bytes);
    if (pdfProblem) {
      throw appError(pdfProblem);
    }
  }
  const { data, error } = await supabase.rpc("register_document", {
    p_document: input.documentId,
    p_patient: params.patientId,
    p_mime_type: detected,
    p_size_bytes: bytes.byteLength,
    p_sha256: sha256Hex(bytes),
    p_document_type: input.documentType,
    p_doctor_name: input.doctorName ?? undefined,
    p_clinic_name: input.clinicName ?? undefined,
    p_issue_date: input.issueDate ?? undefined,
  });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ documentId: data }, 201);
});
