import { expect, test } from "@playwright/test";
import { login, register, uniq } from "./helpers";

test("Registrieren, abmelden und wieder anmelden über http", async ({
  page,
}) => {
  const username = uniq("max");

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("link", { name: "Registrieren" }).click();
  await register(page, { name: "Max", username });

  // Ohne WG geht es zum Einrichten.
  await expect(
    page.getByRole("heading", { name: "WG erstellen" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "WG erstellen" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, username, "falsch-falsch");
  await expect(
    page.getByText("Benutzername oder Passwort stimmt nicht."),
  ).toBeVisible();

  await login(page, username);
  await expect(
    page.getByRole("heading", { name: "WG erstellen" }),
  ).toBeVisible();
});
