import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";

export const DELETE = handleRoute<{ patientId: string }>(async (request, { params }) => {
  if (!isUuid(params.patientId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { error } = await supabase.rpc("remove_patient_login", { p_patient: params.patientId });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ ok: true });
});
