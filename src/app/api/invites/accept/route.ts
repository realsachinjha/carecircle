import { z } from "zod";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { hashInviteToken, inviteTokenSchema } from "@/lib/auth/invite-token";
import { fromDb } from "@/lib/db-errors";
import { parseInput, readJsonBody } from "@/lib/validation";

const acceptSchema = z.object({ token: inviteTokenSchema });

export const POST = handleRoute(async (request) => {
  const { supabase } = await requireApiUser();
  const { token } = parseInput(acceptSchema, await readJsonBody(request));
  const { data, error } = await supabase.rpc("accept_invite", { p_token_hash: hashInviteToken(token) });
  if (error) {
    throw fromDb(error);
  }
  const result = data as { patient_id: string; role: string };
  return jsonOk({ patientId: result.patient_id, role: result.role });
});
