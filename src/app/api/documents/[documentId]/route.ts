import { z } from "zod";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import type { Database } from "@/lib/supabase/database.types";
import { isUuid } from "@/lib/ids";
import { parseInput, readJsonBody } from "@/lib/validation";

type DocumentUpdate = Database["public"]["Tables"]["medical_documents"]["Update"];

const patchSchema = z.object({
  documentType: z.enum(["PRESCRIPTION", "LAB_REPORT", "DISCHARGE_SUMMARY", "OTHER"]).optional(),
  doctorName: z.string().trim().max(128).optional().transform((v) => (v === "" ? null : v)),
  clinicName: z.string().trim().max(128).optional().transform((v) => (v === "" ? null : v)),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().transform((v) => (v === "" ? null : v)),
});

export const PATCH = handleRoute<{ documentId: string }>(async (request, { params }) => {
  if (!isUuid(params.documentId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { data: doc } = await supabase
    .from("medical_documents")
    .select("patient_id")
    .eq("id", params.documentId)
    .maybeSingle();
  if (!doc) {
    throw appError("NOT_FOUND");
  }
  const { data: role } = await supabase.rpc("my_role", { p_patient: doc.patient_id });
  if (!role) {
    throw appError("NOT_FOUND");
  }
  if (role !== "OWNER" && role !== "CAREGIVER") {
    throw appError("FORBIDDEN");
  }
  const input = parseInput(patchSchema, await readJsonBody(request));
  const updateData: DocumentUpdate = {
    ...(input.documentType !== undefined ? { document_type: input.documentType } : {}),
    ...(input.doctorName !== undefined ? { doctor_name: input.doctorName } : {}),
    ...(input.clinicName !== undefined ? { clinic_name: input.clinicName } : {}),
    ...(input.issueDate !== undefined ? { issue_date: input.issueDate } : {}),
  };
  if (Object.keys(updateData).length === 0) {
    throw appError("VALIDATION_FAILED");
  }
  const { error } = await supabase.from("medical_documents").update(updateData).eq("id", params.documentId);
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ ok: true });
});
