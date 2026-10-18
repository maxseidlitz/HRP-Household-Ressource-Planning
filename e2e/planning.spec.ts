import { expect, test } from "@playwright/test";
import {
  addObject,
  createHousehold,
  createInviteLink,
  createRoom,
  register,
  uniq,
} from "./helpers";

test("Einplanen mit .ics, Mitteilungen und Urlaubspaket", async ({
  browser,
}) => {
  const max = await browser.newContext();
  const page = await max.newPage();
  await page.goto("/registrieren");
  await register(page, { name: "Max", username: uniq("max") });
  await createHousehold(page, "WG Planung", 2);
  await createRoom(page, { type: "Küche", name: "Küche" });
  await addObject(page, "trash_rest");

  // --- Einplanen: Schnellwahl „Morgen 18 Uhr“ ---
  await page
    .getByRole("link", { name: /Restmüll/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Einplanen" })).toBeVisible();
  await page.getByRole("button", { name: "Morgen 18 Uhr" }).click();
  await page.getByRole("button", { name: "⏰ Ich mach das" }).click();
  await expect(page.getByTestId("commitment")).toContainText(
    "Du hast das eingeplant",
  );
  await expect(page.getByTestId("commitment")).toContainText("18:00");

  // .ics mit Erinnerung 2 h vorher
  const ics = page.getByRole("link", { name: "📅 In den Kalender" });
  const res = await page.request.get((await ics.getAttribute("href"))!);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const body = await res.text();
  expect(body).toContain("BEGIN:VEVENT");
  expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z/);
  expect(body).toContain("TRIGGER:-PT120M");

  // Wecker-Icon in der Aufgabenliste
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  await expect(page.getByTestId("commitment-badge").first()).toContainText(
    "Max",
  );

  // Absagen
  await page
    .getByRole("link", { name: /Restmüll/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Absagen" }).click();
  await expect(page.getByTestId("commitment")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "⏰ Ich mach das" }),
  ).toBeVisible();

  // --- Mitteilung: Anna tritt bei → Glocke zeigt 1 ---
  const link = await createInviteLink(page);
  const anna = await browser.newContext();
  const annaPage = await anna.newPage();
  await annaPage.goto(link);
  await register(annaPage, { name: "Anna", username: uniq("anna") });
  await expect(annaPage.getByText("Willkommen in WG Planung!")).toBeVisible();

  await page.goto("/aufgaben");
  await expect(page.getByTestId("bell-badge")).toHaveText("1");
  await page.getByTestId("bell").click();
  await expect(page.getByTestId("notifications")).toContainText(
    "Anna ist der WG beigetreten.",
  );
  await expect(page.getByTestId("bell-badge")).toHaveCount(0);

  // --- Urlaub ab morgen: Paket abhaken ---
  await page.goto("/urlaub");
  const day = (offset: number) => {
    const d = new Date(Date.now() + offset * 86_400_000);
    return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  };
  await page.getByLabel("Von").fill(day(2));
  await page.getByLabel("Bis (einschließlich)").fill(day(5));
  await page.getByRole("button", { name: "🧳 Urlaub eintragen" }).click();
  await expect(page.getByTestId("absence")).toContainText("Geplanter Urlaub");
  await page
    .getByRole("button", {
      name: "Eigene Sachen im Kühlschrank prüfen abhaken",
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Eigene Sachen im Kühlschrank prüfen: erledigt",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("my-points")).toContainText("1");

  // Banner auf der Aufgabenseite, bis alles abgehakt ist
  await page.goto("/aufgaben");
  await expect(page.getByTestId("vacation-banner")).toBeVisible();
  await page.getByTestId("vacation-banner").click();
  await page
    .getByRole("button", { name: "Saugen und Müll rausbringen abhaken" })
    .click();
  await expect(page.getByTestId("my-points")).toContainText("5");
  await page.goto("/aufgaben");
  await expect(page.getByTestId("vacation-banner")).toHaveCount(0);
  // Restmüll ist über das Paket wieder grün
  await expect(page.getByText("Alles im grünen Bereich")).toBeVisible();

  await anna.close();
  await max.close();
});
