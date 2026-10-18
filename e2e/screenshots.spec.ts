import { expect, test, type Page } from "@playwright/test";
import { addObject, createInviteLink, createRoom, register } from "./helpers";

// Erzeugt die Screenshots für die README (docs/screenshots).
// Läuft nur mit `npm run screenshots` gegen eine leere Datenbank.
test.skip(!process.env.SCREENSHOTS, "nur mit SCREENSHOTS=1");
test.setTimeout(120_000);

const shot = (page: Page, name: string, fullPage = false) =>
  page.screenshot({
    path: `docs/screenshots/${name}.png`,
    animations: "disabled",
    fullPage,
  });

async function chooseAvatar(page: Page, choices: string[]) {
  await page.goto("/profil");
  for (const c of choices)
    await page.getByRole("button", { name: c, exact: true }).click();
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
}

test("README-Screenshots", async ({ browser }) => {
  const max = await (await browser.newContext()).newPage();

  await max.goto("/login");
  await expect(
    max.getByRole("heading", { name: "Willkommen zurück" }),
  ).toBeVisible();
  await shot(max, "01-login");

  await max.goto("/registrieren");
  await register(max, { name: "Max", username: "max" });
  await max.getByLabel("Name der WG").fill("WG Sonnenallee");
  await max.getByRole("radio", { name: "🌻" }).check({ force: true });
  await shot(max, "02-wg-erstellen");
  await max.getByLabel("Wie viele wohnen in der WG?").fill("3");
  await max.getByRole("button", { name: "WG erstellen" }).click();
  await expect(max.getByRole("heading", { name: "Wohnung" })).toBeVisible();

  await createRoom(max, { type: "Küche", name: "Küche" });
  await addObject(max, "dishwasher", "vor ein paar Tagen");
  await addObject(max, "stove", "vor ein paar Tagen");
  await addObject(max, "trash_rest", "heute");
  await addObject(max, "fridge", "heute");
  await createRoom(max, { type: "Bad", name: "Bad" });
  await addObject(max, "toilet", "vor ein paar Tagen");
  await addObject(max, "shower", "heute");
  await max.getByRole("combobox", { name: "Objekt" }).selectOption("washbasin");
  await max
    .getByRole("heading", { name: "Objekt hinzufügen" })
    .scrollIntoViewIfNeeded();
  await shot(max, "03-raum");

  await chooseAvatar(max, [
    "Hautton 2",
    "Locken",
    "Haarfarbe 2",
    "Oberteil 2",
    "Brille",
  ]);
  await shot(max, "08-profil");

  const link = await createInviteLink(max);
  await shot(max, "07-einladen");

  for (const [name, avatar] of [
    ["Anna", ["Hautton 1", "Lang", "Haarfarbe 5", "Oberteil 5", "Nichts"]],
    ["Ben", ["Hautton 4", "Kurz", "Haarfarbe 1", "Oberteil 3", "Kappe"]],
  ] as const) {
    const p = await (await browser.newContext()).newPage();
    await p.goto(link);
    await register(p, { name, username: name.toLowerCase() });
    await expect(p.getByRole("heading", { name: "Aufgaben" })).toBeVisible();
    await chooseAvatar(p, [...avatar]);
    if (name === "Anna") {
      await p.goto("/aufgaben");
      await p.getByRole("button", { name: "Klo putzen erledigt" }).click();
      await expect(p.getByRole("status")).toBeVisible();
    }
  }

  await max.goto("/aufgaben");
  await max.getByRole("button", { name: "Herd reinigen erledigt" }).click();
  await expect(max.getByRole("status")).toBeVisible();
  await max.waitForTimeout(2500);
  await shot(max, "04-aufgaben");

  await max.getByRole("link", { name: /Klo putzen/ }).click();
  await expect(max.getByRole("heading", { name: "Historie" })).toBeVisible();
  await shot(max, "05-aufgabe");

  await max.goto("/rangliste");
  await expect(max.getByRole("list", { name: "Podest" })).toBeVisible();
  await shot(max, "06-rangliste");
});
