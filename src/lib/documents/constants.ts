export const DOCUMENT_BUCKET = "medical-documents";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 5;
export const CONSENT_NOTICE_VERSION = "2026-11-v1";
export const DOCUMENT_TYPES = ["PRESCRIPTION", "LAB_REPORT", "DISCHARGE_SUMMARY", "OTHER"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
} as const;
export type DocumentMime = keyof typeof EXTENSION_BY_MIME;
export type DocumentExtension = (typeof EXTENSION_BY_MIME)[DocumentMime];
export const MIME_BY_EXTENSION: Record<DocumentExtension, DocumentMime> = {
  jpg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};
