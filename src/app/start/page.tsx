import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/session";

export default async function StartPage() {
  const { supabase, user } = await requirePageUser("/start");
  const { count: caregiverCount } = await supabase
    .from("caregiver_links")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "ACTIVE");
  if ((caregiverCount ?? 0) > 0) {
    redirect("/patients");
  }
  const { count: patientCount } = await supabase
    .from("patient_links")
    .select("patient_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((patientCount ?? 0) > 0) {
    redirect("/me");
  }
  redirect("/patients");
}
