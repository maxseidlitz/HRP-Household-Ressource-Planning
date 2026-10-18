/** Mitteilungsarten der Mitteilungszentrale (Spez. 8). */
export type NotificationPayloads = {
  commitment_due: { taskId: string; taskName: string; plannedFor: string };
  commitment_missed: { taskId: string; taskName: string; plannedFor: string };
  task_overdue: { taskId: string; taskName: string };
  daily_summary: { count: number; names: string[] };
  member_joined: { userName: string };
  absence_started: { userName: string; until: string };
  objection_filed: { objectionId: string; taskName: string; userName: string };
  objection_vote: {
    objectionId: string;
    taskName: string;
    completerName: string;
  };
  objection_resolved: {
    objectionId: string;
    taskName: string;
    resolution: "valid" | "revoked";
  };
  objections_enabled: { by: "vote" | "admin"; userName?: string };
  feature_vote_request: { feature: "objections" };
  feedback_reply: { ticketId: string; reply: string };
};

export type NotificationType = keyof NotificationPayloads;

export type NotificationView = {
  icon: string;
  text: string;
  href: string | null;
};

const MAX_NAMES = 3;

export function describeNotification(
  type: string,
  payloadJson: string,
): NotificationView {
  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    p = {};
  }
  const task = p.taskId ? `/aufgaben/${String(p.taskId)}` : null;
  switch (type as NotificationType) {
    case "commitment_due":
      return {
        icon: "⏰",
        text: `Heute eingeplant: ${p.taskName}`,
        href: task,
      };
    case "commitment_missed":
      return {
        icon: "⌛",
        text: `Eingeplant, aber nicht erledigt: ${p.taskName}. Neu einplanen?`,
        href: task,
      };
    case "task_overdue":
      return {
        icon: "🔴",
        text: `Überfällig: ${p.taskName} (von dir eingeplant)`,
        href: task,
      };
    case "daily_summary": {
      const names = (p.names as string[] | undefined) ?? [];
      const count = Number(p.count ?? names.length);
      const list = names.slice(0, MAX_NAMES).join(", ");
      const more = count > MAX_NAMES ? ` und ${count - MAX_NAMES} weitere` : "";
      return {
        icon: "📋",
        text: `${count} ${count === 1 ? "Aufgabe ist" : "Aufgaben sind"} überfällig: ${list}${more}`,
        href: "/aufgaben",
      };
    }
    case "member_joined":
      return {
        icon: "👋",
        text: `${p.userName} ist der WG beigetreten.`,
        href: "/rangliste",
      };
    case "absence_started":
      return {
        icon: "🧳",
        text: `${p.userName} ist ab heute im Urlaub (bis ${p.until}).`,
        href: null,
      };
    case "objection_filed":
      return {
        icon: "✋",
        text: `${p.userName} sagt, „${p.taskName}“ wurde nicht erledigt. Die WG stimmt ab.`,
        href: `/widerspruch/${String(p.objectionId)}`,
      };
    case "objection_vote":
      return {
        icon: "🗳️",
        text: `Abstimmung: Hat ${p.completerName} „${p.taskName}“ wirklich erledigt?`,
        href: `/widerspruch/${String(p.objectionId)}`,
      };
    case "objection_resolved":
      return {
        icon: p.resolution === "revoked" ? "↩️" : "✅",
        text:
          p.resolution === "revoked"
            ? `Widerspruch angenommen: „${p.taskName}“ gilt als nicht erledigt.`
            : `Widerspruch abgelehnt: „${p.taskName}“ bleibt erledigt.`,
        href: `/widerspruch/${String(p.objectionId)}`,
      };
    case "objections_enabled":
      return {
        icon: "⚖️",
        text:
          p.by === "admin"
            ? `${p.userName ?? "Ein Admin"} hat die Widerspruchsfunktion eingeschaltet.`
            : "Alle haben zugestimmt: Erledigungen können jetzt angefochten werden.",
        href: null,
      };
    case "feature_vote_request":
      return {
        icon: "🗳️",
        text: "Sollen Erledigungen angefochten werden können? Stimm ab!",
        href: "/aufgaben",
      };
    case "feedback_reply":
      return {
        icon: "💬",
        text: `Antwort auf dein Feedback: ${String(p.reply).slice(0, 120)}`,
        href: "/feedback",
      };
    default:
      return { icon: "🔔", text: "Neue Mitteilung", href: null };
  }
}
