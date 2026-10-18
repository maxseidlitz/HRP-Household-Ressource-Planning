"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-state";
import { Button, Field } from "@/components/ui";
import { resetPasswordAction } from "@/server/actions/profile";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Field
        label="Neues Passwort"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>
        Passwort speichern
      </Button>
    </form>
  );
}
