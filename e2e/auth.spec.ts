import { expect, test } from "@playwright/test";

test("Registrieren, abmelden und wieder anmelden über http", async ({
  page,
}) => {
  const username = `max${Date.now().toString(36)}`;

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("link", { name: "Registrieren" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Max");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill("geheim1234");
  await page.getByRole("button", { name: "Account anlegen" }).click();

  await expect(page.getByRole("heading", { name: "Hallo Max!" })).toBeVisible();

  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Benutzername oder E-Mail").fill(username);
  await page.getByLabel("Passwort").fill("falsch-falsch");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(
    page.getByText("Benutzername oder Passwort stimmt nicht."),
  ).toBeVisible();

  await page.getByLabel("Passwort").fill("geheim1234");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Hallo Max!" })).toBeVisible();

  // Session überlebt ein Neuladen (Cookie wurde über http akzeptiert).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hallo Max!" })).toBeVisible();
});
