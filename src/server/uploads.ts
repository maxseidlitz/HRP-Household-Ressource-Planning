import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { DomainError } from "./errors";

export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

const TYPES = [
  { mime: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", ext: "gif", magic: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", ext: "webp", magic: [0x52, 0x49, 0x46, 0x46] },
] as const;

/** Bildtyp anhand der ersten Bytes, nicht anhand der Dateiendung. */
export function detectImage(bytes: Uint8Array) {
  const type = TYPES.find((t) => t.magic.every((b, i) => bytes[i] === b));
  // RIFF ist ein Container; WebP steht in Byte 8–11.
  if (type?.ext === "webp") {
    const tag = String.fromCharCode(...bytes.slice(8, 12));
    if (tag !== "WEBP") return null;
  }
  return type ?? null;
}

export type Screenshot = { bytes: Uint8Array; ext: string };

/** Prüft Größe und Bildtyp, ohne etwas zu speichern. */
export async function readScreenshot(
  file: FormDataEntryValue | null,
): Promise<Screenshot | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_SCREENSHOT_BYTES)
    throw new DomainError("Der Screenshot darf höchstens 5 MB groß sein.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImage(bytes);
  if (!type) throw new DomainError("Bitte ein Bild (PNG, JPG, GIF, WebP).");
  return { bytes, ext: type.ext };
}

/** Speichert unter DATA_DIR/uploads/feedback, Pfad relativ zum Datenordner. */
export function screenshotPath(id: string, shot: Screenshot) {
  return path.join("uploads", "feedback", `${id}.${shot.ext}`);
}

export function writeUpload(rel: string, bytes: Uint8Array) {
  const full = path.join(env.DATA_DIR, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, bytes);
}

export function readUpload(rel: string) {
  // Nur Pfade unterhalb von uploads/ zulassen
  const full = path.resolve(env.DATA_DIR, rel);
  const root = path.resolve(env.DATA_DIR, "uploads") + path.sep;
  if (!full.startsWith(root)) return null;
  try {
    const bytes = readFileSync(full);
    const type = detectImage(bytes);
    return type ? { bytes, mime: type.mime } : null;
  } catch {
    return null;
  }
}
