import { z } from "zod";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { fromDb } from "@/lib/db-errors";
import { parseInput, readJsonBody } from "@/lib/validation";

const accountSchema = z.object({
  fullName: z.string().trim().min(1).max(128),
  phone: z.string().trim().max(32).transform((value) => (value === "" ? null : value)).nullable().optional(),
});

export const PATCH = handleRoute(async (request) => {
  const { supabase } = await requireApiUser();
  const input = parseInput(accountSchema, await readJsonBody(request));
  const { error } = await supabase.rpc("update_my_profile", {
    p_full_name: input.fullName,
    p_phone: input.phone ?? "",
  });
  if (error) {
    throw fromDb(error);
  }
  return jsonOk({ ok: true });
});
