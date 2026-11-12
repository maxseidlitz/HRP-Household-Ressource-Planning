import { expect, type Page } from "@playwright/test";

export const uniq = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export async function register(
  page: Page,
  {
    name,
    username,
    password = "geheim1234",
  }: { name: string; username: string; password?: string },
) {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: /Account anlegen/ }).click();
}

export async function login(
  page: Page,
  username: string,
  password = "geheim1234",
) {
  await page.goto("/login");
  await page.getByLabel("Benutzername oder E-Mail").fill(username);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
}

export async function createHousehold(page: Page, name: string, members = 2) {
  await expect(
    page.getByRole("heading", { name: "WG erstellen" }),
  ).toBeVisible();
  await page.getByLabel("Name der WG").fill(name);
  await page.getByLabel("Wie viele wohnen in der WG?").fill(String(members));
  await page.getByRole("button", { name: "WG erstellen" }).click();
  // Neue WG startet im Baumodus mit der Frage nach einer Vorlage
  await expect(
    page.getByRole("heading", { name: "Wohnung bauen" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Leer starten und selbst zeichnen" })
    .click();
}

const ROOM_TYPES: Record<string, string> = {
  Küche: "kitchen",
  Bad: "bath",
  WC: "wc",
  Flur: "hallway",
  Wohnzimmer: "living",
  Zimmer: "bedroom",
  Balkon: "balcony",
  Abstellraum: "storage",
  Sonstiges: "other",
};

/** Baumodus öffnen (eine evtl. Vorlagen-Frage überspringen). */
export async function openBuild(page: Page) {
  if (!page.url().includes("/plan/bearbeiten"))
    await page.goto("/plan/bearbeiten");
  await expect(page.getByTestId("build-mode")).toBeVisible();
  const skip = page.getByRole("button", {
    name: "Leer starten und selbst zeichnen",
  });
  if (await skip.isVisible()) await skip.click();
}

export async function waitSaved(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Gespeichert ✓", {
    timeout: 10_000,
  });
}

/**
 * Raum im Baumodus aufziehen (8 × 6 Kästchen am ersten freien Platz),
 * benennen und optional als privates Zimmer zuweisen.
 */
export async function createRoom(
  page: Page,
  {
    type,
    name,
    owner,
    size = [8, 6],
  }: { type: string; name: string; owner?: string; size?: [number, number] },
) {
  await openBuild(page);
  await page.getByRole("tab", { name: "Räume" }).click();
  await page.getByTestId(`room-card-${ROOM_TYPES[type] ?? type}`).click();
  const spot = await page
    .getByTestId("build-mode")
    .getAttribute("data-free-spot");
  const [x, y] = spot!.split(",").map(Number);
  await dragRect(page, [x, y], [x + size[0] - 1, y + size[1] - 1]);
  const sheet = page.getByTestId("room-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Name des Raums").fill(name);
  await sheet.getByLabel("Name des Raums").press("Enter");
  if (owner)
    await sheet.getByLabel("Privat für").selectOption({ label: owner });
  await waitSaved(page);
}

/**
 * Möbel aus der Leiste antippen: landet automatisch im ausgewählten Raum.
 * Danach „Zuletzt gemacht?“ setzen, falls das Möbel Aufgaben hat.
 */
export async function addObject(
  page: Page,
  objectType: string,
  lastDone:
    "heute" | "vor ein paar Tagen" | "weiß nicht" = "vor ein paar Tagen",
) {
  await page.getByRole("tab", { name: "Möbel" }).click();
  await page.getByRole("button", { name: "Alle", exact: true }).click();
  await page.getByTestId(`card-${objectType}`).click();
  const sheet = page.getByTestId("object-sheet");
  await expect(sheet).toBeVisible();
  await waitSaved(page);
  const chip = sheet.getByRole("button", { name: lastDone, exact: true });
  const hasTasks = await chip
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (hasTasks && lastDone !== "weiß nicht") {
    await chip.click();
    await expect(page.getByTestId("build-toast")).toContainText(
      `Gespeichert: zuletzt ${lastDone}`,
    );
  }
}

export async function createInviteLink(page: Page): Promise<string> {
  await page.goto("/verwaltung/einladungen");
  await page.getByRole("button", { name: "Link + QR-Code erstellen" }).click();
  const field = page.getByRole("textbox", { name: "Einladungslink" }).first();
  await expect(field).toHaveValue(/\/einladung\//);
  return field.inputValue();
}

/**
 * Bildschirmkoordinaten eines Punkts im Plan-Editor (in Kacheleinheiten).
 * Scrollt den Punkt vorher in die Mitte, damit er nicht hinter der festen
 * Kopf- oder Tab-Leiste liegt.
 */
export async function planPoint(
  page: Page,
  x: number,
  y: number,
  scroll = true,
) {
  const svg = page.getByTestId("plan-editor");
  return svg.evaluate(
    (el, [px, py, doScroll]) => {
      const s = el as SVGSVGElement;
      const tile = Number(s.dataset.tile);
      const locate = () => {
        const pt = s.createSVGPoint();
        pt.x = px * tile;
        pt.y = py * tile;
        return pt.matrixTransform(s.getScreenCTM()!);
      };
      const box = s.parentElement!;
      let p = locate();
      if (!doScroll) return { x: p.x, y: p.y };
      const b = box.getBoundingClientRect();
      box.scrollBy(p.x - (b.left + b.width / 2), p.y - (b.top + b.height / 2));
      p = locate();
      window.scrollBy(0, p.y - window.innerHeight / 2);
      p = locate();
      return { x: p.x, y: p.y };
    },
    [x, y, scroll ? 1 : 0] as const,
  );
}

/** Rechteck von Kachel a bis Kachel b aufziehen. */
export async function dragRect(
  page: Page,
  a: [number, number],
  b: [number, number],
) {
  await planPoint(page, (a[0] + b[0]) / 2 + 0.5, (a[1] + b[1]) / 2 + 0.5);
  const p1 = await planPoint(page, a[0] + 0.5, a[1] + 0.5, false);
  const p2 = await planPoint(page, b[0] + 0.5, b[1] + 0.5, false);
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.down();
  await page.mouse.move((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, { steps: 3 });
  await page.mouse.move(p2.x, p2.y, { steps: 3 });
  await page.mouse.up();
}

export async function clickPlan(page: Page, x: number, y: number) {
  const p = await planPoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}
