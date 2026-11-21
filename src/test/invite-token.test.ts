import { describe, expect, it } from "vitest";
import { hashInviteToken, inviteTokenSchema, newInviteToken } from "@/lib/auth/invite-token";

describe("invite-token", () => {
  it("newInviteToken returns a 43-character token and a 64-character lowercase hex hash", () => {
    const { token, hash } = newInviteToken();
    expect(token.length).toBe(43);
    expect(/^[A-Za-z0-9_-]{43}$/.test(token)).toBe(true);
    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it("hashInviteToken(token) equals the hash returned with it", () => {
    const { token, hash } = newInviteToken();
    expect(hashInviteToken(token)).toBe(hash);
  });

  it("two calls give different tokens", () => {
    const { token: a } = newInviteToken();
    const { token: b } = newInviteToken();
    expect(a).not.toBe(b);
  });

  it("inviteTokenSchema rejects bad lengths and invalid characters", () => {
    expect(inviteTokenSchema.safeParse("42").success).toBe(false);
    expect(inviteTokenSchema.safeParse("a".repeat(44)).success).toBe(false);
    expect(inviteTokenSchema.safeParse("a".repeat(43) + "+").success).toBe(false);
    expect(inviteTokenSchema.safeParse("a".repeat(43) + "/").success).toBe(false);
    expect(inviteTokenSchema.safeParse("a".repeat(43) + "=").success).toBe(false);
  });
});
