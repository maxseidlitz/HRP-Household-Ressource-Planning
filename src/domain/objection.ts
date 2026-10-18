/**
 * Widerspruch gegen eine Erledigung (Spez. 6.3).
 *
 * - Stimmberechtigt: alle außer der erledigenden Person, die beim
 *   Widerspruch nicht im Urlaub sind. Der Widerspruch ist die erste Stimme
 *   „nicht erledigt“.
 * - Vorzeitiges Ende, sobald das Ergebnis feststeht, auch wenn alle
 *   Übrigen noch abstimmen würden.
 * - Nach 24 h zählen nur abgegebene Stimmen, Gleichstand → gültig.
 */
export const OBJECTION_WINDOW_MS = 24 * 3_600_000;
export const VOTING_WINDOW_MS = 24 * 3_600_000;

export type Vote = "confirm" | "reject";
export type Resolution = "valid" | "revoked";

export function evaluateObjection(input: {
  eligible: readonly string[];
  votes: ReadonlyMap<string, Vote>;
  deadlinePassed: boolean;
}): Resolution | null {
  let reject = 0;
  let confirm = 0;
  for (const id of input.eligible) {
    const v = input.votes.get(id);
    if (v === "reject") reject++;
    else if (v === "confirm") confirm++;
  }
  const open = input.eligible.length - reject - confirm;
  if (input.deadlinePassed || open === 0)
    return reject > confirm ? "revoked" : "valid";
  // Steht fest, egal wie die Offenen noch stimmen?
  if (reject > confirm + open) return "revoked";
  if (reject + open <= confirm) return "valid";
  return null;
}

/** Darf `viewerId` dieser Erledigung widersprechen? Liefert sonst den Grund. */
export function objectionBlocker(input: {
  enabled: boolean;
  viewerId: string;
  completion: {
    userId: string;
    completedAt: Date;
    status: "valid" | "contested" | "revoked";
    source: "manual" | "vacation";
  };
  isPrivate: boolean;
  viewerAway: boolean;
  now: Date;
}): string | null {
  const c = input.completion;
  if (!input.enabled) return "Die Widerspruchsfunktion ist aus.";
  if (input.isPrivate) return "Private Zimmer sind ausgenommen.";
  if (c.source !== "manual") return "Urlaubspakete sind ausgenommen.";
  if (c.userId === input.viewerId)
    return "Der eigenen Erledigung kannst du nicht widersprechen.";
  if (c.status !== "valid") return "Dazu läuft schon ein Widerspruch.";
  if (input.viewerAway) return "Im Urlaub kannst du nicht widersprechen.";
  if (input.now.getTime() - c.completedAt.getTime() > OBJECTION_WINDOW_MS)
    return "Widerspruch ist nur 24 Stunden lang möglich.";
  return null;
}

/** Aktivierung per Abstimmung: alle Mitglieder müssen zustimmen. */
export function featureVoteState(input: {
  memberIds: readonly string[];
  votes: ReadonlyMap<string, boolean>;
  expectedMemberCount: number;
}) {
  const yes = input.memberIds.filter((id) => input.votes.get(id) === true);
  return {
    yes: yes.length,
    total: input.memberIds.length,
    /** Abstimmung startet erst, wenn alle erwarteten Mitglieder da sind. */
    open: input.memberIds.length >= input.expectedMemberCount,
    accepted:
      input.memberIds.length >= 2 && yes.length === input.memberIds.length,
  };
}
