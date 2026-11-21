import { describe, expect, it } from "vitest";
import { checkFileSize, detectFileType } from "@/lib/documents/file-check";

describe("detectFileType", () => {
  it("detects PNG signature", () => {
    expect(detectFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
  });

  it("detects JPEG signature", () => {
    expect(detectFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("detects PDF signature", () => {
    expect(detectFileType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
  });

  it("returns null for MZ (Windows executable)", () => {
    expect(detectFileType(new Uint8Array([0x4d, 0x5a]))).toBeNull();
  });

  it("returns null for GIF89a", () => {
    expect(detectFileType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(detectFileType(new Uint8Array([]))).toBeNull();
  });

  it("returns null for truncated PNG", () => {
    expect(detectFileType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe("checkFileSize", () => {
  it("returns FILE_EMPTY for 0 bytes", () => {
    expect(checkFileSize(0)).toBe("FILE_EMPTY");
  });

  it("returns null for exactly 10 MB", () => {
    expect(checkFileSize(10 * 1024 * 1024)).toBeNull();
  });

  it("returns FILE_TOO_LARGE for 10 MB + 1 byte", () => {
    expect(checkFileSize(10 * 1024 * 1024 + 1)).toBe("FILE_TOO_LARGE");
  });
});
