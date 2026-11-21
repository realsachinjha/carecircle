"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Disclaimer } from "@/components/disclaimer";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { strings } from "@/strings/en";

export default function SignUpPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    const supabase = createSupabaseBrowserClient();
    const { error: supabaseError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/start`,
      },
    });
    setBusy(false);
    if (supabaseError) {
      setError(true);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
        <h1 className="text-3xl font-semibold">{strings.auth.signUpTitle}</h1>
        <Notice tone="success">{strings.auth.checkEmail}</Notice>
        <p className="text-lg">{strings.auth.signUpIntro}</p>
        <Disclaimer />
        <a href="/sign-in" className="underline">
          {strings.auth.haveAccount}
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <h1 className="text-3xl font-semibold">{strings.auth.signUpTitle}</h1>
      <p className="text-lg">{strings.auth.signUpIntro}</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField id="fullName" label={strings.auth.fullName} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <TextField id="email" label={strings.auth.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField id="password" label={strings.auth.password} type="password" autoComplete="new-password" required minLength={8} hint={strings.auth.passwordHint} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <Notice tone="error">{strings.errors.VALIDATION_FAILED}</Notice> : null}
        <Button type="submit" disabled={busy}>{busy ? strings.common.saving : strings.auth.createAccount}</Button>
      </form>
      <Disclaimer />
      <p className="text-lg">
        {strings.auth.haveAccount} <a href="/sign-in" className="underline">
          {strings.auth.signIn}
        </a>
      </p>
    </main>
  );
}
