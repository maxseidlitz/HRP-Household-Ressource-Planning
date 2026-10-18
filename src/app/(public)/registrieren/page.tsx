import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  if (await getSession()) redirect("/");
  return (
    <Card>
      <h1 className="mb-1 text-2xl font-bold">Account anlegen</h1>
      <p className="mb-6 text-sm text-ink/70">
        Danach kannst du eine WG erstellen oder per Einladungslink beitreten.
      </p>
      <RegisterForm />
      <p className="mt-6 text-center text-sm">
        Schon registriert?{" "}
        <Link href="/login" className="font-semibold underline">
          Anmelden
        </Link>
      </p>
    </Card>
  );
}
