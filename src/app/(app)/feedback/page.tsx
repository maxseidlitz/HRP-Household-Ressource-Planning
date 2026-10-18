import { Card } from "@/components/ui";
import { formatDateTime } from "@/domain/time";
import { requireHousehold } from "@/server/context";
import { track } from "@/server/queries/analytics";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUS,
  listFeedback,
} from "@/server/queries/feedback";
import { FeedbackForm } from "./feedback-form";

export default async function FeedbackPage({
  searchParams,
}: PageProps<"/feedback">) {
  const ctx = await requireHousehold();
  const { von } = await searchParams;
  const screen = typeof von === "string" && von.startsWith("/") ? von : "";
  const mine = listFeedback(ctx.db, {
    householdId: ctx.household.id,
    userId: ctx.user.id,
  });
  track(ctx.db, {
    name: "screen_view",
    screen: "feedback",
    householdId: ctx.household.id,
    userId: ctx.user.id,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Feedback</h1>
      <Card>
        <FeedbackForm screen={screen} />
      </Card>
      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Dein Feedback</h2>
          <ul className="flex flex-col gap-2">
            {mine.map(({ ticket: t }) => (
              <li
                key={t.id}
                className="rounded-xl bg-white/60 px-3 py-2 text-sm"
                data-testid="my-ticket"
              >
                <div className="flex justify-between gap-2 text-xs text-ink/60">
                  <span>
                    {FEEDBACK_CATEGORIES[t.category]} ·{" "}
                    {formatDateTime(t.createdAt, ctx.household.timezone)}
                  </span>
                  <span className="font-semibold">
                    {FEEDBACK_STATUS[t.status]}
                  </span>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap">
                  {t.text}
                </p>
                {t.adminReply && (
                  <p className="mt-2 rounded-lg bg-sage/30 px-2 py-1.5">
                    <strong>Antwort:</strong> {t.adminReply}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
