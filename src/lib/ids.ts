import { z } from "zod";

export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}
