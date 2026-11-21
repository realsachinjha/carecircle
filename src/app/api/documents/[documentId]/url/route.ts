import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { appError } from "@/lib/db-errors";
import { DOCUMENT_BUCKET } from "@/lib/documents/constants";
import { isUuid } from "@/lib/ids";

export const GET = handleRoute<{ documentId: string }>(async (_request, { params }) => {
  if (!isUuid(params.documentId)) {
    throw appError("NOT_FOUND");
  }
  const { supabase } = await requireApiUser();
  const { data: doc } = await supabase
    .from("medical_documents")
    .select("file_path, mime_type")
    .eq("id", params.documentId)
    .maybeSingle();
  if (!doc) {
    throw appError("NOT_FOUND");
  }
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(doc.file_path, 60);
  if (error || !data) {
    throw appError("NOT_FOUND");
  }
  return jsonOk({ url: data.signedUrl, mimeType: doc.mime_type, expiresInSeconds: 60 });
});
