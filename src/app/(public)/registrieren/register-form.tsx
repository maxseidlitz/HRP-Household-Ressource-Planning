"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { placeholderEmail } from "@/lib/placeholder-email";

const ERRORS: Record<string, string> = {
  USERNAME_IS_ALREADY_TAKEN: "Dieser Benutzername ist schon vergeben.",
  USERNAME_IS_ALREADY_TAKEN_PLEASE_TRY_ANOTHER:
    "Dieser Benutzername ist schon vergeben.",
  USER_ALREADY_EXISTS: "Diese E-Mail-Adresse ist schon registriert.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "Diese E-Mail-Adresse ist schon registriert.",
  INVALID_USERNAME:
    "Benutzername: nur Buchstaben, Ziffern, _ und . erlaubt (3–30 Zeichen).",
  USERNAME_TOO_SHORT: "Der Benutzername ist zu kurz (mind. 3 Zeichen).",
  PASSWORD_TOO_SHORT: "Das Passwort muss mindestens 8 Zeichen haben.",
};

export function RegisterForm({
  next = "/",
  onRegistered,
  submitLabel = "Account anlegen",
}: {
  next?: string;
  /** Statt Weiterleitung, z. B. um direkt einer WG beizutreten. */
  onRegistered?: () => Promise<void> | void;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name")).trim();
    const username = String(form.get("username")).trim();
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name,
      username,
      email: email || placeholderEmail(username),
      password,
    });
    if (error) {
      setPending(false);
      setError(
        (error.code && ERRORS[error.code]) ??
          "Registrierung fehlgeschlagen. Bitte prüfe deine Eingaben.",
      );
      return;
    }
    if (onRegistered) {
      await onRegistered();
      setPending(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Name" name="name" autoComplete="nickname" required />
      <Field
        label="Benutzername"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        minLength={3}
        maxLength={30}
        required
      />
      <Field
        label="E-Mail (optional)"
        name="email"
        type="email"
        autoComplete="email"
        hint="Nur zum Anmelden. Im Heimnetz verschickt die App keine Mails."
      />
      <Field
        label="Passwort"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {error && (
        <p role="alert" className="text-sm font-medium text-status-overdue">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Anlegen …" : submitLabel}
      </Button>
    </form>
  );
}
