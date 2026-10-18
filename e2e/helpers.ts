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
  await expect(page.getByRole("heading", { name: "Wohnung" })).toBeVisible();
}

export async function createRoom(
  page: Page,
  { type, name, owner }: { type: string; name: string; owner?: string },
) {
  await page.goto("/verwaltung/wohnung");
  const radio = page.getByRole("radio", { name: type, exact: true });
  // Das Radio ist visuell versteckt, also das Label anklicken. Vor der
  // Hydration gesetzte Auswahl kann React zurücksetzen: wiederholen.
  await expect(async () => {
    await page.locator("label", { has: radio }).click();
    await expect(radio).toBeChecked({ timeout: 500 });
  }).toPass();
  await page.getByLabel("Name", { exact: true }).fill(name);
  if (owner)
    await page
      .getByRole("combobox", { name: "Privates Zimmer von" })
      .selectOption({ label: owner });
  await page.getByRole("button", { name: "Raum anlegen" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

export async function addObject(
  page: Page,
  objectType: string,
  lastDone = "vor ein paar Tagen",
) {
  await page.getByRole("combobox", { name: "Objekt" }).selectOption(objectType);
  const picker = page.locator("section", { hasText: "Objekt hinzufügen" });
  const selects = picker.getByLabel("Zuletzt gemacht?");
  for (const s of await selects.all())
    await s.selectOption({ label: lastDone });
  await picker.getByRole("button", { name: /hinzufügen$/ }).click();
  await expect(picker.getByText("Hinzugefügt.")).toBeVisible();
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
