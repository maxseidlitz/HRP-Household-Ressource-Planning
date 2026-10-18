import { defineConfig, devices } from "@playwright/test";

// E2E läuft absichtlich über http und eine Nicht-localhost-Adresse, weil
// localhost als "secure context" gilt und Cookie-Probleme verdecken würde.
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: {
      // Datumsfelder wie auf einem deutschen Handy
      args: ["--lang=de-DE"],
      ...(process.env.PW_CHROMIUM_PATH
        ? { executablePath: process.env.PW_CHROMIUM_PATH }
        : {}),
    },
  },
  projects: [
    {
      name: "iphone",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        locale: "de-DE",
        timezoneId: "Europe/Berlin",
      },
    },
  ],
});
