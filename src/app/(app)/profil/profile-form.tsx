"use client";

import { useActionState } from "react";
import type { AvatarConfig } from "@/catalog/avatar";
import { AvatarEditor } from "@/components/avatar-editor";
import { FormMessage } from "@/components/form-state";
import { Button, Field } from "@/components/ui";
import { leaveHouseholdAction } from "@/server/actions/household";
import { updateProfileAction } from "@/server/actions/profile";

export function ProfileForm({
  name,
  avatar,
}: {
  name: string;
  avatar: AvatarConfig;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        label="Name"
        name="name"
        defaultValue={name}
        required
        maxLength={40}
      />
      <AvatarEditor initial={avatar} />
      <FormMessage state={state} success="Gespeichert." />
      <Button type="submit" disabled={pending}>
        Speichern
      </Button>
    </form>
  );
}

export function LeaveHouseholdForm({
  householdId,
  name,
}: {
  householdId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(leaveHouseholdAction, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `${name} wirklich verlassen? Dein privates Zimmer wird geleert.`,
          )
        )
          e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="householdId" value={householdId} />
      <FormMessage state={state} />
      <button
        disabled={pending}
        className="self-start text-sm font-semibold text-status-overdue underline"
      >
        {name} verlassen
      </button>
    </form>
  );
}
