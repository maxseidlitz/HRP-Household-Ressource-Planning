import Link from "next/link";
import { notFound } from "next/navigation";
import { parseAvatar } from "@/catalog/avatar";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui";
import { formatPoints } from "@/domain/points";
import { formatDateTime, relativeTime } from "@/domain/time";
import { requireHousehold } from "@/server/context";
import { getObjectionView } from "@/server/queries/objections";
import { VoteForm } from "./vote-form";

export default async function ObjectionPage({
  params,
}: PageProps<"/widerspruch/[objectionId]">) {
  const { objectionId } = await params;
  const ctx = await requireHousehold();
  const now = new Date();
  const o = getObjectionView(ctx.db, {
    objectionId,
    viewerId: ctx.user.id,
    now,
  });
  if (!o || o.householdId !== ctx.household.id) notFound();
  const tz = ctx.household.timezone;
  const isCompleter = o.completerId === ctx.user.id;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/aufgaben/${o.taskId}`}
        className="text-sm font-semibold text-ink/70"
      >
        ← {o.taskName}
      </Link>
      <h1 className="text-2xl font-bold">Widerspruch</h1>
      <Card className="flex flex-col gap-3">
        <p>
          <strong>{o.completerName}</strong> hat „{o.taskName}“ am{" "}
          {formatDateTime(o.completedAt, tz)} erledigt
          {o.points > 0 && ` (+${formatPoints(o.points)} Punkte)`}.{" "}
          <strong>{o.objectorName}</strong> sagt: nicht erledigt.
        </p>
        <div
          className="flex items-center justify-center gap-6 rounded-xl bg-white/70 py-3 text-center"
          data-testid="tally"
        >
          <span>
            <span className="block text-3xl font-bold">{o.confirm}</span>
            <span className="text-xs">👍 erledigt</span>
          </span>
          <span className="text-2xl text-ink/40">:</span>
          <span>
            <span className="block text-3xl font-bold">{o.reject}</span>
            <span className="text-xs">👎 nicht erledigt</span>
          </span>
        </div>
        <p className="text-xs text-ink/70">
          {o.eligibleCount} stimmberechtigt · Mehrheit der abgegebenen Stimmen
          entscheidet, Gleichstand heißt erledigt.
        </p>
        {o.resolution ? (
          <p
            className={`rounded-xl p-3 font-semibold ${o.resolution === "revoked" ? "bg-status-overdue/10 text-status-overdue" : "bg-status-fresh/10 text-status-fresh"}`}
            role="status"
          >
            {o.resolution === "revoked"
              ? "↩️ Entschieden: nicht erledigt. Die Punkte entfallen, die Aufgabe ist wieder fällig."
              : "✅ Entschieden: bleibt erledigt. Die Punkte zählen."}
          </p>
        ) : o.canVote ? (
          <>
            <p className="text-sm font-semibold">
              Abstimmung endet {relativeTime(o.deadlineAt, now)}.
            </p>
            <VoteForm
              objectionId={o.id}
              myVote={o.myVote}
              completerName={o.completerName}
            />
          </>
        ) : (
          <p className="text-sm text-ink/70">
            {isCompleter
              ? "Über deine eigene Erledigung stimmst du nicht mit. Bis zur Entscheidung sind die Punkte eingefroren."
              : "Du bist bei dieser Abstimmung nicht stimmberechtigt."}{" "}
            Ende {relativeTime(o.deadlineAt, now)}.
          </p>
        )}
      </Card>
      {o.votes.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Stimmen</h2>
          <ul className="flex flex-col gap-2">
            {o.votes.map((v) => (
              <li
                key={v.userId}
                className="flex items-center gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm"
              >
                <Avatar
                  config={parseAvatar(v.avatarJson, v.userId)}
                  size={24}
                  title={v.name}
                />
                <span className="flex-1 font-semibold">{v.name}</span>
                {v.vote === "confirm" ? "👍 erledigt" : "👎 nicht erledigt"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
