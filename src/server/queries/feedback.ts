import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { feedbackTicket, user } from "@/db/schema";
import { assert } from "../errors";
import { getMembership } from "./households";
import { notify } from "./notifications";

export const FEEDBACK_CATEGORIES = {
  bug: "Bug",
  idea: "Idee",
  other: "Sonstiges",
} as const;
export type FeedbackCategory = keyof typeof FEEDBACK_CATEGORIES;

export const FEEDBACK_STATUS = {
  new: "Neu",
  in_progress: "In Arbeit",
  done: "Erledigt",
  rejected: "Verworfen",
} as const;
export type FeedbackStatus = keyof typeof FEEDBACK_STATUS;

export type FeedbackContext = {
  screen?: string;
  userAgent?: string;
  viewport?: string;
};

/** Feedback senden (Spez. 9.2). */
export function createFeedback(
  db: DB,
  input: {
    id?: string;
    householdId: string;
    userId: string;
    category: string;
    text: string;
    screenshotPath?: string | null;
    context: FeedbackContext;
    now: Date;
  },
) {
  assert(
    getMembership(db, input.householdId, input.userId),
    "Du bist kein Mitglied dieser WG.",
  );
  assert(input.category in FEEDBACK_CATEGORIES, "Bitte eine Kategorie wählen.");
  const text = input.text.trim();
  assert(text.length >= 3, "Bitte kurz beschreiben, worum es geht.");
  assert(text.length <= 4000, "Bitte höchstens 4000 Zeichen.");
  const [t] = db
    .insert(feedbackTicket)
    .values({
      id: input.id,
      householdId: input.householdId,
      userId: input.userId,
      category: input.category as FeedbackCategory,
      text,
      screenshotPath: input.screenshotPath ?? null,
      contextJson: JSON.stringify(input.context),
      createdAt: input.now,
    })
    .returning()
    .all();
  return t;
}

export function listFeedback(
  db: DB,
  input: { householdId: string; userId?: string },
) {
  return db
    .select({ ticket: feedbackTicket, userName: user.name })
    .from(feedbackTicket)
    .innerJoin(user, eq(user.id, feedbackTicket.userId))
    .where(
      and(
        eq(feedbackTicket.householdId, input.householdId),
        input.userId ? eq(feedbackTicket.userId, input.userId) : undefined,
      ),
    )
    .orderBy(desc(feedbackTicket.createdAt))
    .all();
}

export function getFeedback(
  db: DB,
  input: { householdId: string; ticketId: string },
) {
  return db
    .select({ ticket: feedbackTicket, userName: user.name })
    .from(feedbackTicket)
    .innerJoin(user, eq(user.id, feedbackTicket.userId))
    .where(
      and(
        eq(feedbackTicket.id, input.ticketId),
        eq(feedbackTicket.householdId, input.householdId),
      ),
    )
    .get();
}

/** Admin: Status, interne Notiz, Antwort an den Absender. */
export function updateFeedback(
  db: DB,
  input: {
    householdId: string;
    actorId: string;
    ticketId: string;
    status: string;
    adminNote: string;
    adminReply: string;
    now: Date;
  },
) {
  const m = getMembership(db, input.householdId, input.actorId);
  assert(m?.role === "admin", "Nur Admins dürfen Tickets bearbeiten.");
  const found = getFeedback(db, input);
  assert(found, "Ticket nicht gefunden.");
  assert(input.status in FEEDBACK_STATUS, "Unbekannter Status.");
  const reply = input.adminReply.trim();
  db.transaction((tx) => {
    tx.update(feedbackTicket)
      .set({
        status: input.status as FeedbackStatus,
        adminNote: input.adminNote.trim() || null,
        adminReply: reply || null,
        updatedAt: input.now,
      })
      .where(eq(feedbackTicket.id, input.ticketId))
      .run();
    if (reply && reply !== (found.ticket.adminReply ?? "")) {
      notify(tx, {
        userId: found.ticket.userId,
        householdId: input.householdId,
        type: "feedback_reply",
        payload: { ticketId: input.ticketId, reply },
      });
    }
  });
}
