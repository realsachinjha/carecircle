import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  APP_URL: "http://localhost:3000/",
};

describe("parseEnv", () => {
  it("accepts the minimum set, defaults demo mode off, trims the trailing slash", () => {
    const env = parseEnv(valid);
    expect(env.demoMode).toBe(false);
    expect(env.appUrl).toBe("http://localhost:3000");
  });

  it("turns DEMO_MODE=true into true", () => {
    expect(parseEnv({ ...valid, DEMO_MODE: "true" }).demoMode).toBe(true);
  });

  it("names a missing Supabase URL", () => {
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: undefined })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("rejects a malformed APP_URL", () => {
    expect(() => parseEnv({ ...valid, APP_URL: "not a url" })).toThrow(/APP_URL/);
  });

  it("rejects an unknown DEMO_MODE value", () => {
    expect(() => parseEnv({ ...valid, DEMO_MODE: "yes" })).toThrow(/DEMO_MODE/);
  });
});
