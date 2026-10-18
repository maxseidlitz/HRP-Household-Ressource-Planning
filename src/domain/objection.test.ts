import { describe, expect, it } from "vitest";
import {
  evaluateObjection,
  featureVoteState,
  objectionBlocker,
  type Vote,
} from "./objection";

const votes = (v: Record<string, Vote>) => new Map(Object.entries(v));

describe("Widerspruch auswerten (Spez. 6.3)", () => {
  it("3er-WG: B widerspricht, C stimmt nicht ab → nach 24 h zurückgesetzt", () => {
    const input = { eligible: ["b", "c"], votes: votes({ b: "reject" }) };
    expect(evaluateObjection({ ...input, deadlinePassed: false })).toBeNull();
    expect(evaluateObjection({ ...input, deadlinePassed: true })).toBe(
      "revoked",
    );
  });

  it("4er-WG: 1:1 und D stimmt nicht ab → bleibt gültig", () => {
    const input = {
      eligible: ["b", "c", "d"],
      votes: votes({ b: "reject", c: "confirm" }),
    };
    expect(evaluateObjection({ ...input, deadlinePassed: false })).toBeNull();
    expect(evaluateObjection({ ...input, deadlinePassed: true })).toBe("valid");
  });

  it("2er-WG: ein Widerspruch reicht sofort", () => {
    expect(
      evaluateObjection({
        eligible: ["b"],
        votes: votes({ b: "reject" }),
        deadlinePassed: false,
      }),
    ).toBe("revoked");
  });

  it("endet vorzeitig, sobald eine Seite nicht mehr einzuholen ist", () => {
    const eligible = ["b", "c", "d", "e"];
    expect(
      evaluateObjection({
        eligible,
        votes: votes({ b: "reject", c: "reject", d: "reject" }),
        deadlinePassed: false,
      }),
    ).toBe("revoked");
    // 2 Bestätigungen gegen 1 Widerspruch, eine Stimme offen → max. 2:2
    expect(
      evaluateObjection({
        eligible,
        votes: votes({ b: "reject", c: "confirm", d: "confirm" }),
        deadlinePassed: false,
      }),
    ).toBe("valid");
  });

  it("ignoriert Stimmen von Nicht-Stimmberechtigten", () => {
    expect(
      evaluateObjection({
        eligible: ["b", "c"],
        votes: votes({ b: "reject", x: "reject" }),
        deadlinePassed: false,
      }),
    ).toBeNull();
  });
});

describe("Wer darf widersprechen?", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const base = {
    enabled: true,
    viewerId: "b",
    isPrivate: false,
    viewerAway: false,
    now,
    completion: {
      userId: "a",
      completedAt: new Date("2026-10-18T08:00:00Z"),
      status: "valid" as const,
      source: "manual" as const,
    },
  };
  it("erlaubt andere innerhalb von 24 h", () => {
    expect(objectionBlocker(base)).toBeNull();
  });
  it("sperrt eigene, alte, private, Urlaubs- und doppelte Widersprüche", () => {
    expect(objectionBlocker({ ...base, viewerId: "a" })).toMatch(/eigenen/);
    expect(objectionBlocker({ ...base, enabled: false })).toMatch(/aus/);
    expect(objectionBlocker({ ...base, isPrivate: true })).toMatch(/Privat/);
    expect(objectionBlocker({ ...base, viewerAway: true })).toMatch(/Urlaub/);
    expect(
      objectionBlocker({
        ...base,
        completion: { ...base.completion, source: "vacation" },
      }),
    ).toMatch(/Urlaubspaket/);
    expect(
      objectionBlocker({
        ...base,
        completion: { ...base.completion, status: "contested" },
      }),
    ).toMatch(/schon/);
    expect(
      objectionBlocker({
        ...base,
        now: new Date("2026-10-19T09:00:00Z"),
      }),
    ).toMatch(/24 Stunden/);
  });
});

describe("Aktivierung per Abstimmung", () => {
  it("braucht alle Mitglieder und startet erst, wenn alle da sind", () => {
    const memberIds = ["a", "b", "c"];
    const s = featureVoteState({
      memberIds,
      votes: new Map([
        ["a", true],
        ["b", true],
      ]),
      expectedMemberCount: 3,
    });
    expect(s).toEqual({ yes: 2, total: 3, open: true, accepted: false });
    expect(
      featureVoteState({
        memberIds,
        votes: new Map(memberIds.map((id) => [id, true])),
        expectedMemberCount: 3,
      }).accepted,
    ).toBe(true);
    expect(
      featureVoteState({
        memberIds: ["a"],
        votes: new Map(),
        expectedMemberCount: 3,
      }).open,
    ).toBe(false);
  });
});
