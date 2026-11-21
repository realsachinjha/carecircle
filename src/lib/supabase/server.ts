import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getPublicSupabaseConfig } from "./config";

export async function createSupabaseServerClient() {
  const config = getPublicSupabaseConfig();
  const cookieStore = await cookies();
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for") ?? "";
  const clientIp = forwarded.split(",")[0]?.trim() ?? "";
  return createServerClient(config.url, config.anonKey, {
    global: {
      headers: clientIp ? { "x-client-ip": clientIp } : {},
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
