import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { formatDateTime } from "@/domain/time";
import { requireAdmin } from "@/server/context";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUS,
  getFeedback,
  type FeedbackContext,
} from "@/server/queries/feedback";
import { TicketForm } from "./ticket-form";

export default async function TicketPage({
  params,
}: PageProps<"/verwaltung/feedback/[ticketId]">) {
  const { ticketId } = await params;
  const ctx = await requireAdmin();
  const found = getFeedback(ctx.db, {
    householdId: ctx.household.id,
    ticketId,
  });
  if (!found) notFound();
  const { ticket: t, userName } = found;
  let context: FeedbackContext = {};
  try {
    context = JSON.parse(t.contextJson) as FeedbackContext;
  } catch {
    context = {};
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/verwaltung/feedback"
        className="text-sm font-semibold text-ink/70"
      >
        ← Feedback
      </Link>
      <h1 className="text-2xl font-bold">
        {FEEDBACK_CATEGORIES[t.category]} von {userName}
      </h1>
      <Card className="flex flex-col gap-3">
        <p className="whitespace-pre-wrap">{t.text}</p>
        {t.screenshotPath && (
          <a href={`/api/feedback/${t.id}/screenshot`} target="_blank">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/feedback/${t.id}/screenshot`}
              alt="Screenshot zum Feedback"
              className="max-h-96 rounded-xl border-2 border-ink object-contain"
            />
          </a>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-ink/70">
          <dt>Zeitpunkt</dt>
          <dd>{formatDateTime(t.createdAt, ctx.household.timezone)}</dd>
          <dt>Seite</dt>
          <dd>{context.screen ?? "–"}</dd>
          <dt>Bildschirm</dt>
          <dd>{context.viewport ?? "–"}</dd>
          <dt>Gerät</dt>
          <dd className="break-all">{context.userAgent ?? "–"}</dd>
        </dl>
      </Card>
      <Card>
        <TicketForm
          ticketId={t.id}
          status={t.status}
          adminNote={t.adminNote ?? ""}
          adminReply={t.adminReply ?? ""}
          statuses={Object.entries(FEEDBACK_STATUS)}
        />
      </Card>
    </div>
  );
}
