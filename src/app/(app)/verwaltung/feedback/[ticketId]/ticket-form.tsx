"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-state";
import { Button } from "@/components/ui";
import { updateFeedbackAction } from "@/server/actions/admin";

const inputCls =
  "rounded-lg border-2 border-ink/30 bg-white px-3 py-2 text-base font-normal outline-none focus:border-sage-dark";

export function TicketForm({
  ticketId,
  status,
  adminNote,
  adminReply,
  statuses,
}: {
  ticketId: string;
  status: string;
  adminNote: string;
  adminReply: string;
  statuses: [string, string][];
}) {
  const [state, action, pending] = useActionState(updateFeedbackAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Status
        <select name="status" defaultValue={status} className={inputCls}>
          {statuses.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Interne Notiz
        <textarea
          name="adminNote"
          rows={2}
          defaultValue={adminNote}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Antwort an den Absender
        <textarea
          name="adminReply"
          rows={3}
          defaultValue={adminReply}
          className={inputCls}
        />
        <span className="text-xs font-normal text-ink/60">
          Kommt als Mitteilung an.
        </span>
      </label>
      <Button disabled={pending}>Speichern</Button>
      <FormMessage state={state} success="Gespeichert." />
    </form>
  );
}
