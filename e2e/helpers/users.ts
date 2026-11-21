import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

const PASSWORD = "Test-password-123";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in .env.local`);
  }
  return value;
}

export function adminClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = { id: string; email: string; password: string; fullName: string };

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const fullName = `${label} Tester`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    throw new Error(`createUser failed: ${error?.message}`);
  }
  return { id: data.user.id, email, password: PASSWORD, fullName };
}

export async function userClient(user: TestUser) {
  const client = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) {
    throw new Error(`signIn failed: ${error.message}`);
  }
  return client;
}

export async function signInViaUi(page: Page, user: TestUser, next = "/start") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByRole("tab", { name: "Use a password" }).click();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

export async function acceptInvite(page: Page, user: TestUser, link: string) {
  await page.goto(link);
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Sign in to accept" }).click();
  await page.getByRole("tab", { name: "Use a password" }).click();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
}

export async function createPatientAs(user: TestUser, fullName: string): Promise<string> {
  const client = await userClient(user);
  const { data, error } = await client.rpc("create_patient", {
    p_full_name: fullName,
    p_date_of_birth: "1957-03-04",
    p_timezone: "Asia/Kolkata",
    p_missed_after_minutes: 120,
  });
  if (error || typeof data !== "string") {
    throw new Error(`create_patient failed: ${error?.message}`);
  }
  return data;
}
