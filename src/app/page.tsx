import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-bold">Hallo {session.user.name}!</h1>
        <p className="mb-6 text-sm text-ink/70">
          Du bist angemeldet. WG anlegen, Einladungen und Aufgaben folgen in
          Phase 1.
        </p>
        <LogoutButton />
      </Card>
    </main>
  );
}
