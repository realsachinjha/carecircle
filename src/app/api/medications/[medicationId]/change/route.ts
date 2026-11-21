import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";
import { medicineSchema } from "@/lib/medicines/schema";
import { draftToInput } from "@/lib/medicines/defaults";
import { parseInput, readJsonBody } from "@/lib/validation";

export const POST = handleRoute<{ medicationId: string }>(async (request, { params }) => {
  if (!isUuid(params.medicationId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const input = parseInput(medicineSchema, await readJsonBody(request));
  const body = draftToInput(input as import("@/lib/medicines/defaults").MedicineDraft);
  const { data, error } = await supabase.rpc("change_medication", {
    p_medication: params.medicationId,
    p_medicine: body,
  });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ medicationId: data }, 201);
});