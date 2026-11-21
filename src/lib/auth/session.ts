import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appError } from "@/lib/db-errors";

export async function requirePageUser(returnTo: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  }
  return { supabase, user: data.user };
}

export async function requireApiUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    throw appError("UNAUTHENTICATED");
  }
  return { supabase, user: data.user };
}
