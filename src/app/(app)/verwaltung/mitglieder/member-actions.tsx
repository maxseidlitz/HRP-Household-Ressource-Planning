"use client";

import { useActionState } from "react";
import { CopyField } from "@/components/copy-button";
import { FormMessage } from "@/components/form-state";
import {
  createPasswordResetAction,
  removeMemberAction,
  setRoleAction,
} from "@/server/actions/members";

const linkButton = "text-sm font-semibold underline disabled:opacity-50";

export function MemberActions({
  userId,
  name,
  role,
  isSelf,
  protectedCreator,
}: {
  userId: string;
  name: string;
  role: "admin" | "member";
  isSelf: boolean;
  protectedCreator: boolean;
}) {
  const [roleState, roleAction, rolePending] = useActionState(
    setRoleAction,
    null,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeMemberAction,
    null,
  );
  const [resetState, resetAction, resetPending] = useActionState(
    createPasswordResetAction,
    null,
  );

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {!protectedCreator && (
          <form action={roleAction}>
            <input type="hidden" name="userId" value={userId} />
            <input
              type="hidden"
              name="role"
              value={role === "admin" ? "member" : "admin"}
            />
            <button className={linkButton} disabled={rolePending}>
              {role === "admin"
                ? isSelf
                  ? "Admin-Rolle abgeben"
                  : "Admin-Rechte entziehen"
                : "Zum Admin machen"}
            </button>
          </form>
        )}
        {!isSelf && (
          <form action={resetAction}>
            <input type="hidden" name="userId" value={userId} />
            <button className={linkButton} disabled={resetPending}>
              Passwort-Reset-Link
            </button>
          </form>
        )}
        {!isSelf && !protectedCreator && (
          <form
            action={removeAction}
            onSubmit={(e) => {
              if (!confirm(`${name} wirklich aus der WG entfernen?`))
                e.preventDefault();
            }}
          >
            <input type="hidden" name="userId" value={userId} />
            <button
              className={`${linkButton} text-status-overdue`}
              disabled={removePending}
            >
              Entfernen
            </button>
          </form>
        )}
      </div>
      <FormMessage state={roleState} />
      <FormMessage state={removeState} />
      {resetState?.ok && resetState.data && (
        <div className="rounded-xl bg-cream p-2">
          <CopyField
            value={resetState.data}
            label={`Reset-Link für ${name} (24 h gültig, einmalig)`}
          />
        </div>
      )}
      <FormMessage state={resetState} />
    </div>
  );
}
