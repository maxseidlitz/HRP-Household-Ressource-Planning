import Link from "next/link";
import { parseAvatar } from "@/catalog/avatar";
import { Avatar } from "@/components/avatar";
import { requireAdmin } from "@/server/context";
import { listMembers } from "@/server/queries/households";
import { MemberActions } from "./member-actions";

export default async function MembersPage() {
  const ctx = await requireAdmin();
  const members = listMembers(ctx.db, ctx.household.id);
  const creatorId = ctx.household.createdByUserId;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/verwaltung" className="text-sm font-semibold text-ink/70">
        ← Admin
      </Link>
      <h1 className="text-2xl font-bold">Mitglieder</h1>
      <ul className="flex flex-col gap-3">
        {members.map((m) => {
          const isCreator = m.userId === creatorId;
          const isSelf = m.userId === ctx.user.id;
          return (
            <li key={m.userId} className="rounded-2xl glass p-3">
              <div className="flex items-center gap-3">
                <Avatar
                  config={parseAvatar(m.avatarJson, m.userId)}
                  size={32}
                  title={m.name}
                />
                <div className="flex-1">
                  <p className="font-bold">
                    {m.name}
                    {isSelf && <span className="font-normal"> (du)</span>}
                  </p>
                  <p className="text-xs text-ink/65">
                    @{m.username} · {m.role === "admin" ? "Admin" : "Mitglied"}
                    {isCreator && " · hat die WG erstellt"}
                  </p>
                </div>
              </div>
              <MemberActions
                userId={m.userId}
                name={m.name}
                role={m.role}
                isSelf={isSelf}
                protectedCreator={isCreator && !isSelf}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
