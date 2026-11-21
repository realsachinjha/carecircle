import { expect, test } from "@playwright/test";
import {
  acceptInvite,
  createPatientAs,
  createTestUser,
  signInViaUi,
} from "./helpers/users";

test("FR-1.1 sign-up shows the check-email message", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto("/sign-up");
  await page.getByLabel("Your full name").fill("E2e Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email and tap the confirmation link. Then sign in.")).toBeVisible();
});

test("FR-1.2 password sign-in lands on the patient list", async ({ page }) => {
  const user = await createTestUser("owner");
  await signInViaUi(page, user);
  await expect(page).toHaveURL("/patients");
  await expect(page.getByRole("heading", { name: "People I care for" })).toBeVisible();
});

test("FR-2.1 owner creates a patient through the form", async ({ page }) => {
  const user = await createTestUser("owner");
  await signInViaUi(page, user);
  await page.getByRole("link", { name: "Add a person" }).click();
  await page.getByLabel("Full name").fill("Ramesh Demo");
  await page.getByLabel("Date of birth").fill("1957-03-04");
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByRole("heading", { name: "Ramesh Demo" })).toBeVisible();
  await expect(page.getByText("Your role: Owner")).toBeVisible();
});

test("FR-3.1 FR-3.2 owner invites a caregiver who accepts", async ({ page, browser }) => {
  const owner = await createTestUser("owner");
  const caregiver = await createTestUser("caregiver");
  const patientId = await createPatientAs(owner, "Ramesh Demo");
  await signInViaUi(page, owner);
  await page.getByRole("link", { name: "Ramesh Demo" }).click();
  await page.waitForURL((url) => url.pathname === `/patients/${patientId}`);
  await page.getByRole("heading", { name: "Ramesh Demo" }).waitFor();
  await page.getByRole("link", { name: "People", exact: true }).click();
  await page.getByLabel("Their email").fill(caregiver.email);
  await page.getByLabel("Role").selectOption("CAREGIVER");
  await page.getByRole("button", { name: "Create invite link" }).click();
  await page.getByText("Send this link to them.").waitFor();
  const link = (await page.locator("#invite-link").inputValue()) || "";
  const context = await browser.newContext();
  const caregiverPage = await context.newPage();
  await acceptInvite(caregiverPage, caregiver, link);
  await expect(caregiverPage.getByRole("heading", { name: "Ramesh Demo" })).toBeVisible();
  await expect(caregiverPage.getByText("Your role: Caregiver")).toBeVisible();
  await context.close();
});

test("FR-3.2 a different signed-in user cannot accept", async ({ page, browser }) => {
  const owner = await createTestUser("owner");
  const invited = await createTestUser("invited");
  const other = await createTestUser("other");
  const patientId = await createPatientAs(owner, "Ramesh Demo");
  await signInViaUi(page, owner);
  await page.getByRole("link", { name: "Ramesh Demo" }).click();
  await page.waitForURL((url) => url.pathname === `/patients/${patientId}`);
  await page.getByRole("heading", { name: "Ramesh Demo" }).waitFor();
  await page.getByRole("link", { name: "People", exact: true }).click();
  await page.getByLabel("Their email").fill(invited.email);
  await page.getByLabel("Role").selectOption("CAREGIVER");
  await page.getByRole("button", { name: "Create invite link" }).click();
  await page.getByText("Send this link to them.").waitFor();
  const link = await page.locator("#invite-link").inputValue();
  const context = await browser.newContext();
  const otherPage = await context.newPage();
  await acceptInvite(otherPage, other, link ?? "");
  await expect(
    otherPage.getByText("This invite is for a different email address. Sign out and sign in with the invited email."),
  ).toBeVisible({ timeout: 15000 });
  await context.close();
});

test("FR-2.2 viewer cannot edit", async ({ page, browser }) => {
  const owner = await createTestUser("owner");
  const viewer = await createTestUser("viewer");
  const patientId = await createPatientAs(owner, "Ramesh Demo");
  await signInViaUi(page, owner);
  await page.getByRole("link", { name: "Ramesh Demo" }).click();
  await page.waitForURL((url) => url.pathname === `/patients/${patientId}`);
  await page.getByRole("heading", { name: "Ramesh Demo" }).waitFor();
  await page.getByRole("link", { name: "People", exact: true }).click();
  await page.getByLabel("Their email").fill(viewer.email);
  await page.getByLabel("Role").selectOption("VIEWER");
  await page.getByRole("button", { name: "Create invite link" }).click();
  await page.getByText("Send this link to them.").waitFor();
  const link = await page.locator("#invite-link").inputValue();
  const context = await browser.newContext();
  const viewerPage = await context.newPage();
  await acceptInvite(viewerPage, viewer, link ?? "");
  await expect(viewerPage.getByRole("heading", { name: "Ramesh Demo" })).toBeVisible();
  await expect(viewerPage.getByRole("link", { name: "Edit" })).not.toBeVisible();
  const response = await viewerPage.request.patch(`/api/patients/${patientId}`, { data: { notes: "x" } });
  expect(response.status()).toBe(403);
  await context.close();
});

test("FR-3.3 revoked caregiver loses access", async ({ page, browser }) => {
  const owner = await createTestUser("owner");
  const caregiver = await createTestUser("caregiver");
  const patientId = await createPatientAs(owner, "Ramesh Demo");
  await signInViaUi(page, owner);
  await page.getByRole("link", { name: "Ramesh Demo" }).click();
  await page.waitForURL((url) => url.pathname === `/patients/${patientId}`);
  await page.getByRole("heading", { name: "Ramesh Demo" }).waitFor();
  await page.getByRole("link", { name: "People", exact: true }).click();
  await page.getByLabel("Their email").fill(caregiver.email);
  await page.getByLabel("Role").selectOption("CAREGIVER");
  await page.getByRole("button", { name: "Create invite link" }).click();
  await page.getByText("Send this link to them.").waitFor();
  const link = await page.locator("#invite-link").inputValue();
  const context = await browser.newContext();
  const caregiverPage = await context.newPage();
  await acceptInvite(caregiverPage, caregiver, link ?? "");
  await context.close();

  await page.goto("/patients");
  await page.getByRole("link", { name: "Ramesh Demo" }).click();
  await page.waitForURL((url) => url.pathname === `/patients/${patientId}`);
  await page.getByRole("heading", { name: "Ramesh Demo" }).waitFor();
  await page.getByRole("link", { name: "People", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove access" }).click();

  const revokeContext = await browser.newContext();
  const caregiverPage2 = await revokeContext.newPage();
  await signInViaUi(caregiverPage2, caregiver);
  await caregiverPage2.goto(`/patients/${patientId}`);
  await expect(caregiverPage2.getByRole("heading", { name: "Ramesh Demo" })).not.toBeVisible();
  await revokeContext.close();
});

test("FR-1.4 sign-out ends the session", async ({ page }) => {
  const user = await createTestUser("owner");
  await signInViaUi(page, user);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/patients");
  await expect(page).toHaveURL(/.*sign-in/);
});
