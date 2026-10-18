import { DomainError } from "../errors";

export type FormState<T = unknown> =
  | { ok: true; data?: T; error?: undefined }
  | { ok: false; error: string }
  | null;

/** Führt eine Aktion aus und übersetzt fachliche Fehler in eine Meldung. */
export async function handle<T>(
  fn: () => Promise<T> | T,
): Promise<FormState<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    // redirect()/notFound() von Next durchreichen
    throw e;
  }
}

export function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

export function num(form: FormData, key: string, fallback?: number): number {
  const raw = str(form, key).replace(",", ".");
  const n = raw === "" ? NaN : Number(raw);
  if (Number.isFinite(n)) return n;
  if (fallback !== undefined) return fallback;
  throw new DomainError(`Bitte eine Zahl für „${key}“ angeben.`);
}
