import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";

export const DELETE = handleRoute<{ patientId: string; inviteId: string }>(async (request, { params }) => {
  if (!isUuid(params.patientId) || !isUuid(params.inviteId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { error } = await supabase.rpc("revoke_invite", { p_invite: params.inviteId });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ ok: true });
});
