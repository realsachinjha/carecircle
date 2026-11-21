import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";

export const POST = handleRoute<{ medicationId: string }>(async (request, { params }) => {
  if (!isUuid(params.medicationId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { error } = await supabase.rpc("stop_medication", {
    p_medication: params.medicationId,
  });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ ok: true });
});