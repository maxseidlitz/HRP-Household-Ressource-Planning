import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveVapidKeys } from "./vapid";

describe("resolveVapidKeys", () => {
  it("bevorzugt Schlüssel aus der Umgebung", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hrp-"));
    expect(
      resolveVapidKeys(dir, { publicKey: "pub", privateKey: "priv" }),
    ).toEqual({ publicKey: "pub", privateKey: "priv" });
  });

  it("erzeugt beim ersten Start ein Paar und verwendet es danach weiter", () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), "hrp-")), "data");
    const first = resolveVapidKeys(dir, {});
    // P-256 öffentlicher Schlüssel: 65 Byte, URL-sicheres Base64
    expect(Buffer.from(first.publicKey, "base64url")).toHaveLength(65);
    expect(resolveVapidKeys(dir, {})).toEqual(first);
    expect(statSync(path.join(dir, ".vapid.json")).mode & 0o777).toBe(0o600);
  });
});
