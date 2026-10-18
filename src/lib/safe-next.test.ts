import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("lässt interne Pfade zu", () => {
    expect(safeNext("/einladung/abc")).toBe("/einladung/abc");
  });
  it("blockt externe Ziele", () => {
    for (const v of [
      "https://evil.example",
      "//evil.example",
      "/\\evil",
      "",
      undefined,
    ])
      expect(safeNext(v)).toBe("/");
  });
});
