import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <Card>
      <h1 className="mb-1 text-2xl font-bold">Willkommen zurück</h1>
      <p className="mb-6 text-sm text-ink/70">Melde dich bei deiner WG an.</p>
      <LoginForm />
      <p className="mt-6 text-center text-sm">
        Noch kein Account?{" "}
        <Link href="/registrieren" className="font-semibold underline">
          Registrieren
        </Link>
      </p>
    </Card>
  );
}
