import { describe, expect, it } from "vitest";
import { leaderboard, type ScoredCompletion } from "./leaderboard";

const c = (
  userId: string,
  points: number,
  day: number,
  status: ScoredCompletion["status"] = "valid",
): ScoredCompletion => ({
  userId,
  points,
  status,
  completedAt: new Date(Date.UTC(2026, 9, day)),
});

describe("leaderboard", () => {
  const completions = [
    c("anna", 3, 2),
    c("anna", 4.5, 10),
    c("ben", 3, 28, "valid"),
    c("ben", 9, 12, "revoked"),
    c("ben", 3, 15, "contested"),
    c("ben", 6, 20),
    c("ex", 50, 5),
  ];

  it("summiert nur gültige Erledigungen der Mitglieder", () => {
    expect(leaderboard(["anna", "ben", "cleo"], completions, null)).toEqual([
      { userId: "ben", points: 9, completions: 2, rank: 1 },
      { userId: "anna", points: 7.5, completions: 2, rank: 2 },
      { userId: "cleo", points: 0, completions: 0, rank: 3 },
    ]);
  });

  it("filtert nach Zeitraum", () => {
    const since = new Date(Date.UTC(2026, 9, 11));
    expect(
      leaderboard(["anna", "ben"], completions, since).map((e) => e.points),
    ).toEqual([9, 0]);
  });

  it("vergibt bei Gleichstand denselben Rang", () => {
    const board = leaderboard(
      ["a", "b", "c"],
      [c("a", 3, 1), c("b", 3, 1)],
      null,
    );
    expect(board.map((e) => e.rank)).toEqual([1, 1, 3]);
  });
});
