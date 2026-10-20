import Link from "next/link";
import { getDb } from "@/db";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { getMembership } from "@/server/queries/members";
import { lookupInvite } from "@/server/queries/invites";
import { InviteJoin } from "./invite-join";

const STATE_TEXT = {
  expired: "Dieser Einladungslink ist abgelaufen. Frag nach einem neuen.",
  revoked: "Dieser Einladungslink wurde widerrufen. Frag nach einem neuen.",
  used_up:
    "Dieser Einladungslink wurde schon verwendet. Frag nach einem neuen.",
} as const;

export default async function InvitePage({
  params,
}: PageProps<"/einladung/[token]">) {
  const { token } = await params;
  const session = await getSession();
  const db = getDb();
  const info = lookupInvite(db, token, new Date());

  if (!info) {
    return (
      <Card>
        <h1 className="mb-2 text-xl font-bold">Link ungültig</h1>
        <p className="text-sm">Diesen Einladungslink gibt es nicht.</p>
      </Card>
    );
  }

  const alreadyMember =
    session && getMembership(db, info.invite.householdId, session.user.id);

  return (
    <Card>
      <p className="mb-1 text-4xl">{info.householdEmoji ?? "🏠"}</p>
      <h1 className="mb-1 text-2xl font-bold">{info.householdName}</h1>
      <p className="mb-6 text-sm text-ink/70">
        {info.inviterName} lädt dich in die WG ein.
      </p>
      {info.state !== "valid" && !alreadyMember ? (
        <p role="alert" className="text-sm font-medium text-status-overdue">
          {STATE_TEXT[info.state]}
        </p>
      ) : alreadyMember ? (
        <Link href="/aufgaben" className="font-semibold underline">
          Du bist schon dabei, zur WG →
        </Link>
      ) : (
        <InviteJoin token={token} userName={session?.user.name ?? null} />
      )}
    </Card>
  );
}
