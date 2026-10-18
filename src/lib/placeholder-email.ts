/**
 * Better Auth verlangt eine E-Mail-Adresse. Wer sich nur mit Benutzernamen
 * registriert, bekommt eine nicht zustellbare Platzhalter-Adresse.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "users.wg.invalid";

export function placeholderEmail(username: string): string {
  return `${username.toLowerCase()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}
