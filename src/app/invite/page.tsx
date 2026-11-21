import { InviteAccept } from "./invite-accept";
import { strings } from "@/strings/en";

export default function InvitePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <h1 className="text-3xl font-semibold">{strings.invite.title}</h1>
      <InviteAccept />
    </main>
  );
}
