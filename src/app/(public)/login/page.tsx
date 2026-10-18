import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, reset } = await searchParams;
  const target = safeNext(next);
  if (await getSession()) redirect(target);
  return (
    <Card>
      <h1 className="mb-1 text-2xl font-bold">Willkommen zurück</h1>
      <p className="mb-6 text-sm text-ink/70">Melde dich bei deiner WG an.</p>
      {reset && (
        <p role="status" className="mb-4 rounded-lg bg-sage/30 p-2 text-sm">
          Passwort geändert. Melde dich mit dem neuen Passwort an.
        </p>
      )}
      <LoginForm next={target} />
      <p className="mt-6 text-center text-sm">
        Noch kein Account?{" "}
        <Link
          href={
            target === "/"
              ? "/registrieren"
              : `/registrieren?next=${encodeURIComponent(target)}`
          }
          className="font-semibold underline"
        >
          Registrieren
        </Link>
      </p>
    </Card>
  );
}
