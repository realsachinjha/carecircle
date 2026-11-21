import { z } from "zod";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { newInviteToken } from "@/lib/auth/invite-token";
import { appError, fromDb } from "@/lib/db-errors";
import { getEnv } from "@/lib/env";
import { isUuid } from "@/lib/ids";
import { parseInput, readJsonBody } from "@/lib/validation";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["CAREGIVER", "VIEWER", "PATIENT"]),
});

export const POST = handleRoute<{ patientId: string }>(async (request, { params }) => {
  if (!isUuid(params.patientId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const input = parseInput(inviteSchema, await readJsonBody(request));
  const { token, hash } = newInviteToken();
  const { data, error } = await supabase.rpc("create_invite", {
    p_patient: params.patientId,
    p_email: input.email,
    p_role: input.role,
    p_token_hash: hash,
  });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ inviteId: data, link: `${getEnv().appUrl}/invite#t=${token}` }, 201);
});
