import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}
