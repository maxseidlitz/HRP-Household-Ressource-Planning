"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-state";
import { Button } from "@/components/ui";
import { acceptInviteAction } from "@/server/actions/invites";
import type { FormState } from "@/server/actions/result";
import { RegisterForm } from "../../registrieren/register-form";

export function InviteJoin({
  token,
  userName,
}: {
  token: string;
  userName: string | null;
}) {
  const [state, action, pending] = useActionState(acceptInviteAction, null);
  const [joinError, setJoinError] = useState<FormState>(null);

  if (userName) {
    return (
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <FormMessage state={state} />
        <Button type="submit" disabled={pending}>
          Als {userName} beitreten
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RegisterForm
        submitLabel="Account anlegen und beitreten"
        onRegistered={async () => {
          const fd = new FormData();
          fd.set("token", token);
          // Leitet bei Erfolg serverseitig zur WG weiter.
          const r = await acceptInviteAction(null, fd);
          if (r && !r.ok) setJoinError(r);
        }}
      />
      <FormMessage state={joinError} />
      <p className="text-center text-sm">
        Schon einen Account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(`/einladung/${token}`)}`}
          className="font-semibold underline"
        >
          Anmelden
        </Link>
      </p>
    </div>
  );
}
