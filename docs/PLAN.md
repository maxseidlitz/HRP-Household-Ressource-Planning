# Umsetzungsplan

Grundlage: [`SPEC.md`](./SPEC.md) v0.2.

## Architekturentscheidungen

- **Status wird berechnet, nicht gespeichert.** Startpunkt = neueste gültige
  Erledigung bzw. `task.baseline_at`. Widerspruch, Urlaubspaket und
  Reaktivierung funktionieren dadurch ohne Sonderfälle.
- **Fachlogik als reines TypeScript-Modul** (`src/domain/`, ohne DB und React):
  Fortschritt, Status, Farbe, Punkte, Rangliste, Widerspruchsauswertung.
  Vollständig per Vitest abgedeckt; Server, 2D-Plan und Diorama nutzen dieselben
  Funktionen.
- **Ein globales Rasterkoordinatensystem** für Editor, SVG-Draufsicht und
  Isometrie. Die Isometrie ist nur eine andere Projektion.
- **Sichtbarkeit privater Zimmer im Data-Access-Layer**, nicht in der UI: jede
  Abfrage von Objekten/Aufgaben/Historie filtert nach
  `room.private_owner_id IS NULL OR = aktueller Nutzer`.
- **Analytics-Events ab Phase 1** mitschreiben, damit das Dashboard (Phase 4)
  sofort Historie hat.
- **Keine Cache Components:** Bei WG-Größe ist alles request-basiert schnell
  genug, das Modell bleibt einfach.

## Verzeichnisstruktur

```
src/
  app/(public)/        login, registrieren, invite/[token], reset/[token]
  app/(app)/           wohnung, aufgaben, rangliste, profil, admin/…
  app/setup/           Onboarding-Wizard
  app/api/             auth, health, poll, ics, export
  domain/              reine Fachlogik + Tests
  db/                  schema.ts, client.ts, seed/ (Objektbibliothek, Vorschläge)
  server/              actions/, queries/ (Data-Access-Layer), jobs/
  components/          ui/, plan2d/, iso/
drizzle/               SQL-Migrationen
e2e/                   Playwright
docker/                Entrypoint
```

## Phasen

| Phase                       | Inhalt                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Fertig, wenn …                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **0 – Grundgerüst** ✅      | Next.js-Setup, Lint/Format/Typecheck, Drizzle-Schema für das gesamte Datenmodell + Migration, Better Auth (Benutzername oder E-Mail, http-tauglich), Login/Registrierung, Health-Endpoint, Manifest, Dockerfile + compose, CI inkl. E2E und Image-Build                                                                                                                                                                                                               | Login über `http://<ip>:3000` funktioniert auf iPhone und Android; Container-Neustart verliert keine Daten |
| **1a – Aufgaben ohne Plan** | Fachlogik + Tests; WG anlegen; WG-Wechsler; Einladung (Link + QR, Ablauf, Einmal/Mehrfach, Widerruf, Clipboard-Fallback); einfache Avatar-Auswahl; Räume/Objekte/Aufgaben per Formular inkl. Vorschlagsliste und „Zuletzt gemacht?“; Erledigen (Mindestfortschritt, Idempotenz), Historie, Punkte; Aufgabenliste nach Dringlichkeit; Rangliste Monat/Gesamt; Admins verwalten (Ersteller-Schutz), Passwort-Reset-Link; Scheduler + tägliches Backup; Analytics-Events | Die WG nutzt die App eine Woche produktiv                                                                  |
| **1b – Wohnungsplan 2D**    | Raster-Editor (Rechtecke, L-Formen, Raumtypen, Türen); private Zimmer zuweisen, vom Besitzer einrichten/erweitern, für andere ausgegraut; Objekte platzieren, drehen, gruppieren; SVG-Draufsicht mit Statusfarben als Startseite; Objekt-Detail-Sheet; „Als Nächstes“                                                                                                                                                                                                 | Eigener Grundriss nachgebaut; Tippen auf ein Objekt öffnet seine Aufgaben                                  |
| **2 – Spiel-Look**          | PixiJS-Isometrie (Cutaway, Zoom/Pan, Doppeltipp), prozedurale Voxel-Möbel, Bodentexturen, Aura/Pulsieren, Schmutz-Effekte, Sparkles; Avatar-Sprites mit Idle-Wegfindung (A\* auf dem Raster, keine fremden privaten Zimmer) und Putz-Animation; Fallback 2D                                                                                                                                                                                                           | 60 fps auf Mittelklasse-Android                                                                            |
| **3 – Planung & Alltag**    | Einplanen + Wecker-Icon, .ics mit VALARM, Mitteilungszentrale mit Badge + Polling, Scheduler-Jobs (überfällig, verpasst, Sammelmeldung), Urlaub + Urlaubspaket (verknüpfte Aufgaben), Koffer-Avatar                                                                                                                                                                                                                                                                   | .ics landet auf iOS und Android korrekt im Kalender                                                        |
| **4 – Admin**               | Statistik-Dashboard, Feedback-Tickets (Screenshot ≤ 5 MB), Einstellungen, JSON-Export, Widerspruch inkl. Aktivierungs-Abstimmung und Mehrheitsauswertung                                                                                                                                                                                                                                                                                                              | –                                                                                                          |
| **5 – Umzug**               | Domain, HTTPS via Reverse Proxy (Caddy), `APP_PROTOCOL=https`, Service Worker, PWA-Installation, Web Push (VAPID)                                                                                                                                                                                                                                                                                                                                                     | –                                                                                                          |

## Risiken

1. **Phase 2** ist der größte Brocken (Wegfindung, Animationen, Sprites). Darum
   kommt vorher der 2D-Plan, damit die App schon ohne Diorama vollständig ist.
2. **Raum-Editor per Touch** ist fummelig: für Tablet/Laptop optimieren, mobil
   Grundfunktionen.
3. **Private Zimmer** sind ein Datenschutzversprechen: Tests, die sicherstellen,
   dass Admins und andere Mitglieder über keine Route Inhalte sehen.
