import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/next-path";

describe("safeNextPath", () => {
  it("keeps a valid absolute path", () => {
    expect(safeNextPath("/patients/abc")).toBe("/patients/abc");
  });

  it("falls back to /start for unsafe or empty values", () => {
    expect(safeNextPath(null)).toBe("/start");
    expect(safeNextPath("")).toBe("/start");
    expect(safeNextPath("patients")).toBe("/start");
    expect(safeNextPath("//evil.example")).toBe("/start");
    expect(safeNextPath("https://evil.example")).toBe("/start");
    expect(safeNextPath("/\\evil")).toBe("/start");
  });
});
