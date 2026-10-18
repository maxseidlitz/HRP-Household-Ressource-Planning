import { expect, test } from "@playwright/test";
import {
  addObject,
  clickPlan,
  createHousehold,
  createInviteLink,
  createRoom,
  dragRect,
  register,
  uniq,
} from "./helpers";

test("Grundriss zeichnen, Tür setzen, Möbel platzieren, Plan mit Statusfarben", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/registrieren");
  await register(page, { name: "Max", username: uniq("max") });
  await createHousehold(page, "WG Plan", 2);

  await createRoom(page, { type: "Küche", name: "Küche" });
  await addObject(page, "fridge", "vor ein paar Tagen");
  await addObject(page, "stove", "heute");
  await createRoom(page, { type: "Bad", name: "Bad" });

  // Startseite ohne Grundriss
  await page.goto("/wohnung");
  await expect(page.getByText("Noch kein Grundriss gezeichnet.")).toBeVisible();
  await page.getByRole("link", { name: "Grundriss zeichnen →" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan bearbeiten" }),
  ).toBeVisible();

  // Küche als L-Form aus zwei Rechtecken
  await page.getByRole("button", { name: /Küche · leer/ }).click();
  await dragRect(page, [5, 5], [8, 7]);
  await expect(page.getByRole("button", { name: /Küche · leer/ })).toHaveCount(
    0,
  );
  await dragRect(page, [5, 8], [6, 9]);
  await expect(page.getByText("Speichern …")).toHaveCount(0);

  // Bad darf die Küche nicht überlappen
  await page.getByRole("button", { name: /Bad · leer/ }).click();
  await dragRect(page, [8, 7], [10, 9]);
  await expect(page.locator("p[role=alert]")).toContainText("überschneidet");
  await dragRect(page, [9, 5], [11, 7]);
  await expect(page.getByRole("button", { name: /Bad · leer/ })).toHaveCount(0);

  // Tür auf der Nordwand der Küche
  await page.getByRole("button", { name: /Küche/ }).first().click();
  await page.getByRole("tab", { name: "Türen" }).click();
  await clickPlan(page, 6.5, 5.05);
  await expect(page.locator("p[role=alert]")).toHaveCount(0);

  // Kühlschrank platzieren und drehen
  await page.getByRole("tab", { name: "Möbel" }).click();
  await page.getByRole("button", { name: /Kühlschrank/ }).click();
  await clickPlan(page, 5.5, 5.5);
  await expect(
    page.locator('[data-testid="plan-editor"] [data-object]').first(),
  ).toBeVisible();
  // Herd ragt aus dem Raum → Fehler
  await page.getByRole("button", { name: /Herd/ }).click();
  await clickPlan(page, 8.5, 5.5);
  await expect(page.locator("p[role=alert]")).toContainText("ganz im Raum");
  await clickPlan(page, 7.5, 5.5);
  await expect(page.locator("p[role=alert]")).toHaveCount(0);

  // Einbauküche gruppieren
  await page
    .getByRole("checkbox", { name: "Kühlschrank für Gruppe auswählen" })
    .check();
  await page
    .getByRole("checkbox", { name: "Herd für Gruppe auswählen" })
    .check();
  await page.getByRole("button", { name: "Gruppieren" }).click();
  await expect(page.getByText(/Einbauküche \(2 Teile\)/)).toBeVisible();

  // Wohnung: Plan mit antippbaren Objekten
  await page.goto("/wohnung");
  const plan = page.getByTestId("plan");
  await expect(plan).toBeVisible();
  await expect(plan.locator("[data-room]")).toHaveCount(2);
  await expect(plan.locator("[data-door]")).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Als Nächstes" }),
  ).toBeVisible();
  await plan.getByRole("button", { name: "Kühlschrank" }).click();
  const sheet = page.getByRole("region", { name: /Aufgaben: Kühlschrank/ });
  await expect(sheet.getByText("Kühlschrank auswischen")).toBeVisible();
  await sheet
    .getByRole("button", { name: "Kühlschrank auswischen erledigt" })
    .click();
  await expect(page.getByTestId("my-points")).toContainText("6");
});

test("Fremde private Zimmer erscheinen nur als Umriss", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await admin.goto("/registrieren");
  await register(admin, { name: "Max", username: uniq("max") });
  await createHousehold(admin, "WG Privat", 2);
  const link = await createInviteLink(admin);

  const anna = await (await browser.newContext()).newPage();
  await anna.goto(link);
  await register(anna, { name: "Anna", username: uniq("anna") });
  await expect(anna.getByRole("heading", { name: "Aufgaben" })).toBeVisible();

  await createRoom(admin, {
    type: "Zimmer",
    name: "Annas Zimmer",
    owner: "Anna",
  });
  await admin.goto("/plan/bearbeiten");
  await dragRect(admin, [5, 5], [8, 8]);
  await expect(admin.getByRole("tab", { name: "Möbel" })).toBeDisabled();

  // Anna richtet ein und erweitert ihr Zimmer
  await anna.goto("/profil");
  await anna.getByRole("link", { name: "Annas Zimmer einrichten" }).click();
  await addObject(anna, "plant");
  await anna.getByRole("link", { name: /Im Plan bearbeiten/ }).click();
  await dragRect(anna, [9, 5], [10, 6]);
  await expect(anna.locator("p[role=alert]")).toHaveCount(0);
  await anna.getByRole("tab", { name: "Möbel" }).click();
  await anna.getByRole("button", { name: /Pflanze/ }).click();
  await clickPlan(anna, 5.5, 5.5);
  await anna.goto("/wohnung");
  await expect(
    anna.getByTestId("plan").getByRole("button", { name: "Pflanze" }),
  ).toBeVisible();

  // Max sieht nur den Umriss mit Schloss
  await admin.goto("/wohnung");
  const plan = admin.getByTestId("plan");
  await expect(plan.getByText("🔒 Anna")).toBeVisible();
  await expect(plan.locator("[data-object]")).toHaveCount(0);
});
