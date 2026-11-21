import Link from "next/link";
import { Disclaimer } from "@/components/disclaimer";
import { strings } from "@/strings/en";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <h1 className="text-3xl font-semibold">{strings.landing.title}</h1>
      <p className="text-lg">{strings.landing.body}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/sign-in" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 text-lg font-semibold text-accent-ink">
          {strings.landing.signIn}
        </Link>
        <Link href="/sign-up" className="inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-accent px-6 text-lg font-semibold text-accent">
          {strings.landing.signUp}
        </Link>
      </div>
      <Disclaimer />
    </main>
  );
}
