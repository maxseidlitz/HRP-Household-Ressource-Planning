import { expect, test } from "@playwright/test";
import {
  addObject,
  createHousehold,
  createInviteLink,
  createRoom,
  login,
  register,
  uniq,
} from "./helpers";

test("WG anlegen, Aufgabe erledigen, einladen, Rangliste, privates Zimmer, Passwort-Reset", async ({
  browser,
}) => {
  const max = await browser.newContext();
  const page = await max.newPage();
  const maxUser = uniq("max");
  const annaUser = uniq("anna");

  // --- Max erstellt die WG ---
  await page.goto("/registrieren");
  await register(page, { name: "Max", username: maxUser });
  await createHousehold(page, "WG Sonnenallee", 2);

  // --- Bad mit Toilette und Vorschlag „Klo putzen“ ---
  await createRoom(page, { type: "Bad", name: "Bad" });
  await addObject(page, "shower", "heute");
  // Die Auswahl bleibt stehen und passt zum Button; die Aufgabenvorschläge
  // sind wieder frisch.
  await expect(page.getByRole("combobox", { name: "Objekt" })).toHaveValue(
    "shower",
  );
  await expect(
    page.getByRole("button", { name: /Dusche hinzufügen/ }),
  ).toBeVisible();
  await addObject(page, "toilet");
  await expect(page.getByRole("link", { name: /Klo putzen/ })).toBeVisible();
  // Boden im Bad hat den Vorschlag „Bad wischen“
  await expect(page.getByRole("heading", { name: "Boden" })).toBeVisible();

  // --- Aufgabenliste: bei 50 % Sweet Spot → 3 × 1,5 = 4,5 Punkte ---
  await page.getByRole("link", { name: "Aufgaben" }).click();
  await expect(page.getByRole("heading", { name: "Aufgaben" })).toBeVisible();
  await expect(page.getByText("+4,5")).toBeVisible();
  await page.getByRole("button", { name: "Klo putzen erledigt" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "+4,5" }),
  ).toBeVisible();
  await expect(page.getByTestId("my-points")).toContainText("4,5");

  // Gleich nochmal: unter 15 % → keine Punkte
  await page.getByRole("button", { name: "Klo putzen erledigt" }).click();
  await expect(page.getByText("Wurde gerade erst erledigt")).toBeVisible();
  await expect(page.getByTestId("my-points")).toContainText("4,5");

  // Historie
  await page.getByRole("link", { name: /Klo putzen/ }).click();
  await expect(page.getByRole("heading", { name: "Historie" })).toBeVisible();
  await expect(page.locator("li", { hasText: "Max" })).toHaveCount(2);

  // --- Anna einladen ---
  const link = await createInviteLink(page);
  const anna = await browser.newContext();
  const annaPage = await anna.newPage();
  await annaPage.goto(link);
  await expect(
    annaPage.getByRole("heading", { name: "WG Sonnenallee" }),
  ).toBeVisible();
  await register(annaPage, { name: "Anna", username: annaUser });
  await expect(
    annaPage.getByText("Willkommen in WG Sonnenallee!"),
  ).toBeVisible();
  await expect(
    annaPage.getByRole("link", { name: /Klo putzen/ }),
  ).toBeVisible();

  // Rangliste: Max vorne
  await annaPage.getByRole("link", { name: "Rangliste" }).click();
  const places = annaPage
    .getByRole("list", { name: "Alle Plätze" })
    .getByRole("listitem");
  await expect(places.first()).toContainText("Max");
  await expect(places.first()).toContainText("4,5");
  await expect(places.nth(1)).toContainText("Anna");

  // --- Privates Zimmer für Anna ---
  await createRoom(page, {
    type: "Zimmer",
    name: "Annas Zimmer",
    owner: "Anna",
  });
  await expect(page.getByText(/private Zimmer von Anna/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Objekt hinzufügen" }),
  ).toHaveCount(0);

  await annaPage.getByRole("link", { name: "Profil" }).click();
  await annaPage.getByRole("link", { name: "Annas Zimmer einrichten" }).click();
  await addObject(annaPage, "plant");
  await annaPage.goto("/aufgaben");
  await expect(annaPage.getByRole("link", { name: /Gießen/ })).toBeVisible();

  await page.goto("/aufgaben");
  await expect(page.getByRole("link", { name: /Klo putzen/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Gießen/ })).toHaveCount(0);

  // --- Passwort-Reset für Anna ---
  await page.goto("/verwaltung/mitglieder");
  const annaCard = page
    .getByRole("listitem")
    .filter({ hasText: `@${annaUser}` });
  await annaCard.getByRole("button", { name: "Passwort-Reset-Link" }).click();
  const resetField = annaCard.getByRole("textbox");
  await expect(resetField).toHaveValue(/\/reset\//);
  const resetLink = await resetField.inputValue();

  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();
  await freshPage.goto(resetLink);
  await freshPage.getByLabel("Neues Passwort").fill("neuesPasswort1");
  await freshPage.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(freshPage.getByText("Passwort geändert")).toBeVisible();
  await login(freshPage, annaUser, "neuesPasswort1");
  // Startseite ist der Wohnungsplan
  await expect(
    freshPage.getByRole("heading", { name: "Wohnung" }),
  ).toBeVisible();

  // Alte Sitzung von Anna ist abgemeldet
  await annaPage.goto("/aufgaben");
  await expect(annaPage).toHaveURL(/\/login/);
});

test("Mitglieder sehen keinen Admin-Bereich", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/registrieren");
  await register(page, { name: "Admin", username: uniq("adm") });
  await createHousehold(page, "WG Test", 2);
  const link = await createInviteLink(page);

  const member = await (await browser.newContext()).newPage();
  await member.goto(link);
  await register(member, { name: "Mitglied", username: uniq("mit") });
  await expect(member.getByRole("heading", { name: "Aufgaben" })).toBeVisible();
  await expect(member.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await member.goto("/verwaltung/wohnung");
  await expect(member).toHaveURL(/\/aufgaben$/);
});
