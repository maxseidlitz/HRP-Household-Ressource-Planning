import Link from "next/link";
import { relativeTime } from "@/domain/time";
import { requireAdmin } from "@/server/context";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUS,
  listFeedback,
  type FeedbackStatus,
} from "@/server/queries/feedback";

export default async function FeedbackAdminPage({
  searchParams,
}: PageProps<"/verwaltung/feedback">) {
  const ctx = await requireAdmin();
  const { status } = await searchParams;
  const filter =
    typeof status === "string" && status in FEEDBACK_STATUS
      ? (status as FeedbackStatus)
      : null;
  const all = listFeedback(ctx.db, { householdId: ctx.household.id });
  const tickets = filter ? all.filter((t) => t.ticket.status === filter) : all;
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/verwaltung" className="text-sm font-semibold text-ink/70">
        ← Admin
      </Link>
      <h1 className="text-2xl font-bold">Feedback</h1>
      <nav aria-label="Nach Status filtern" className="flex flex-wrap gap-1.5">
        {[null, ...Object.keys(FEEDBACK_STATUS)].map((s) => {
          const count = s
            ? all.filter((t) => t.ticket.status === s).length
            : all.length;
          const active = s === filter;
          return (
            <Link
              key={s ?? "alle"}
              href={
                s ? `/verwaltung/feedback?status=${s}` : "/verwaltung/feedback"
              }
              aria-current={active ? "page" : undefined}
              className={`rounded-full border border-black/5 px-3.5 py-1.5 text-sm font-medium shadow-[0_1px_2px_rgb(0_0_0/0.04)] ${active ? "bg-ink text-white" : "bg-white"}`}
            >
              {s ? FEEDBACK_STATUS[s as FeedbackStatus] : "Alle"} ({count})
            </Link>
          );
        })}
      </nav>
      {tickets.length === 0 ? (
        <p className="text-sm text-ink/70">Keine Tickets.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tickets.map(({ ticket: t, userName }) => (
            <li key={t.id}>
              <Link
                href={`/verwaltung/feedback/${t.id}`}
                className="block rounded-2xl glass p-3"
              >
                <span className="flex justify-between gap-2 text-xs text-ink/60">
                  <span>
                    {FEEDBACK_CATEGORIES[t.category]} · {userName} ·{" "}
                    {relativeTime(t.createdAt, now)}
                  </span>
                  <span
                    className={`font-bold ${t.status === "new" ? "text-status-overdue" : ""}`}
                  >
                    {FEEDBACK_STATUS[t.status]}
                  </span>
                </span>
                <span className="mt-1 line-clamp-2 block text-sm">
                  {t.screenshotPath && "📎 "}
                  {t.text}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
