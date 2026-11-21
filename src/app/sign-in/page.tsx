import { SignInForm } from "./sign-in-form";
import { safeNextPath } from "@/lib/auth/next-path";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <SignInForm next={safeNextPath(next)} linkFailed={error === "link"} />
    </main>
  );
}
