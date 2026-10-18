import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  addObject,
  createHousehold,
  createInviteLink,
  createRoom,
  register,
  uniq,
} from "./helpers";

// 1×1-PNG für den Feedback-Screenshot
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
);

async function join(browser: Browser, link: string, name: string) {
  const p = await (await browser.newContext()).newPage();
  await p.goto(link);
  await register(p, { name, username: uniq(name.toLowerCase()) });
  await expect(p.getByRole("heading", { name: "Aufgaben" })).toBeVisible();
  return p;
}

async function voteFeature(p: Page, yes: boolean) {
  await p.goto("/aufgaben");
  const box = p.getByTestId("feature-vote");
  await expect(box).toBeVisible();
  await box.getByRole("button", { name: yes ? "Ja" : "Lieber nicht" }).click();
  await expect(box).toHaveCount(0);
}

test("Widerspruch per Abstimmung, Feedback mit Screenshot, Einstellungen, Statistik, Export", async ({
  browser,
}) => {
  const max = await (await browser.newContext()).newPage();
  await max.goto("/registrieren");
  await register(max, { name: "Max", username: uniq("max") });
  await createHousehold(max, "WG Admin", 3);
  await createRoom(max, { type: "Bad", name: "Bad" });
  await addObject(max, "toilet");
  const link = await createInviteLink(max);
  const anna = await join(browser, link, "Anna");
  const ben = await join(browser, link, "Ben");

  // --- Alle stimmen zu → Widerspruch ist an ---
  await voteFeature(max, true);
  await voteFeature(anna, true);
  await ben.goto("/aufgaben");
  await expect(ben.getByTestId("feature-vote")).toContainText(
    "2 von 3 haben zugestimmt",
  );
  await voteFeature(ben, true);
  await max.goto("/verwaltung/einstellungen");
  await expect(max.getByTestId("objection-status")).toHaveText(
    "An – alle haben zugestimmt.",
  );

  // --- Anna erledigt, Ben widerspricht, Max stimmt mit ab ---
  await anna.goto("/aufgaben");
  await anna.getByRole("button", { name: "Klo putzen erledigt" }).click();
  await expect(anna.getByTestId("my-points")).toContainText("4,5");

  await ben.goto("/aufgaben");
  await ben.getByRole("link", { name: /Klo putzen/ }).click();
  await ben.getByLabel("Optionen für die Erledigung von Anna").click();
  await ben.getByRole("button", { name: "Nicht erledigt" }).click();
  await expect(ben).toHaveURL(/\/widerspruch\//);
  await expect(ben.getByTestId("tally")).toContainText("1👎 nicht erledigt");

  // Punkte eingefroren
  await anna.reload();
  await expect(anna.getByTestId("my-points")).not.toContainText("4,5");

  await max.goto("/aufgaben");
  await max.getByTestId("pending-vote").click();
  await max.getByRole("button", { name: /Nicht erledigt/ }).click();
  await expect(
    max.getByRole("status").filter({ hasText: "Entschieden" }),
  ).toContainText("nicht erledigt");
  await anna.goto("/mitteilungen");
  await expect(anna.getByTestId("notifications")).toContainText(
    "Widerspruch angenommen",
  );

  // --- Feedback mit Screenshot aus dem Profilmenü ---
  await anna.goto("/rangliste");
  await anna.getByLabel("Profilmenü").click();
  await anna.getByRole("link", { name: "Feedback senden" }).click();
  await expect(anna).toHaveURL(/von=%2Frangliste/);
  await anna.locator("label", { hasText: "Idee" }).click();
  await anna.getByLabel("Beschreibung").fill("Bitte einen Dark Mode!");
  await anna.getByLabel(/Screenshot/).setInputFiles({
    name: "bild.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await anna.getByRole("button", { name: "Feedback senden" }).click();
  await expect(
    anna.getByText("Danke! Dein Feedback ist angekommen."),
  ).toBeVisible();
  await expect(anna.getByTestId("my-ticket")).toContainText("Neu");

  await max.goto("/verwaltung");
  await expect(max.getByRole("link", { name: /Feedback/ })).toContainText(
    "1 neu",
  );
  await max.goto("/verwaltung/feedback");
  await max.getByRole("link", { name: /Dark Mode/ }).click();
  await expect(max).toHaveURL(/\/verwaltung\/feedback\/.+/);
  await expect(max.getByText("/rangliste")).toBeVisible();
  const img = max.getByRole("img", { name: "Screenshot zum Feedback" });
  const res = await max.request.get((await img.getAttribute("src"))!);
  expect(res.headers()["content-type"]).toBe("image/png");
  // Andere Mitglieder sehen den Screenshot nicht
  expect(
    (await ben.request.get((await img.getAttribute("src"))!)).status(),
  ).toBe(404);
  await max
    .getByRole("combobox", { name: "Status" })
    .selectOption("in_progress");
  await max.getByLabel("Antwort an den Absender").fill("Ist notiert!");
  await max.getByRole("button", { name: "Speichern" }).click();
  await expect(max.getByText("Gespeichert.")).toBeVisible();
  await anna.goto("/feedback");
  await expect(anna.getByTestId("my-ticket")).toContainText("Ist notiert!");
  await expect(anna.getByTestId("my-ticket")).toContainText("In Arbeit");

  // --- Einstellungen: Mindestfortschritt prüfen ---
  await max.goto("/verwaltung/einstellungen");
  await max.getByLabel("Mindestfortschritt (%)").fill("60");
  await max.getByRole("button", { name: "Speichern" }).click();
  await expect(max.locator("p[role=alert]")).toContainText(
    "Mindestfortschritt",
  );
  await max.getByLabel("Mindestfortschritt (%)").fill("20");
  await max.getByRole("button", { name: "Speichern" }).click();
  await expect(max.getByText("Gespeichert.")).toBeVisible();

  // --- Export und Statistik ---
  const exp = await max.request.get("/api/export");
  const data = (await exp.json()) as {
    household: { name: string; settings: { minProgress: number } };
    members: unknown[];
    completions: { status: string }[];
  };
  expect(data.household.name).toBe("WG Admin");
  expect(data.household.settings.minProgress).toBe(0.2);
  expect(data.members).toHaveLength(3);
  expect(data.completions.map((c) => c.status)).toEqual(["revoked"]);
  expect((await anna.request.get("/api/export")).url()).not.toContain(
    "/api/export",
  );

  await max.goto("/verwaltung/statistik?tage=7");
  await expect(max.getByTestId("kpis")).toContainText("3/3");
  await expect(
    max.getByRole("img", { name: "Aktive Personen pro Tag" }),
  ).toBeVisible();
});
