import { describe, expect, it } from "vitest";
import { patientFieldsSchema, patientPatchSchema, toPatientColumns } from "@/lib/patients/schema";

describe("patient-schema", () => {
  it("FR-2.1 a full valid object passes, and empty optional strings become null", () => {
    const input = {
      fullName: "Ramesh",
      dateOfBirth: "1957-03-04",
      timezone: "Asia/Kolkata",
      missedAfterMinutes: 120,
      bloodGroup: "A+",
      primaryCondition: "",
      notes: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      physicianName: "",
      physicianPhone: "",
    };
    const result = patientFieldsSchema.parse(input);
    expect(result.fullName).toBe("Ramesh");
    expect(result.dateOfBirth).toBe("1957-03-04");
    expect(result.timezone).toBe("Asia/Kolkata");
    expect(result.missedAfterMinutes).toBe(120);
    expect(result.bloodGroup).toBe("A+");
    expect(result.primaryCondition).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.emergencyContactName).toBeNull();
    expect(result.emergencyContactPhone).toBeNull();
    expect(result.physicianName).toBeNull();
    expect(result.physicianPhone).toBeNull();
  });

  it("empty fullName fails", () => {
    expect(() => patientFieldsSchema.parse({ fullName: "", dateOfBirth: "1957-03-04", timezone: "Asia/Kolkata", missedAfterMinutes: 120 })).toThrow();
  });

  it("invalid dateOfBirth format fails", () => {
    expect(() => patientFieldsSchema.parse({ fullName: "Ramesh", dateOfBirth: "04/03/1957", timezone: "Asia/Kolkata", missedAfterMinutes: 120 })).toThrow();
  });

  it("missedAfterMinutes out of range fails", () => {
    expect(() => patientFieldsSchema.parse({ fullName: "Ramesh", dateOfBirth: "1957-03-04", timezone: "Asia/Kolkata", missedAfterMinutes: 29 })).toThrow();
    expect(() => patientFieldsSchema.parse({ fullName: "Ramesh", dateOfBirth: "1957-03-04", timezone: "Asia/Kolkata", missedAfterMinutes: 481 })).toThrow();
  });

  it("invalid bloodGroup fails", () => {
    expect(() => patientFieldsSchema.parse({ fullName: "Ramesh", dateOfBirth: "1957-03-04", timezone: "Asia/Kolkata", missedAfterMinutes: 120, bloodGroup: "C+" })).toThrow();
  });

  it("FR-2.2 patientPatchSchema accepts a single field, and toPatientColumns returns only that column", () => {
    const patch = patientPatchSchema.parse({ notes: "x" });
    expect(patch.notes).toBe("x");
    expect(toPatientColumns(patch)).toEqual({ notes: "x" });
  });

  it("toPatientColumns({ bloodGroup: null }) returns { blood_group: null }", () => {
    expect(toPatientColumns({ bloodGroup: null })).toEqual({ blood_group: null });
  });
});
