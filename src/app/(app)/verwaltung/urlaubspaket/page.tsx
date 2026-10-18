import Link from "next/link";
import { requireAdmin } from "@/server/context";
import { linkCandidates, linkedTaskIds } from "@/server/queries/absences";
import { LinkedTasksForm } from "./linked-form";

export default async function VacationBundleSettingsPage() {
  const ctx = await requireAdmin();
  const candidates = linkCandidates(ctx.db, ctx.household.id);
  const selected = linkedTaskIds(ctx.db, ctx.household.id);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/verwaltung" className="text-sm font-semibold text-ink/70">
        ← Admin
      </Link>
      <h1 className="text-2xl font-bold">Urlaubspaket</h1>
      <p className="text-sm text-ink/70">
        Wer vor dem Urlaub „Saugen und Müll rausbringen“ abhakt, setzt diese
        Aufgaben auf grün. Die Erledigungen zählen ohne reguläre Punkte, das
        Paket bringt 4 Punkte. Standard: Restmüll, Biomüll und alle
        Saugen-Aufgaben.
      </p>
      {candidates.length === 0 ? (
        <p className="text-sm">Noch keine Aufgaben angelegt.</p>
      ) : (
        <LinkedTasksForm
          candidates={candidates.map((t) => ({
            id: t.id,
            name: t.name,
            place: `${t.roomName} · ${t.objectName}`,
          }))}
          selected={selected}
        />
      )}
    </div>
  );
}
