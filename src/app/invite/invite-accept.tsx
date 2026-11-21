"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { callApi, type ApiFailure } from "@/lib/client/call-api";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ErrorMessage } from "@/components/error-message";
import { Notice } from "@/components/ui/notice";
import { strings } from "@/strings/en";

const STORAGE_KEY = "carecircle.inviteToken";

type State = "loading" | "missing" | "signin" | "accepting" | "failed";

function readToken(): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("t");
  if (fromHash) {
    sessionStorage.setItem(STORAGE_KEY, fromHash);
    window.history.replaceState(null, "", window.location.pathname);
    return fromHash;
  }
  return sessionStorage.getItem(STORAGE_KEY);
}

export function InviteAccept() {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<ApiFailure | null>(null);

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setTimeout(() => setState("missing"), 0);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setState("signin");
        return;
      }
      setState("accepting");
      const result = await callApi<{ patientId: string; role: string }>("/api/invites/accept", "POST", { token });
      if (!result.ok) {
        if (result.error.code !== "OFFLINE" && result.error.code !== "INTERNAL") {
          sessionStorage.removeItem(STORAGE_KEY);
        }
        setError(result.error);
        setState("failed");
        return;
      }
      sessionStorage.removeItem(STORAGE_KEY);
      router.replace(result.data.role === "PATIENT" ? "/me" : `/patients/${result.data.patientId}`);
    });
  }, [router]);

  if (state === "missing") {
    return <Notice tone="error">{strings.invite.missing}</Notice>;
  }
  if (state === "signin") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg">{strings.invite.signInFirst}</p>
        <Link href="/sign-in?next=/invite" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 text-lg font-semibold text-accent-ink">
          {strings.invite.signInButton}
        </Link>
      </div>
    );
  }
  if (state === "failed") {
    return error?.code === "FORBIDDEN" ? <Notice tone="error">{strings.invite.wrongEmail}</Notice> : <ErrorMessage error={error} />;
  }
  return <p className="text-lg" role="status">{strings.invite.accepting}</p>;
}
