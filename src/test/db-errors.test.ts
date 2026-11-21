import { describe, expect, it } from "vitest";
import { appError, fromDb } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";

describe("db-errors", () => {
  it("maps an error code message to an AppError", () => {
    const error = fromDb({ message: "EXPIRED", code: "P0001" });
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("EXPIRED");
  });

  it("maps 42501 to FORBIDDEN", () => {
    const error = fromDb({ code: "42501", message: "permission denied" });
    expect((error as AppError).code).toBe("FORBIDDEN");
  });

  it("maps 23505 to CONFLICT", () => {
    const error = fromDb({ code: "23505" });
    expect((error as AppError).code).toBe("CONFLICT");
  });

  it("maps 22xxx and 23xxx to VALIDATION_FAILED", () => {
    expect((fromDb({ code: "22008" }) as AppError).code).toBe("VALIDATION_FAILED");
    expect((fromDb({ code: "23514" }) as AppError).code).toBe("VALIDATION_FAILED");
  });

  it("returns a plain Error for unknown codes", () => {
    const error = fromDb({ code: "XX000", message: "boom" });
    expect(error).not.toBeInstanceOf(AppError);
    expect(error.message).toBe("database");
  });

  it("appError carries the message from strings", () => {
    const error = appError("NOT_FOUND");
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("We could not find that.");
  });
});
