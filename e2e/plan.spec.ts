import { expect, test, type Page } from "@playwright/test";
import {
  addObject,
  clickPlan,
  createHousehold,
  createInviteLink,
  createRoom,
  dragRect,
  planPoint,
  register,
  uniq,
  waitSaved,
} from "./helpers";

const objects = (page: Page) =>
  page.locator('[data-testid="plan-editor"] [data-object]');
const doors = (page: Page) =>
  page.locator('[data-testid="plan-editor"] [data-door]');
const toast = (page: Page) => page.getByTestId("build-toast");

test("Baumodus: Räume aufziehen, Türen, Möbel ziehen, rückgängig, Plan", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/registrieren");
  await register(page, { name: "Max", username: uniq("max") });
  await createHousehold(page, "WG Plan", 2);

  // Küche aufziehen (8 × 6 Kästchen = 4 × 3 m)
  await page.getByTestId("room-card-kitchen").click();
  await dragRect(page, [3, 3], [10, 8]);
  await expect(page.getByTestId("room-sheet")).toContainText("12 m²");
  await waitSaved(page);

  // Bad darf die Küche nicht überlappen …
  await page.getByTestId("room-card-bath").click();
  await dragRect(page, [9, 3], [12, 6]);
  await expect(toast(page)).toContainText("Überschneidet sich");
  await expect(page.locator("[data-room]")).toHaveCount(1);
  // … daneben passt es, die Tür setzt sich selbst
  await dragRect(page, [11, 3], [14, 8]);
  await expect(page.locator("[data-room]")).toHaveCount(2);
  await expect(doors(page)).toHaveCount(2); // auf beiden Seiten der Wand
  await waitSaved(page);

  // Zweite Tür per Antippen der Wand, und wieder weg
  await clickPlan(page, 11.05, 3.5);
  await expect(toast(page)).toContainText("Tür gesetzt");
  await expect(doors(page)).toHaveCount(4);
  await clickPlan(page, 11.05, 3.5);
  await expect(toast(page)).toContainText("Tür entfernt");
  await expect(doors(page)).toHaveCount(2);

  // Küche auswählen, Küchenzeile antippen: drei einzelne Teile
  await clickPlan(page, 6.5, 6.5);
  await page.getByRole("tab", { name: "Möbel" }).click();
  await page.getByTestId("card-kitchenette").click();
  await expect(toast(page)).toContainText("Küchenzeile in Küche");
  await expect(objects(page)).toHaveCount(3);
  await expect(page.getByTestId("object-sheet")).toContainText("Küchenzeile");

  // Pflanze aus der Leiste ins Bad ziehen
  await page.getByRole("button", { name: "Alle", exact: true }).click();
  const card = page.getByTestId("card-plant");
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  const target = await planPoint(page, 13.5, 7.5, false);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 4 });
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await expect(toast(page)).toContainText("Pflanze in Bad");
  await expect(objects(page)).toHaveCount(4);

  // Rückgängig und wiederholen
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(objects(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Wiederholen" }).click();
  await expect(objects(page)).toHaveCount(4);

  // Kühlschrank und Herd mit „Zuletzt gemacht“
  await clickPlan(page, 6.5, 7.5);
  await addObject(page, "fridge", "vor ein paar Tagen");
  await waitSaved(page);

  // Bad am Griff verbreitern: 4 × 6 → 6 × 6 Kästchen
  await clickPlan(page, 12.5, 5.5);
  const handle = page.getByTestId("handle-e");
  const hb = (await handle.boundingBox())!;
  const to = await planPoint(page, 17, 5.5, false);
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("room-sheet")).toContainText("9 m²");
  await waitSaved(page);

  // Alles bleibt nach dem Neuladen erhalten
  await page.reload();
  await expect(page.locator("[data-room]")).toHaveCount(2);
  await expect(objects(page)).toHaveCount(5);

  // Wohnung: 3D-Diorama mit Objekten und eigenem Avatar
  await page.goto("/wohnung");
  const iso = page.getByTestId("iso");
  await expect(iso).toHaveAttribute("data-ready", "true");
  await expect(iso).toHaveAttribute("data-objects", "5");
  await expect(iso).toHaveAttribute("data-avatars", "1");

  // Objekt über die barrierefreie Liste öffnen und erledigen: Der Avatar
  // läuft hin, putzt, danach glitzert es.
  await page
    .getByRole("button", { name: "Kühlschrank öffnen" })
    .dispatchEvent("click");
  const sheet = page.getByRole("region", { name: /Aufgaben: Kühlschrank/ });
  await sheet
    .getByRole("button", { name: "Kühlschrank auswischen erledigt" })
    .click();
  await expect(iso).toHaveAttribute("data-last-celebration", /.+/, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("my-points")).toContainText("6");

  // 2D-Ansicht
  await page.getByRole("button", { name: "2D", exact: true }).click();
  const plan = page.getByTestId("plan");
  await expect(plan.locator("[data-room]")).toHaveCount(2);
  await plan.getByRole("button", { name: "Herd" }).click();
  await expect(
    page.getByRole("region", { name: /Aufgaben: Herd/ }),
  ).toBeVisible();
});

test("Private Zimmer: Besitzerin richtet ein, Admin sieht nur den Umriss", async ({
  browser,
}) => {
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
  await createRoom(admin, { type: "Flur", name: "Flur" });

  // Anna: Baumodus nur fürs eigene Zimmer
  await anna.goto("/profil");
  await anna.getByRole("link", { name: "Annas Zimmer einrichten" }).click();
  await expect(anna.getByTestId("build-mode")).toBeVisible();
  await addObject(anna, "plant");
  // eigenes Bad im Zimmer (Unterraum)
  await anna.getByRole("tab", { name: "Räume" }).click();
  await anna.getByTestId("room-card-bath").click();
  await dragRect(anna, [5, 4], [7, 5]);
  await expect(anna.locator("[data-room]")).toHaveCount(3);
  await waitSaved(anna);
  // Den Flur kann sie nicht verschieben (Umriss bauen nur Admins)
  await clickPlan(anna, 10.5, 2.5);
  await expect(anna.getByTestId("room-sheet")).not.toContainText("Löschen");

  await anna.goto("/wohnung");
  await anna.getByRole("button", { name: "2D", exact: true }).click();
  await expect(
    anna.getByTestId("plan").getByRole("button", { name: "Pflanze" }),
  ).toBeVisible();

  // Max sieht nur den Umriss mit Schloss, auch im Baumodus
  await admin.goto("/plan/bearbeiten");
  await expect(objects(admin)).toHaveCount(0);
  await expect(admin.locator("[data-room]")).toHaveCount(2);
  await admin.goto("/wohnung");
  await admin.getByRole("button", { name: "2D", exact: true }).click();
  const plan = admin.getByTestId("plan");
  await expect(plan.getByText("🔒 Anna")).toBeVisible();
  await expect(plan.locator("[data-object]")).toHaveCount(0);
});
