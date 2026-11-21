import { describe, expect, it } from "vitest";
import { todayInZone, addDays, timeInZone } from "@/lib/time/local-date";

describe("todayInZone", () => {
  it("converts date correctly for Asia/Kolkata", () => {
    expect(todayInZone("Asia/Kolkata", new Date("2026-03-09T20:00:00Z"))).toBe("2026-03-10");
  });

  it("converts date correctly for America/Los_Angeles", () => {
    expect(todayInZone("America/Los_Angeles", new Date("2026-03-09T20:00:00Z"))).toBe("2026-03-09");
  });
});

describe("addDays", () => {
  it("adds days correctly", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-10", 29)).toBe("2026-04-08");
  });
});

describe("timeInZone", () => {
  it("converts time correctly for Asia/Kolkata", () => {
    expect(timeInZone("2026-03-10T02:30:00Z", "Asia/Kolkata")).toBe("08:00");
  });
});