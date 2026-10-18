import { requireHousehold } from "@/server/context";
import { getFeedback } from "@/server/queries/feedback";
import { readUpload } from "@/server/uploads";

/** Screenshot eines Tickets: nur für Admins und den Absender. */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/feedback/[ticketId]/screenshot">,
) {
  const { ticketId } = await params;
  const ctx = await requireHousehold();
  const found = getFeedback(ctx.db, {
    householdId: ctx.household.id,
    ticketId,
  });
  const allowed = found && (ctx.isAdmin || found.ticket.userId === ctx.user.id);
  const file =
    allowed && found.ticket.screenshotPath
      ? readUpload(found.ticket.screenshotPath)
      : null;
  if (!file) return new Response("Nicht gefunden", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
