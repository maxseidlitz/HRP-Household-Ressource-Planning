/** Mitteilungsarten der Mitteilungszentrale (Spez. 8). */
export type NotificationPayloads = {
  commitment_due: { taskId: string; taskName: string; plannedFor: string };
  commitment_missed: { taskId: string; taskName: string; plannedFor: string };
  task_overdue: { taskId: string; taskName: string };
  daily_summary: { count: number; names: string[] };
  member_joined: { userName: string };
  absence_started: { userName: string; until: string };
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
    default:
      return { icon: "🔔", text: "Neue Mitteilung", href: null };
  }
}
