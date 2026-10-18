import path from "node:path";
import Database from "better-sqlite3";
import { expect, test, type Page } from "@playwright/test";
import {
  addObject,
  clickPlan,
  createInviteLink,
  createRoom,
  dragRect,
  register,
} from "./helpers";

// Erzeugt die Screenshots für die README (docs/screenshots).
// Läuft nur mit `npm run screenshots` gegen eine leere Datenbank.
test.skip(!process.env.SCREENSHOTS, "nur mit SCREENSHOTS=1");
test.setTimeout(240_000);

const shot = (page: Page, name: string) =>
  page.screenshot({
    path: `docs/screenshots/${name}.png`,
    animations: "disabled",
  });

async function chooseAvatar(page: Page, choices: string[]) {
  await page.goto("/profil");
  for (const c of choices)
    await page.getByRole("button", { name: c, exact: true }).click();
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
}

/** Setzt den Bezugszeitpunkt einer Aufgabe so, dass sie bei `progress` steht. */
function backdate(taskName: string, progress: number) {
  const db = new Database(path.join(process.env.E2E_DATA_DIR!, "hrp.sqlite"));
  // Nur Aufgaben der Screenshot-WG (erstellt von „max“), falls parallel
  // andere Tests gleichnamige Aufgaben anlegen.
  const t = db
    .prepare(
      `select task.id, task.interval_days from task
       join household on household.id = task.household_id
       join user on user.id = household.created_by_user_id
       where task.name = ? and user.username = 'max'`,
    )
    .get(taskName) as { id: string; interval_days: number } | undefined;
  if (!t) throw new Error(`Aufgabe ${taskName} fehlt`);
  const baseline = Date.now() - progress * t.interval_days * 86_400_000;
  db.prepare("update task set baseline_at = ? where id = ?").run(
    baseline,
    t.id,
  );
  db.close();
}

async function selectRoom(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Raum wählen" })
    .getByRole("button", { name: new RegExp(name) })
    .click();
}

async function placeAt(page: Page, objectName: RegExp, x: number, y: number) {
  await page
    .getByRole("region", { name: "Möbel im Raum" })
    .getByRole("button", { name: objectName })
    .click();
  await clickPlan(page, x + 0.5, y + 0.5);
  await expect(page.getByText("Speichern …")).toHaveCount(0);
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
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
  await max
    .locator("label", { has: max.getByRole("radio", { name: "🌻" }) })
    .click();
  await shot(max, "02-wg-erstellen");
  await max.getByLabel("Wie viele wohnen in der WG?").fill("3");
  await max.getByRole("button", { name: "WG erstellen" }).click();
  await expect(max.getByRole("heading", { name: "Wohnung" })).toBeVisible();
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
  const others: Record<string, Page> = {};
  for (const [name, avatar] of [
    ["Anna", ["Hautton 1", "Lang", "Haarfarbe 5", "Oberteil 5", "Nichts"]],
    ["Ben", ["Hautton 4", "Kurz", "Haarfarbe 1", "Oberteil 3", "Kappe"]],
  ] as const) {
    const p = await (await browser.newContext()).newPage();
    await p.goto(link);
    await register(p, { name, username: name.toLowerCase() });
    await expect(p.getByRole("heading", { name: "Aufgaben" })).toBeVisible();
    await chooseAvatar(p, [...avatar]);
    others[name] = p;
  }

  // Räume, Objekte, Aufgaben
  await createRoom(max, { type: "Küche", name: "Küche" });
  for (const [obj, last] of [
    ["fridge", "heute"],
    ["stove", "vor ein paar Tagen"],
    ["sink", "vor ein paar Tagen"],
    ["trash_rest", "vor ein paar Tagen"],
    ["trash_bio", "heute"],
    ["dining_table", "heute"],
  ] as const)
    await addObject(max, obj, last);
  await createRoom(max, { type: "Bad", name: "Bad" });
  await addObject(max, "toilet", "vor ein paar Tagen");
  await addObject(max, "shower", "heute");
  await max.getByRole("combobox", { name: "Objekt" }).selectOption("washbasin");
  await max
    .getByRole("heading", { name: "Objekt hinzufügen" })
    .evaluate((el) => {
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90);
    });
  await shot(max, "03-raum");
  await addObject(max, "washbasin", "vor ein paar Tagen");
  await createRoom(max, { type: "Flur", name: "Flur" });
  await addObject(max, "shoe_rack", "heute");
  await createRoom(max, { type: "Wohnzimmer", name: "Wohnzimmer" });
  await addObject(max, "sofa", "heute");
  await addObject(max, "plant", "vor ein paar Tagen");
  await createRoom(max, {
    type: "Zimmer",
    name: "Annas Zimmer",
    owner: "Anna",
  });

  // Grundriss zeichnen
  await max.goto("/plan/bearbeiten");
  const layout: [string, [number, number], [number, number]][] = [
    ["Küche", [4, 4], [9, 8]],
    ["Bad", [10, 4], [13, 8]],
    ["Flur", [4, 9], [13, 10]],
    ["Wohnzimmer", [4, 11], [9, 15]],
    ["Annas Zimmer", [10, 11], [13, 15]],
  ];
  for (const [name, a, b] of layout) {
    await selectRoom(max, name);
    await dragRect(max, a, b);
    await expect(max.getByText("Speichern …")).toHaveCount(0);
  }
  // Türen zum Flur
  await max.getByRole("tab", { name: "Türen" }).click();
  for (const [name, x, y] of [
    ["Küche", 6.5, 8.95],
    ["Bad", 11.5, 8.95],
    ["Wohnzimmer", 6.5, 11.05],
    ["Annas Zimmer", 11.5, 11.05],
  ] as const) {
    await selectRoom(max, name);
    if (name !== "Annas Zimmer")
      await max.getByRole("tab", { name: "Türen" }).click();
    await clickPlan(max, x, y);
    await expect(max.getByText("Speichern …")).toHaveCount(0);
  }

  // Möbel
  await selectRoom(max, "Küche");
  await max.getByRole("tab", { name: "Möbel" }).click();
  await placeAt(max, /Kühlschrank/, 4, 4);
  await placeAt(max, /Herd/, 6, 4);
  await placeAt(max, /Spüle/, 8, 4);
  await placeAt(max, /Restmüll/, 9, 7);
  await placeAt(max, /Biomüll/, 8, 7);
  await placeAt(max, /Esstisch/, 5, 7);
  for (const n of ["Kühlschrank", "Herd", "Spüle"])
    await max
      .getByRole("checkbox", { name: `${n} für Gruppe auswählen` })
      .check();
  await max.getByRole("button", { name: "Gruppieren" }).click();
  await expect(max.getByText(/Einbauküche \(3 Teile\)/)).toBeVisible();

  await selectRoom(max, "Bad");
  await max.getByRole("tab", { name: "Möbel" }).click();
  await placeAt(max, /Toilette/, 10, 4);
  await placeAt(max, /Dusche/, 12, 4);
  await placeAt(max, /Waschbecken/, 12, 8);

  await selectRoom(max, "Flur");
  await max.getByRole("tab", { name: "Möbel" }).click();
  await placeAt(max, /Schuhregal/, 4, 9);

  await selectRoom(max, "Wohnzimmer");
  await max.getByRole("tab", { name: "Möbel" }).click();
  await placeAt(max, /Sofa/, 4, 14);
  await placeAt(max, /Pflanze/, 9, 11);
  await max
    .getByRole("region", { name: "Möbel im Raum" })
    .getByRole("button", { name: /Sofa/ })
    .click();
  await max.getByTestId("plan-editor").scrollIntoViewIfNeeded();
  await shot(max, "09-editor");

  // Ein paar Aufgaben „älter“ machen, damit der Plan Farbe bekommt
  backdate("Klo putzen", 1.25);
  backdate("Restmüll rausbringen", 1.7);
  backdate("Herd reinigen", 0.85);
  backdate("Gießen", 0.6);

  await others.Anna.goto("/aufgaben");
  await others.Anna.getByRole("button", {
    name: "Spüle reinigen erledigt",
  }).click();
  await expect(others.Anna.getByRole("status")).toBeVisible();
  await others.Ben.goto("/aufgaben");
  await others.Ben.getByRole("button", {
    name: "Waschbecken + Spiegel erledigt",
  }).click();
  await expect(others.Ben.getByRole("status")).toBeVisible();

  await max.goto("/wohnung");
  const iso = max.getByTestId("iso");
  await expect(iso).toHaveAttribute("data-ready", "true");
  await expect(iso).toHaveAttribute("data-avatars", "3");
  await max.getByRole("button", { name: "Als Nächstes" }).click();
  await max.waitForTimeout(2500); // Avatare laufen los
  await shot(max, "00-wohnung");

  // Barrierefreie Objektliste (für Screenreader, im Bild unsichtbar)
  await max
    .getByRole("button", { name: "Toilette öffnen" })
    .dispatchEvent("click");
  await expect(
    max.getByRole("region", { name: /Aufgaben: Toilette/ }),
  ).toBeVisible();
  await shot(max, "10-objekt");

  // Erledigen: eigener Avatar läuft hin, putzt, es glitzert
  const sheet = max.getByRole("region", { name: /Aufgaben: Toilette/ });
  await sheet.getByRole("button", { name: "Klo putzen erledigt" }).click();
  await expect(iso).toHaveAttribute("data-last-celebration", /.+/, {
    timeout: 20_000,
  });
  await max.waitForTimeout(150);
  await shot(max, "12-geputzt");
  await max.getByRole("button", { name: "Schließen" }).click();

  await max.getByRole("button", { name: "2D", exact: true }).click();
  await expect(max.getByTestId("plan")).toBeVisible();
  await shot(max, "11-plan-2d");
  await max.getByRole("button", { name: "3D", exact: true }).click();

  await max.goto("/aufgaben");
  await shot(max, "04-aufgaben");

  await max.getByRole("link", { name: /Klo putzen/ }).click();
  await expect(max.getByRole("heading", { name: "Historie" })).toBeVisible();
  await shot(max, "05-aufgabe");

  await max.goto("/rangliste");
  await expect(max.getByRole("list", { name: "Podest" })).toBeVisible();
  await shot(max, "06-rangliste");
});
