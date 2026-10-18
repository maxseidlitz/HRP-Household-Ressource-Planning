import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { Card } from "@/components/ui";
import { requireUser } from "@/server/context";
import { listHouseholdsOf } from "@/server/queries/households";
import { CreateHouseholdForm } from "./create-household-form";

export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  const { db, user } = await requireUser();
  const { neu } = await searchParams;
  const households = listHouseholdsOf(db, user.id);
  if (households.length > 0 && !neu) redirect("/aufgaben");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <Card>
          <h1 className="mb-1 text-2xl font-bold">WG erstellen</h1>
          <p className="mb-6 text-sm text-ink/70">
            Du wirst Admin und kannst danach Räume, Aufgaben und Einladungen
            anlegen.
          </p>
          <CreateHouseholdForm />
        </Card>
        {households.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/15 p-4 text-center text-sm">
            <strong>Du wurdest eingeladen?</strong>
            <br />
            Öffne einfach den Einladungslink oder scanne den QR-Code. Du landest
            dann direkt in der WG.
          </p>
        ) : null}
        {households.length === 0 ? (
          <LogoutButton className="text-center text-sm font-semibold underline" />
        ) : (
          <Link
            href="/aufgaben"
            className="text-center text-sm font-semibold underline"
          >
            Abbrechen
          </Link>
        )}
      </div>
    </main>
  );
}
