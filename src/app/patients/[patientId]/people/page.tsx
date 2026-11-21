import { loadPatientContext } from "@/lib/patients/context";
import { RevokeButton } from "./people-actions";
import { RemoveLoginButton } from "./people-actions";
import { CancelInviteButton } from "./people-actions";
import { InvitePanel } from "./invite-panel";
import { strings } from "@/strings/en";

export default async function PeoplePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const { role, supabase } = await loadPatientContext(patientId, `/patients/${patientId}`);
  const isOwner = role === "OWNER";

  const { data: caregivers } = await supabase
    .from("caregiver_links")
    .select("id, role, status, user_id, profiles(full_name, email)")
    .eq("patient_id", patientId)
    .order("created_at");

  const { data: patientLogin } = await supabase
    .from("patient_links")
    .select("user_id, profiles(full_name, email)")
    .eq("patient_id", patientId)
    .maybeSingle();

  const { data: invites } = await supabase
    .from("invites")
    .select("id, email, role, expires_at")
    .eq("patient_id", patientId)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-3xl font-semibold">{strings.people.title}</h1>
      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="text-xl font-semibold">{strings.people.caregivers}</h2>
        {(caregivers ?? []).map((link) => {
          const profile = (link as { profiles?: { full_name: string | null; email: string | null } | null }).profiles;
          const name = profile?.full_name ?? strings.patients.notSet;
          const email = profile?.email ?? strings.patients.notSet;
          const isRevoked = link.status === "REVOKED";
          return (
            <div key={link.id} className="flex items-center justify-between border-b border-line py-3 last:border-0">
              <div>
                <p className="font-semibold">{name}</p>
                <p className="text-sm text-muted">{email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted">{strings.roles[link.role as keyof typeof strings.roles]}</span>
                {isRevoked ? (
                  <span className="text-sm text-danger">{strings.people.revoked}</span>
                ) : isOwner && link.role !== "OWNER" ? (
                  <RevokeButton patientId={patientId} userId={link.user_id} />
                ) : null}
              </div>
            </div>
          );
        })}
        {(caregivers ?? []).length === 0 && <p className="text-muted">{strings.patients.empty}</p>}
      </section>
      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="text-xl font-semibold">{strings.people.patientLogin}</h2>
        {patientLogin ? (
          <div className="flex items-center justify-between border-b border-line py-3">
            <div>
              <p className="font-semibold">{patientLogin.profiles?.full_name ?? strings.patients.notSet}</p>
              <p className="text-sm text-muted">{patientLogin.profiles?.email ?? strings.patients.notSet}</p>
            </div>
            {isOwner ? <RemoveLoginButton patientId={patientId} /> : null}
          </div>
        ) : (
          <p className="text-muted">{strings.people.noPatientLogin}</p>
        )}
      </section>
      {isOwner && (
        <>
          <section className="rounded-xl border border-line bg-paper p-5">
            <h2 className="text-xl font-semibold">{strings.people.pendingInvites}</h2>
            {(invites ?? []).map((invite) => (
              <div key={invite.id} className="flex items-center justify-between border-b border-line py-3 last:border-0">
                <div>
                  <p className="font-semibold">{invite.email}</p>
                  <p className="text-sm text-muted">{strings.roles[invite.role as keyof typeof strings.roles]} · {strings.people.expires} {new Date(invite.expires_at).toLocaleDateString()}</p>
                </div>
                <CancelInviteButton patientId={patientId} inviteId={invite.id} />
              </div>
            ))}
            {(invites ?? []).length === 0 && <p className="text-muted">No pending invites.</p>}
          </section>
          <InvitePanel patientId={patientId} hasPatientLogin={!!patientLogin} />
        </>
      )}
    </div>
  );
}
