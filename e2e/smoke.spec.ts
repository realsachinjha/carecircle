import { expect, test } from "@playwright/test";

test("landing page shows the title and the disclaimer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Family care coordination" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("not a medical device");
});

test("health endpoint answers ok", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});
