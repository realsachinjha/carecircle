import type { z } from "zod";
import { appError } from "./db-errors";

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw appError("VALIDATION_FAILED");
  }
  return result.data;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw appError("VALIDATION_FAILED");
  }
}
