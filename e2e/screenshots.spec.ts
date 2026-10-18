import { expect, test } from "@playwright/test";

// Erzeugt die Screenshots für die README (docs/screenshots).
// Läuft nur mit `npm run screenshots`, nicht in der normalen E2E-Suite.
test.skip(!process.env.SCREENSHOTS, "nur mit SCREENSHOTS=1");

const shot = (name: string) => ({
  path: `docs/screenshots/${name}.png`,
  animations: "disabled" as const,
});

test("README-Screenshots", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Willkommen zurück" }),
  ).toBeVisible();
  await page.screenshot(shot("01-login"));

  await page.goto("/registrieren");
  await page.getByLabel("Name", { exact: true }).fill("Max");
  await page.getByLabel("Benutzername").fill("max");
  await page.getByLabel("Passwort").fill("geheim1234");
  await page.screenshot(shot("02-registrieren"));

  await page.getByRole("button", { name: "Account anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Hallo Max!" })).toBeVisible();
  await page.screenshot(shot("03-start"));
});
