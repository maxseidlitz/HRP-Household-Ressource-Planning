import Link from "next/link";
import type { DB } from "@/db/client";
import { castFeatureVoteAction } from "@/server/actions/admin";
import { HideOnPath } from "./hide-on-path";
import { pendingVotesFor } from "@/server/queries/objections";
import { objectionVoteState } from "@/server/queries/settings";

/**
 * Dezente Hinweise oben auf jeder Seite (Spez. 6.3): die Frage nach der
 * Widerspruchsfunktion und offene Abstimmungen über Widersprüche.
 */
export function HouseholdPrompts({
  db,
  householdId,
  viewerId,
}: {
  db: DB;
  householdId: string;
  viewerId: string;
}) {
  const now = new Date();
  const feature = objectionVoteState(db, { householdId, viewerId });
  const askFeature =
    feature.open &&
    feature.total >= 2 &&
    !feature.enabled &&
    feature.myVote === null;
  const pending = pendingVotesFor(db, { householdId, viewerId, now });
  if (!askFeature && pending.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {askFeature && (
        <section
          aria-label="Abstimmung Widerspruchsfunktion"
          className="rounded-2xl border-2 border-ink bg-white/80 p-3"
          data-testid="feature-vote"
        >
          <p className="text-sm font-semibold">
            🗳️ Sollen Erledigungen angefochten werden können?
          </p>
          <p className="mb-2 text-xs text-ink/70">
            Dann kann man 24 Stunden lang „Nicht erledigt“ sagen und die WG
            stimmt ab. Gilt nur, wenn alle zustimmen ({feature.yes} von{" "}
            {feature.total} haben zugestimmt).
          </p>
          <form action={castFeatureVoteAction} className="flex gap-2">
            <button
              name="vote"
              value="yes"
              className="flex-1 rounded-lg border-2 border-ink bg-sage px-3 py-1.5 text-sm font-semibold"
            >
              Ja
            </button>
            <button
              name="vote"
              value="no"
              className="flex-1 rounded-lg border-2 border-ink bg-cream px-3 py-1.5 text-sm font-semibold"
            >
              Lieber nicht
            </button>
          </form>
        </section>
      )}
      {pending.map((o) => (
        <HideOnPath key={o.id} path={`/widerspruch/${o.id}`}>
          <Link
            href={`/widerspruch/${o.id}`}
            className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-status-sweet/40 p-3 text-sm font-medium"
            data-testid="pending-vote"
          >
            <span aria-hidden className="text-2xl">
              🗳️
            </span>
            <span className="flex-1">
              Hat {o.completerName} „{o.taskName}“ wirklich erledigt? Stimm ab.
            </span>
            <span aria-hidden>→</span>
          </Link>
        </HideOnPath>
      ))}
    </div>
  );
}
