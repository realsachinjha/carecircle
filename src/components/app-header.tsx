import Link from "next/link";
import { strings } from "@/strings/en";

export function AppHeader({ showCaregiverNav = true }: { showCaregiverNav?: boolean }) {
  return (
    <header className="border-b border-line bg-panel">
      <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 p-4">
        <Link href="/start" className="text-xl font-bold">{strings.appName}</Link>
        {showCaregiverNav ? <Link href="/patients" className="underline">{strings.nav.patients}</Link> : null}
        <Link href="/account" className="underline">{strings.nav.account}</Link>
        <form action="/auth/sign-out" method="post" className="ml-auto">
          <button type="submit" className="min-h-12 px-2 underline">{strings.nav.signOut}</button>
        </form>
      </nav>
    </header>
  );
}
