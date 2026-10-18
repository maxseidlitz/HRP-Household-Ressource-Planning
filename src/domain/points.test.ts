import { describe, expect, it } from "vitest";
import { pointsFor, roundHalf } from "./points";

const T = { earlyThreshold: 0.4, lateThreshold: 1, minProgress: 0.15 };

describe("pointsFor (Spez. 6.1)", () => {
  it("gibt unter dem Mindestfortschritt 0 Punkte", () => {
    expect(pointsFor(0, 1.5, T)).toBe(0);
    expect(pointsFor(0.149, 1.5, T)).toBe(0);
  });
  it("gibt zu früh Basis 2", () => {
    expect(pointsFor(0.15, 1, T)).toBe(2);
    expect(pointsFor(0.39, 1, T)).toBe(2);
  });
  it("gibt im Sweet Spot Basis 3", () => {
    expect(pointsFor(0.4, 1, T)).toBe(3);
    expect(pointsFor(1, 1, T)).toBe(3);
  });
  it("gibt auch überfällig volle 3 Punkte", () => {
    expect(pointsFor(2.5, 1, T)).toBe(3);
  });
  it("multipliziert und rundet auf 0,5", () => {
    expect(pointsFor(0.5, 1.5, T)).toBe(4.5); // Klo putzen
    expect(pointsFor(0.2, 0.5, T)).toBe(1); // Arbeitsplatte zu früh
    expect(pointsFor(0.5, 0.3, T)).toBe(1); // 0,9 → 1
    expect(roundHalf(1.24)).toBe(1);
    expect(roundHalf(1.25)).toBe(1.5);
  });
  it("respektiert aufgabenspezifische Schwellen", () => {
    expect(
      pointsFor(0.1, 1, {
        earlyThreshold: 0.2,
        lateThreshold: 1,
        minProgress: 0,
      }),
    ).toBe(2);
  });
});
