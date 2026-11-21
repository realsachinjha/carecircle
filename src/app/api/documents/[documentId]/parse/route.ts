import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError, fromDb } from "@/lib/db-errors";
import type { Json } from "@/lib/supabase/database.types";
import { DOCUMENT_BUCKET } from "@/lib/documents/constants";
import { extractMedicines } from "@/lib/gemini/extract";
import { isUuid } from "@/lib/ids";

export const POST = handleRoute<{ documentId: string }>(async (_request, { params }) => {
  if (!isUuid(params.documentId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { data: claim, error: claimError } = await supabase.rpc("claim_document_for_parse", {
    p_document: params.documentId,
  });
  if (claimError) {
    throw fromDb(claimError);
  }
  const claimed = claim as { file_path: string; mime_type: string };
  const { data: blob } = await supabase.storage.from(DOCUMENT_BUCKET).download(claimed.file_path);
  const result = blob
    ? await extractMedicines(new Uint8Array(await blob.arrayBuffer()), claimed.mime_type)
    : ({ ok: false, code: "AI_UNAVAILABLE", raw: null } as const);
  const { data: status, error: recordError } = await supabase.rpc("record_parse_result", {
    p_document: params.documentId,
    p_ok: result.ok,
    p_raw: (result.ok ? result.extraction : result.raw) as unknown as Json,
    p_error_code: result.ok ? "" : result.code,
  });
  if (recordError) {
    throw fromDb(recordError);
  }
  return jsonOk({ status, code: result.ok ? null : result.code });
});
