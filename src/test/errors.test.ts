import { describe, expect, it } from "vitest";
import { AppError, ERROR_CODES, isErrorCode, statusFor } from "@/lib/errors";

describe("errors", () => {
  it("maps every error code to a 4xx or 5xx status", () => {
    for (const code of ERROR_CODES) {
      expect(statusFor(code)).toBeGreaterThanOrEqual(400);
      expect(statusFor(code)).toBeLessThanOrEqual(599);
    }
  });

  it("carries code and status on AppError", () => {
    const error = new AppError("NOT_FOUND", "Missing");
    expect(error.code).toBe("NOT_FOUND");
    expect(error.status).toBe(404);
  });

  it("recognises known codes and rejects unknown ones", () => {
    expect(isErrorCode("EXPIRED")).toBe(true);
    expect(isErrorCode("expired")).toBe(false);
    expect(isErrorCode(42)).toBe(false);
  });
});
