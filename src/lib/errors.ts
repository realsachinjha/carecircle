export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "EXPIRED",
  "ALREADY_USED",
  "CONSENT_REQUIRED",
  "TOO_EARLY",
  "FILE_TOO_LARGE",
  "FILE_EMPTY",
  "UNSUPPORTED_FILE_TYPE",
  "PDF_TOO_LONG",
  "PDF_ENCRYPTED",
  "AI_UNAVAILABLE",
  "AI_INVALID_OUTPUT",
  "AI_BLOCKED",
  "AI_NOT_CONFIGURED",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  CONFLICT: 409,
  EXPIRED: 410,
  ALREADY_USED: 409,
  CONSENT_REQUIRED: 403,
  TOO_EARLY: 409,
  FILE_TOO_LARGE: 413,
  FILE_EMPTY: 400,
  UNSUPPORTED_FILE_TYPE: 415,
  PDF_TOO_LONG: 422,
  PDF_ENCRYPTED: 422,
  AI_UNAVAILABLE: 503,
  AI_INVALID_OUTPUT: 502,
  AI_BLOCKED: 422,
  AI_NOT_CONFIGURED: 503,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

export function statusFor(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}
