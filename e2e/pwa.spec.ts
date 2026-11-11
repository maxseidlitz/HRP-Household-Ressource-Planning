import { expect, test } from "@playwright/test";
import { createHousehold, register, uniq } from "./helpers";

// Die Tests laufen über http und eine IP (kein sicherer Kontext). localhost
// gilt im Browser dagegen als sicher: dort lassen sich Service Worker und
// Push-Schalter wie unter HTTPS prüfen.
const base = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100");
const secureBase = `http://localhost:${base.port}`;

test("Manifest, Icons, Service Worker und Offline-Seite werden ausgeliefert", async ({
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  const icons = manifest.icons as { src: string; purpose?: string }[];
  expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
  for (const icon of icons) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
  }
  const sw = await request.get("/sw.js");
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(await sw.text()).toContain("showNotification");
  expect((await request.get("/offline.html")).status()).toBe(200);
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
});

test("Ohne HTTPS: Hinweis statt Push-Schalter", async ({ page }) => {
  await page.goto("/registrieren");
  await register(page, { name: "Max", username: uniq("max") });
  await createHousehold(page, "WG PWA", 1);
  await page.goto("/profil");
  await expect(page.getByTestId("push-hint")).toContainText("HTTPS");
  // Fremde Seiten dürfen keine Abos anlegen
  const res = await page.request.post("/api/push", {
    headers: { origin: "https://evil.example" },
    data: {
      endpoint: "https://push.example/1",
      keys: { p256dh: "a", auth: "b" },
    },
  });
  expect(res.status()).toBe(403);
});

test("Sicherer Kontext: Service Worker, Push-Schalter und offline", async ({
  page,
  context,
}) => {
  // Headless-Chromium verweigert Mitteilungen standardmäßig; hier wie nach
  // einem „Erlauben“ des Nutzers.
  await context.grantPermissions(["notifications"], { origin: secureBase });
  await page.goto(`${secureBase}/registrieren`);
  await register(page, { name: "Max", username: uniq("max") });
  await createHousehold(page, "WG Sicher", 1);
  await page.goto(`${secureBase}/profil`);
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.scope;
  });
  expect(scope).toBe(`${secureBase}/`);
  await expect(
    page.getByRole("button", { name: "Push einschalten" }),
  ).toBeVisible();

  // Abo speichern und wieder löschen (ohne echten Push-Dienst)
  const sub = {
    endpoint: `https://push.example/${uniq("sub")}`,
    keys: { p256dh: "BNcR", auth: "tBHI" },
  };
  expect(
    (await page.request.post(`${secureBase}/api/push`, { data: sub })).ok(),
  ).toBe(true);
  expect(
    (await page.request.delete(`${secureBase}/api/push`, { data: sub })).ok(),
  ).toBe(true);

  // Offline: Hinweisseite aus dem Service Worker
  await context.setOffline(true);
  await page.goto(`${secureBase}/aufgaben`).catch(() => {});
  await expect(
    page.getByRole("heading", { name: "Keine Verbindung" }),
  ).toBeVisible();
  await context.setOffline(false);
});
