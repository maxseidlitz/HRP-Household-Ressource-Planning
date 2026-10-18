import Link from "next/link";
import { CopyField } from "@/components/copy-button";
import { QrCode } from "@/components/qr-code";
import { formatDateTime } from "@/domain/time";
import { revokeInviteAction } from "@/server/actions/invites";
import { appOrigin, requireAdmin } from "@/server/context";
import { listMembers } from "@/server/queries/households";
import { inviteState, listInvites } from "@/server/queries/invites";
import { CreateInviteForm, ExpectedMembersForm } from "./invite-forms";

export default async function InvitesPage() {
  const ctx = await requireAdmin();
  const now = new Date();
  const origin = await appOrigin();
  const invites = listInvites(ctx.db, ctx.household.id);
  const active = invites.filter((i) => inviteState(i, now) === "valid");
  const inactive = invites
    .filter((i) => inviteState(i, now) !== "valid")
    .slice(0, 10);
  const memberCount = listMembers(ctx.db, ctx.household.id).length;
  const tz = ctx.household.timezone;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/verwaltung" className="text-sm font-semibold text-ink/70">
        ← Admin
      </Link>
      <h1 className="text-2xl font-bold">Einladen</h1>
      <p className="text-sm text-ink/70">
        {memberCount} von {ctx.household.expectedMemberCount} erwarteten
        Mitgliedern sind dabei.
      </p>

      {active.map((i) => {
        const url = `${origin}/einladung/${i.token}`;
        return (
          <section
            key={i.id}
            className="flex flex-col items-center gap-3 rounded-2xl glass p-4"
            aria-label="Aktiver Einladungslink"
          >
            <QrCode value={url} />
            <p className="text-center text-xs text-ink/70">
              Mit der Handy-Kamera scannen · gültig bis{" "}
              {formatDateTime(i.expiresAt, tz)} ·{" "}
              {i.maxUses === 1 ? "Einmal-Link" : `${i.uses}× benutzt`}
            </p>
            <div className="w-full">
              <CopyField value={url} label="Einladungslink" />
            </div>
            <form action={revokeInviteAction}>
              <input type="hidden" name="inviteId" value={i.id} />
              <button className="text-sm font-semibold text-status-overdue underline">
                Link widerrufen
              </button>
            </form>
          </section>
        );
      })}

      <section className="rounded-2xl border border-black/10 p-4">
        <h2 className="mb-3 font-bold">
          {active.length
            ? "Weiteren Link erstellen"
            : "Einladungslink erstellen"}
        </h2>
        <CreateInviteForm />
      </section>

      <details className="rounded-2xl border border-black/10 p-4">
        <summary className="cursor-pointer font-bold">
          Erwartete Mitglieder
        </summary>
        <div className="mt-3">
          <ExpectedMembersForm value={ctx.household.expectedMemberCount} />
        </div>
      </details>

      {inactive.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-ink/70">Frühere Links</h2>
          <ul className="flex flex-col gap-1 text-xs text-ink/60">
            {inactive.map((i) => (
              <li key={i.id}>
                {formatDateTime(i.createdAt, tz)} ·{" "}
                {
                  {
                    expired: "abgelaufen",
                    revoked: "widerrufen",
                    used_up: "verwendet",
                    valid: "",
                  }[inviteState(i, now)]
                }
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
