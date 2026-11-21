import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  APP_URL: z.string().url(),
});

export type Env = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  geminiApiKey: string | undefined;
  geminiModel: string | undefined;
  demoMode: boolean;
  appUrl: string;
};

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment: ${names}`);
  }
  const value = parsed.data;
  return {
    supabaseUrl: value.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: value.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    geminiApiKey: value.GEMINI_API_KEY,
    geminiModel: value.GEMINI_MODEL,
    demoMode: value.DEMO_MODE === "true",
    appUrl: value.APP_URL.replace(/\/$/, ""),
  };
}

export function getEnv(): Env {
  return parseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    DEMO_MODE: process.env.DEMO_MODE,
    APP_URL: process.env.APP_URL,
  });
}
