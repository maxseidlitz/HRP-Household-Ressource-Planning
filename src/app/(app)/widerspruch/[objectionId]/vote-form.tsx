"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-state";
import { castObjectionVoteAction } from "@/server/actions/admin";

export function VoteForm({
  objectionId,
  myVote,
  completerName,
}: {
  objectionId: string;
  myVote: "confirm" | "reject" | null;
  completerName: string;
}) {
  const [state, action, pending] = useActionState(
    castObjectionVoteAction,
    null,
  );
  const options = [
    {
      vote: "confirm",
      label: "👍 Ist erledigt",
      hint: `${completerName} hat’s gemacht`,
    },
    { vote: "reject", label: "👎 Nicht erledigt", hint: "Punkte zurücknehmen" },
  ] as const;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="objectionId" value={objectionId} />
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={o.vote}
            name="vote"
            value={o.vote}
            disabled={pending}
            aria-pressed={myVote === o.vote}
            className={`flex flex-col items-center gap-0.5 rounded-xl border-2 border-b-4 border-ink px-3 py-3 font-bold ${myVote === o.vote ? "bg-ink text-cream" : "bg-white"}`}
          >
            {o.label}
            <span className="text-xs font-normal opacity-70">{o.hint}</span>
          </button>
        ))}
      </div>
      <FormMessage state={state} success="Stimme gezählt." />
    </form>
  );
}
