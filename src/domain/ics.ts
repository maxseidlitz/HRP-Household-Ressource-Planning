/**
 * Minimaler iCalendar-Export (RFC 5545) für eingeplante Aufgaben
 * (Spez. 5.6). Funktioniert ohne Domain: iOS und Android öffnen die Datei
 * direkt im Kalender.
 */
export type IcsEvent = {
  uid: string;
  title: string;
  description?: string;
  start: Date;
  durationMinutes: number;
  /** Erinnerung vorher, z. B. 120 Minuten. 0 = ohne Erinnerung. */
  alarmMinutes: number;
  url?: string;
  now: Date;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function icsDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Text escapen: Backslash, Komma, Semikolon, Zeilenumbruch. */
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Zeilen über 75 Oktette falten (Fortsetzung beginnt mit Leerzeichen). */
export function foldLine(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (bytes.encode(current + ch).length > limit) {
      out.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(e: IcsEvent): string {
  const end = new Date(e.start.getTime() + e.durationMinutes * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HRP//WG-App//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsDate(e.now)}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  if (e.alarmMinutes > 0) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(e.title)}`,
      `TRIGGER:-PT${Math.round(e.alarmMinutes)}M`,
      "END:VALARM",
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
