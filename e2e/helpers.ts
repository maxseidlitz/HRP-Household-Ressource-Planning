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
  await page
    .getByRole("radio", { name: type, exact: true })
    .check({ force: true });
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
