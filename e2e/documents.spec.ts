import { expect, test } from "@playwright/test";
import { createPatientAs, createTestUser, signInViaUi, userClient } from "./helpers/users";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test("FR-4.2 upload is not offered before consent", async ({ page }) => {
  const owner = await createTestUser("owner");
  const patientId = await createPatientAs(owner, "Ramesh Demo");
  await signInViaUi(page, owner);
  await page.getByRole("link", { name: "Ramesh Demo" }).click();
  await page.waitForURL((url) => url.pathname === `/patients/${patientId}`);
  await page.getByRole("heading", { name: "Ramesh Demo" }).waitFor();
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page.getByText("Consent is needed before adding documents.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add a document", exact: true })).not.toBeVisible();
});

test("FR-4.2 FR-4.1 FR-5.1 owner consents, uploads, and reads with AI", async ({ page }) => {
  const owner = await createTestUser("owner");
  const patientId = await createPatientAs(owner, "Ramesh Demo");
  await signInViaUi(page, owner);
  await page.getByRole("link", { name: "Ramesh Demo" }).click();
  await page.waitForURL((url) => url.pathname === `/patients/${patientId}`);
  await page.getByRole("heading", { name: "Ramesh Demo" }).waitFor();
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "I agree" }).click();
  await page.getByText("Consent given on").waitFor();
  await page.getByRole("link", { name: "Add a document", exact: true }).click();
  await page.getByLabel("Photo or PDF of the document").waitFor();
  await page.setInputFiles("#file", {
    name: "prescription.png",
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
  await page.getByRole("button", { name: "Upload" }).click({ force: true });
  await page.waitForURL((url) => url.pathname.startsWith(`/patients/${patientId}/documents/`));
  await page.getByText("Not read yet").waitFor();
  await page.getByRole("button", { name: "Read with AI" }).click();
  await page.getByText("Ready to check").waitFor();
  await expect(page.getByText("Demo mode: this answer is recorded, not read from your file.")).toBeVisible();
  await expect(page.locator("text=Metformin").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/Some rows were hard to read/)).toBeVisible();
});

test("FR-4.1 a renamed text file is refused", async ({ page }) => {
  const owner = await createTestUser("owner");
  const patientId = await createPatientAs(owner, "Ramesh Demo");
  await signInViaUi(page, owner);
  await page.getByRole("link", { name: "Ramesh Demo" }).click();
  await page.waitForURL((url) => url.pathname === `/patients/${patientId}`);
  await page.getByRole("heading", { name: "Ramesh Demo" }).waitFor();
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "I agree" }).click();
  await page.getByText("Consent given on").waitFor();
  await page.getByRole("link", { name: "Add a document", exact: true }).click();
  await page.setInputFiles("#file", {
    name: "x.png",
    mimeType: "image/png",
    buffer: Buffer.from("hello"),
  });
  await page.getByRole("button", { name: "Upload" }).click({ force: true });
  await expect(page.getByText("Only JPEG, PNG, and PDF files can be added.")).toBeVisible();
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page.getByText("No documents yet.")).toBeVisible();
});

test("FR-4.1 an oversize file is refused", async ({ page }) => {
  const owner = await createTestUser("owner");
  const patientId = await createPatientAs(owner, "Ramesh Demo");
  await signInViaUi(page, owner);
  await page.getByRole("link", { name: "Ramesh Demo" }).click();
  await page.waitForURL((url) => url.pathname === `/patients/${patientId}`);
  await page.getByRole("heading", { name: "Ramesh Demo" }).waitFor();
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "I agree" }).click();
  await page.getByText("Consent given on").waitFor();
  await page.getByRole("link", { name: "Add a document", exact: true }).click();
  const oversizeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
  oversizeBuffer[0] = 0x89;
  oversizeBuffer[1] = 0x50;
  oversizeBuffer[2] = 0x4e;
  oversizeBuffer[3] = 0x47;
  await page.setInputFiles("#file", {
    name: "big.png",
    mimeType: "image/png",
    buffer: oversizeBuffer,
  });
  await page.getByRole("button", { name: "Upload" }).click({ force: true });
  await expect(page.getByText("The file is larger than 10 MB.")).toBeVisible();
});

test("FR-4.3 owner can view uploaded document", async ({ page }) => {
  const owner = await createTestUser("owner");
  const patientId = await createPatientAs(owner, "Ramesh Demo");
  await signInViaUi(page, owner);
  await page.getByRole("link", { name: "Ramesh Demo" }).click();
  await page.waitForURL((url) => url.pathname === `/patients/${patientId}`);
  await page.getByRole("heading", { name: "Ramesh Demo" }).waitFor();
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "I agree" }).click();
  await page.getByText("Consent given on").waitFor();
  await page.getByRole("link", { name: "Add a document", exact: true }).click();
  await page.getByLabel("Photo or PDF of the document").waitFor();
  await page.setInputFiles("#file", {
    name: "prescription.png",
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
  await page.getByRole("button", { name: "Upload" }).click({ force: true });
  await page.waitForURL((url) => url.pathname.startsWith(`/patients/${patientId}/documents/`));
  await page.getByText("Not read yet").waitFor();
  await page.getByRole("heading", { level: 1, name: "Ramesh Demo" }).waitFor();
});

test("FR-4.6 owner edits the document details", async ({ page }) => {
  const owner = await createTestUser("owner");
  const patientId = await createPatientAs(owner, "Ramesh Demo");
  await signInViaUi(page, owner);
  await page.getByRole("link", { name: "Ramesh Demo" }).click();
  await page.waitForURL((url) => url.pathname === `/patients/${patientId}`);
  await page.getByRole("heading", { name: "Ramesh Demo" }).waitFor();
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "I agree" }).click();
  await page.getByText("Consent given on").waitFor();
  await page.getByRole("link", { name: "Add a document", exact: true }).click();
  await page.getByLabel("Photo or PDF of the document").waitFor();
  await page.setInputFiles("#file", {
    name: "prescription.png",
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
  await page.getByRole("button", { name: "Upload" }).click({ force: true });
  await page.waitForURL((url) => url.pathname.startsWith(`/patients/${patientId}/documents/`));
  await page.getByText("Not read yet").waitFor();
  await page.getByLabel("Doctor's name").fill("Dr. New Name");
  await page.getByRole("button", { name: "Save details" }).click();
  await page.getByText("Saved.").waitFor();
  await expect(page.getByLabel("Doctor's name")).toHaveValue("Dr. New Name");
});

test("FR-4.5 owner can withdraw consent", async ({ page }) => {
  const owner = await createTestUser("owner");
  const patientId = await createPatientAs(owner, "Ramesh Demo");
  await signInViaUi(page, owner);
  await page.getByRole("link", { name: "Ramesh Demo" }).click();
  await page.waitForURL((url) => url.pathname === `/patients/${patientId}`);
  await page.getByRole("heading", { name: "Ramesh Demo" }).waitFor();
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "I agree" }).click();
  await page.getByText("Consent given on").waitFor();

  // Withdraw consent via API
  const ownerClient = await userClient(owner);
  await ownerClient.rpc("withdraw_consent", { p_patient: patientId });

  // Verify consent is withdrawn - no active consent
  const { data: consent } = await ownerClient
    .from("consents")
    .select("id")
    .eq("patient_id", patientId)
    .is("withdrawn_at", null)
    .maybeSingle();
  expect(consent).toBeNull();

  // Navigate to Documents page - should show consent needed
  await page.goto(`/patients/${patientId}/documents`);
  await expect(page.getByText("Consent is needed before adding documents.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add a document", exact: true })).not.toBeVisible();
});
