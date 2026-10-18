"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-state";
import { Button, Field } from "@/components/ui";
import { updateExpectedMembersAction } from "@/server/actions/household";
import { createInviteAction } from "@/server/actions/invites";

export function CreateInviteForm() {
  const [state, action, pending] = useActionState(createInviteAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field
        label="Gültig für (Tage)"
        name="validDays"
        type="number"
        min={1}
        max={90}
        defaultValue={7}
        required
      />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="singleUse"
          className="size-5 accent-[var(--sage-dark)]"
        />
        Einmal-Link (nur für eine Person)
      </label>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        Link + QR-Code erstellen
      </Button>
    </form>
  );
}

export function ExpectedMembersForm({ value }: { value: number }) {
  const [state, action, pending] = useActionState(
    updateExpectedMembersAction,
    null,
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field
        label="Wie viele wohnen in der WG?"
        name="expectedMemberCount"
        type="number"
        min={1}
        max={30}
        defaultValue={value}
        hint="Sobald alle da sind, wird über die Widerspruchsfunktion abgestimmt (Phase 4)."
        required
      />
      <FormMessage state={state} success="Gespeichert." />
      <Button type="submit" variant="secondary" disabled={pending}>
        Speichern
      </Button>
    </form>
  );
}
