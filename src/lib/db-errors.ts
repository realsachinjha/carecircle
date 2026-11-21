import { AppError, isErrorCode, type ErrorCode } from "./errors";
import { strings } from "@/strings/en";

export function appError(code: ErrorCode): AppError {
  return new AppError(code, strings.errors[code]);
}

type DbError = { code?: string | null; message?: string | null };

export function fromDb(error: DbError): Error {
  const message = error.message ?? "";
  if (isErrorCode(message)) {
    return appError(message);
  }
  const code = error.code ?? "";
  if (code === "42501") {
    return appError("FORBIDDEN");
  }
  if (code === "23505") {
    return appError("CONFLICT");
  }
  if (code === "PGRST116") {
    return appError("NOT_FOUND");
  }
  if (code.startsWith("22") || code.startsWith("23")) {
    return appError("VALIDATION_FAILED");
  }
  return new Error("database");
}
