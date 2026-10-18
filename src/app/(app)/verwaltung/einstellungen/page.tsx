import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { setObjectionsEnabledAction } from "@/server/actions/admin";
import { requireAdmin } from "@/server/context";
import { objectionVoteState } from "@/server/queries/settings";
import { ThresholdsForm } from "./settings-form";

export default async function SettingsPage() {
  const ctx = await requireAdmin();
  const s = ctx.household.settings;
  const vote = objectionVoteState(ctx.db, {
    householdId: ctx.household.id,
    viewerId: ctx.user.id,
  });

  return (
    <div className="flex flex-col gap-4">
      <Link href="/verwaltung" className="text-sm font-semibold text-ink/70">
        ← Admin
      </Link>
      <h1 className="text-2xl font-bold">Einstellungen</h1>

      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">Punkte & Fälligkeit</h2>
        <p className="text-sm text-ink/70">
          Gilt für alle Aufgaben ohne eigene Werte. Fortschritt 100 % heißt: das
          Intervall ist genau um.
        </p>
        <ThresholdsForm settings={s} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">Widerspruch</h2>
        <p className="text-sm" data-testid="objection-status">
          {s.objectionsEnabled
            ? s.objectionsEnabledBy === "admin"
              ? "An – vom Admin aktiviert."
              : "An – alle haben zugestimmt."
            : `Aus. ${vote.open ? `${vote.yes} von ${vote.total} haben zugestimmt.` : "Die Abstimmung startet, sobald alle eingezogen sind."}`}
        </p>
        <form action={setObjectionsEnabledAction}>
          <input
            type="hidden"
            name="enabled"
            value={String(!s.objectionsEnabled)}
          />
          <Button variant="secondary" className="w-full">
            {s.objectionsEnabled
              ? "Widerspruch ausschalten"
              : "Widerspruch jetzt einschalten"}
          </Button>
        </form>
        {!s.objectionsEnabled && (
          <p className="text-xs text-ink/60">
            Einschalten geht auch ohne Abstimmung, alle bekommen dann eine
            Mitteilung.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="font-bold">Daten</h2>
        <a
          href="/api/export"
          className="rounded-full glass px-3 py-2 text-center font-semibold"
          download
        >
          Export als JSON
        </a>
        <p className="text-xs text-ink/60">
          Ohne private Zimmer. Zusätzlich legt die App täglich ein Backup der
          Datenbank im Datenordner an (14 Tage).
        </p>
      </Card>

      <nav
        aria-label="Weitere Einstellungen"
        className="flex flex-col gap-2 text-sm"
      >
        <Link href="/verwaltung/urlaubspaket" className="underline">
          Urlaubspaket: verknüpfte Aufgaben
        </Link>
        <Link href="/verwaltung/einladungen" className="underline">
          Einladungen verwalten
        </Link>
        <Link href="/verwaltung/mitglieder" className="underline">
          Mitglieder, Admin-Rechte, Passwort-Reset
        </Link>
      </nav>
    </div>
  );
}
