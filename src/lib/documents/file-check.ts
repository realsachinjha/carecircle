import { MAX_FILE_BYTES, type DocumentMime } from "./constants";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

export function detectFileType(bytes: Uint8Array): DocumentMime | null {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return "image/png";
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return "image/jpeg";
  }
  if (startsWith(bytes, PDF_SIGNATURE)) {
    return "application/pdf";
  }
  return null;
}

export type SizeProblem = "FILE_EMPTY" | "FILE_TOO_LARGE";

export function checkFileSize(size: number): SizeProblem | null {
  if (size <= 0) {
    return "FILE_EMPTY";
  }
  if (size > MAX_FILE_BYTES) {
    return "FILE_TOO_LARGE";
  }
  return null;
}
