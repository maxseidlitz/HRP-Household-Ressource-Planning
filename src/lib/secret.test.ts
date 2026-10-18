import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAuthSecret } from "./secret";

describe("resolveAuthSecret", () => {
  it("bevorzugt das Secret aus der Umgebung", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hrp-"));
    expect(resolveAuthSecret(dir, "x".repeat(40))).toBe("x".repeat(40));
  });

  it("erzeugt beim ersten Start ein Secret und verwendet es danach weiter", () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), "hrp-")), "data");
    const first = resolveAuthSecret(dir);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(resolveAuthSecret(dir)).toBe(first);
    expect(statSync(path.join(dir, ".auth-secret")).mode & 0o777).toBe(0o600);
  });
});
