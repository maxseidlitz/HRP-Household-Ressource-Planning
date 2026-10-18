import { describe, expect, it } from "vitest";
import { parseEnv } from "./env-schema";

describe("parseEnv", () => {
  it("liefert sinnvolle Standardwerte für das Heimnetz", () => {
    expect(parseEnv({})).toEqual({
      DATA_DIR: "./data",
      ALLOWED_HOSTS: ["*"],
      APP_PROTOCOL: "http",
      AUTH_RATE_LIMIT: "on",
    });
  });

  it("zerlegt ALLOWED_HOSTS und behandelt leere Werte wie nicht gesetzt", () => {
    const env = parseEnv({
      ALLOWED_HOSTS: "192.168.1.20:3000, zimaboard.local:3000,",
      BETTER_AUTH_URL: "",
    });
    expect(env.ALLOWED_HOSTS).toEqual([
      "192.168.1.20:3000",
      "zimaboard.local:3000",
    ]);
    expect(env.BETTER_AUTH_URL).toBeUndefined();
  });

  it("lehnt zu kurze Secrets ab", () => {
    expect(() => parseEnv({ BETTER_AUTH_SECRET: "kurz" })).toThrow();
  });
});
