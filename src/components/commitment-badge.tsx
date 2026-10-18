import { weekdayShort } from "@/domain/time";
import type { OpenCommitment } from "@/server/queries/tasks";

/** Kurzlabel fürs Wecker-Icon: „Fr · Anna“ (Spez. 12.4). */
export function commitmentLabel(
  c: Pick<OpenCommitment, "plannedFor" | "userName">,
  timeZone: string,
): string {
  return `${weekdayShort(new Date(c.plannedFor), timeZone)} · ${c.userName}`;
}

export function CommitmentBadge({
  commitment,
  timeZone,
}: {
  commitment: OpenCommitment;
  timeZone: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-ink/40 bg-white px-1.5 text-[11px] font-semibold"
      data-testid="commitment-badge"
    >
      <span aria-hidden>⏰</span>
      <span className="sr-only">Eingeplant:</span>
      {commitmentLabel(commitment, timeZone)}
    </span>
  );
}
