import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "./config";
import type { Database } from "./database.types";

export function createSupabaseBrowserClient() {
  const config = getPublicSupabaseConfig();
  return createBrowserClient<Database>(config.url, config.anonKey);
}
