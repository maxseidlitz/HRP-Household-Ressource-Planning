import Link from "next/link";
import { describeNotification } from "@/domain/notifications";
import { formatDateTime, relativeTime } from "@/domain/time";
import { requireHousehold } from "@/server/context";
import { track } from "@/server/queries/analytics";
import { listNotifications } from "@/server/queries/notifications";
import { MarkRead } from "./mark-read";

export default async function NotificationsPage() {
  const ctx = await requireHousehold();
  const now = new Date();
  const items = listNotifications(ctx.db, {
    userId: ctx.user.id,
    householdId: ctx.household.id,
    limit: 50,
  });
  const unread = items.filter((n) => !n.readAt).length;
  track(ctx.db, {
    name: "screen_view",
    screen: "mitteilungen",
    householdId: ctx.household.id,
    userId: ctx.user.id,
  });

  return (
    <div className="flex flex-col gap-4">
      <MarkRead unread={unread} />
      <h1 className="text-2xl font-bold">Mitteilungen</h1>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/15 p-6 text-center">
          <p className="mb-2 text-4xl">🔕</p>
          <p className="font-semibold">Noch keine Mitteilungen.</p>
          <p className="text-sm text-ink/70">
            Hier erinnert dich die App an Eingeplantes und Überfälliges.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="notifications">
          {items.map((n) => {
            const v = describeNotification(n.type, n.payloadJson);
            const body = (
              <>
                <span aria-hidden className="text-2xl">
                  {v.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{v.text}</span>
                  <span
                    className="block text-xs text-ink/60"
                    title={formatDateTime(n.createdAt, ctx.household.timezone)}
                  >
                    {relativeTime(n.createdAt, now)}
                  </span>
                </span>
                {!n.readAt && (
                  <span
                    className="size-2.5 shrink-0 rounded-full bg-status-overdue"
                    aria-label="neu"
                  />
                )}
              </>
            );
            const cls = `flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${n.readAt ? "border-black/5 bg-white/40" : "border-white/80 bg-white/80 font-medium shadow-glass"}`;
            return (
              <li key={n.id}>
                {v.href ? (
                  <Link href={v.href} className={cls}>
                    {body}
                  </Link>
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
