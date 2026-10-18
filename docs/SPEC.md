# WG-Haushalts-App – Spezifikation v0.2

Stand: 18.10.2026 · Arbeitstitel: **WG-App** · Owner: Max

> **Änderungen gegenüber v0.1:** Punkteformel (überfällig = 3, Mindestfortschritt
> 15 %), einheitlicher Sweet Spot 40–100 %, „Zuletzt gemacht?“ beim Anlegen,
> Neustart bei Reaktivierung, Widerspruch per Mehrheit, Rangliste mit Rohpunkten
> (monatlich + gesamt), private Zimmer, mehrere WGs pro Account, mehrere Admins,
> Admin-Passwort-Reset, Urlaubspaket als eigenes Modell, Technikdetails für den
> Betrieb ohne HTTPS. Alle Punkte aus Kap. 14 (v0.1) sind entschieden.

---

## 1. Ziel & Rahmen

Eine selbst gehostete Web-App, mit der eine WG ihre Haushaltsaufgaben verwaltet.
Kern ist ein **isometrischer, spielartiger Wohnungsplan**: Jedes Objekt (Klo,
Dusche, Herd, Mülleimer …) verfärbt sich je nach Fälligkeit seiner Aufgaben von
grün nach rot. Kleine Sims-artige Avatare der Mitbewohner bewegen sich durch die
Wohnung. Ein Punktesystem mit Rangliste sorgt für Fairness.

| Rahmen              | Entscheidung                                                          |
| ------------------- | --------------------------------------------------------------------- |
| Zielgruppe          | Zunächst Max' eigene WG (1–10+ Personen)                              |
| Hosting             | ZimaBoard (ZimaOS, Docker), nur im Heimnetz erreichbar                |
| Später              | Umzug auf Server mit Domain, HTTPS und Push                           |
| Plattform           | Web-App, mobile-first (iPhone + Android), PWA vorbereitet             |
| Benachrichtigung v1 | In-App-Mitteilungszentrale + Kalender-Download (.ics)                 |
| Benachrichtigung v2 | Web Push (sobald Domain + HTTPS vorhanden)                            |
| Mehrere WGs         | Ein Account kann Mitglied mehrerer WGs sein (siehe 2.2)               |
| Einzelwohnung       | Mit nur einem Mitglied werden Rangliste und Abstimmungen ausgeblendet |

---

## 2. Rollen & Accounts

### 2.1 Rollen (pro WG)

- **Admin:** erstellt Wohnungsplan, Objekte, Aufgaben; lädt ein; verwaltet
  Einstellungen; sieht Statistiken und Feedback-Tickets.
- **Mitglied:** sieht den Plan, erledigt Aufgaben, plant sich ein, trägt Urlaub
  ein, sendet Feedback, richtet sein privates Zimmer ein.
- **Mehrere Admins** sind möglich. Wer die WG erstellt, ist automatisch erster
  Admin und kann von anderen Admins **weder entfernt noch herabgestuft** werden,
  solange er die Rolle nicht selbst abgibt. Es muss immer mindestens ein Admin
  bleiben.
- Statistiken und Ticketsystem sind **ausschließlich für Admins** sichtbar.
- Beim Beitreten wird transparent angezeigt: „Admins sehen anonymisierte
  Nutzungsstatistiken dieser WG.“

### 2.2 Mehrere WGs pro Account

- WG-Wechsler im Menü hinter dem **Profilbild oben rechts**; die zuletzt gewählte
  WG wird gemerkt.
- **Pro WG:** Rolle, Punkte, Rangliste, privates Zimmer, Mitteilungen,
  Einstellungen.
- **Pro Person (WG-übergreifend):** Name, Login, Passwort, Avatar, Urlaub.
- Badge der Glocke zählt die aktuelle WG; ungelesene Mitteilungen anderer WGs
  zeigen einen Punkt am Profilbild.
- Eingeloggt einen Einladungslink öffnen → direkt beitreten, keine neue
  Registrierung.
- Jedes Mitglied kann selbst eine neue WG anlegen und ist dort erster Admin.

### 2.3 Passwort vergessen

Im Heimnetz gibt es keinen Mailversand. Ein Admin erzeugt für ein Mitglied einen
**Reset-Link** (einmalig, 24 h gültig, auch als QR-Code). E-Mail ist bei der
Registrierung optional.

---

## 3. Onboarding-Flow

### 3.1 WG erstellen (Admin)

1. Account anlegen (Name, Benutzername, optional E-Mail, Passwort)
2. WG anlegen (Name, optional Emoji)
3. **Raumplan zeichnen** (4.1), inkl. privater Zimmer und deren Zuweisung
4. **Objekte platzieren** (4.2)
5. **Aufgaben anlegen**: Vorschläge pro Objekt (5.4), je Aufgabe die Frage
   „Zuletzt gemacht: heute / vor ein paar Tagen / weiß nicht“ (5.2)
6. Mitbewohner einladen

### 3.2 Einladen

- Admin erzeugt einen **Einladungslink** (Token, Ablaufdatum einstellbar,
  Standard 7 Tage, Mehrfach- oder Einmal-Link). Links sind widerrufbar.
- Derselbe Link als **QR-Code**.
- Eingeladene Person öffnet Link → Account anlegen (Name, Passwort, Avatar) oder
  mit bestehendem Account einloggen → direkt in der WG.
- Admin legt die **erwartete Mitgliederzahl** fest; sie steuert den
  Abstimmungs-Vorschlag (6.3).
- „Link kopieren“ funktioniert auch über http (Fallback ohne Clipboard-API).

---

## 4. Wohnungsplan

### 4.1 Raum-Editor

- Raster-basiert (1 Kachel ≈ 50 cm), ein gemeinsames globales Raster.
- Räume als Rechtecke aufziehen; L-Formen durch Zusammenfügen.
- Raumtypen: Küche, Bad, WC, Flur, Wohnzimmer, Zimmer, Balkon, Abstellraum,
  Sonstiges.
- Türen auf Wandsegmenten.
- Gemeinschaftsräume bearbeiten nur Admins.

### 4.2 Private Zimmer

- Der Admin zeichnet ein Zimmer im Grundriss und **weist es einem Mitglied zu**.
- Ab dann richtet **nur die Besitzerin/der Besitzer** das Zimmer ein: Objekte,
  Aufgaben, auch eigene **Unterräume** (z. B. eigene Küche oder eigenes Bad).
- Die Besitzerin/der Besitzer darf den Umriss **erweitern**, allerdings nur auf
  Kacheln, die keinem anderen Raum gehören. Der neue Umriss erscheint auch im
  Gesamtplan.
- **Sichtbarkeit:** Für alle anderen, auch für Admins, ist das Zimmer
  **ausgegraut**; sichtbar ist nur der Umriss mit Namensschild. Die Besitzerin/
  der Besitzer sieht alles. Das wird **serverseitig** durchgesetzt: Objekte,
  Aufgaben, Historie und Mitteilungen privater Zimmer verlassen den Server nur
  für die Besitzerin/den Besitzer.
- Aufgaben in privaten Zimmern sind **rein privat**: Sie geben keine Punkte für
  die Rangliste und fließen in **keine Statistik** ein (auch nicht in
  Admin-Statistik, Datenexport oder Feedback-Kontext).
- Avatare anderer Mitglieder betreten private Zimmer nicht; der eigene Avatar ist
  dort für andere nicht sichtbar.
- Zieht ein Mitglied aus, wird der Inhalt gelöscht; der leere Umriss bleibt und
  kann neu zugewiesen werden.

### 4.3 Objekte

- Per Drag & Drop aus einer Bibliothek in Räume, drehbar in 90°-Schritten,
  mit Grundfläche (Breite × Tiefe in Kacheln).
- **Objektgruppen:** z. B. **Einbauküche** = Herd + Ofen + Arbeitsplatte + Spüle +
  Geschirrspüler + Mülleimer. Als ein Möbelblock gerendert; jedes Teil behält
  eigene Aufgaben und Färbung.
- **Boden:** Jeder Raum hat automatisch ein implizites Objekt „Boden“
  (Saugen/Wischen), dargestellt als Bodentönung.
- Jede Aufgabe hängt an genau einem Objekt. Aufgaben ohne festen Ort werden
  einem passenden Objekt zugeordnet (Müll → Mülleimer, Klopapier →
  Vorratsschrank).

**Objektbibliothek v1:**

| Raum      | Objekte                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Küche     | Herd, Ofen, Arbeitsplatte, Spüle, Geschirrspüler, Kühlschrank, Mülleimer (Rest/Bio/Gelb/Papier/Glas), Esstisch, Mikrowelle, Vorratsschrank |
| Bad / WC  | Toilette, Dusche, Badewanne, Waschbecken, Spiegel, Handtuchhalter                                                                          |
| Allgemein | Boden (implizit), Fenster, Pflanze, Sofa, Tisch, Waschmaschine, Wäscheständer, Schuhregal, Briefkasten                                     |

---

## 5. Aufgaben

### 5.1 Felder

| Feld               | Beschreibung                                                 |
| ------------------ | ------------------------------------------------------------ |
| Name               | z. B. „Klo putzen“                                           |
| Objekt             | Pflicht                                                      |
| Intervall          | in Tagen (rollierend)                                        |
| Multiplikator      | Aufwandsgewicht, Standard 1,0 (Admin änderbar)               |
| Sweet-Spot-Fenster | Standard 40 % / 100 %; pro Aufgabe überschreibbar (Admin)    |
| Mindestfortschritt | Standard 15 %; darunter 0 Punkte; pro Aufgabe überschreibbar |
| Aktiv/pausiert     | z. B. saisonal                                               |

### 5.2 Rollierendes Intervall & Startpunkt

`fällig_am = startpunkt + intervall`, wobei `startpunkt` die **letzte gültige
Erledigung** ist, oder, falls es keine spätere gibt, der **Bezugszeitpunkt** der
Aufgabe:

- **Beim Anlegen** fragt die App: „Zuletzt gemacht?“
  - _heute_ → Bezug = jetzt (0 %)
  - _vor ein paar Tagen_ → Bezug so gewählt, dass die Aufgabe bei ~50 % startet
  - _weiß nicht_ → ebenfalls 50 %
    So werden nicht alle Aufgaben am selben Tag rot.
- **Bei Reaktivierung** einer pausierten Aufgabe beginnt die Zählung neu
  (Bezug = Reaktivierungszeitpunkt).
- Der Status wird **immer aus den Erledigungen berechnet**, nicht gespeichert.
  Wird eine Erledigung durch Widerspruch zurückgesetzt, springt die Fälligkeit
  automatisch auf die vorherige gültige Erledigung zurück.

### 5.3 Status & Färbung

`fortschritt = (jetzt − startpunkt) / intervall`

| Fortschritt | Status                  | Farbe                          |
| ----------- | ----------------------- | ------------------------------ |
| 0 – 40 %    | Frisch                  | Grün                           |
| 40 – 75 %   | Sweet Spot              | Gelbgrün → Gelb                |
| 75 – 100 %  | Sweet Spot, bald fällig | Orange (Hinweis „jetzt ideal“) |
| > 100 %     | Überfällig              | Rot, pulsierend                |
| > 150 %     | Stark überfällig        | Rot + Schmutz-Effekte          |

Der **Sweet Spot reicht einheitlich von 40 bis 100 %**, bei Farbe wie Punkten.
Orange ist nur ein optischer Hinweis innerhalb des Sweet Spots. Die Farbe
verläuft stufenlos. Ein Objekt mit mehreren Aufgaben zeigt den **schlechtesten**
Status.

### 5.4 Aufgabenvorschläge (Seed-Daten)

| Objekt             | Aufgabe                     | Intervall | Multiplikator |
| ------------------ | --------------------------- | --------- | ------------- |
| Toilette           | Klo putzen                  | 7 Tage    | 1,5           |
| Dusche             | Dusche putzen               | 7 Tage    | 1,5           |
| Waschbecken        | Waschbecken + Spiegel       | 7 Tage    | 1,0           |
| Boden (Bad)        | Bad wischen                 | 14 Tage   | 1,5           |
| Herd               | Herd reinigen               | 7 Tage    | 1,0           |
| Arbeitsplatte      | Arbeitsplatte abwischen     | 3 Tage    | 0,5           |
| Spüle              | Spüle reinigen              | 7 Tage    | 0,5           |
| Geschirrspüler     | Ausräumen                   | 2 Tage    | 0,5           |
| Kühlschrank        | Kühlschrank auswischen      | 30 Tage   | 2,0           |
| Ofen               | Ofen reinigen               | 60 Tage   | 2,0           |
| Mülleimer Rest     | Restmüll rausbringen        | 3 Tage    | 0,5           |
| Mülleimer Bio      | Biomüll rausbringen         | 3 Tage    | 0,5           |
| Gelber Sack        | Gelben Sack rausbringen     | 7 Tage    | 0,5           |
| Papier             | Altpapier wegbringen        | 14 Tage   | 0,5           |
| Glas               | Altglas wegbringen          | 30 Tage   | 1,0           |
| Boden (Flur/Küche) | Saugen                      | 7 Tage    | 1,0           |
| Pflanze            | Gießen                      | 4 Tage    | 0,5           |
| Vorratsschrank     | Klopapier/Spülmittel prüfen | 7 Tage    | 0,5           |

### 5.5 Erledigen

- Tap auf Objekt → Liste seiner Aufgaben → „Erledigt“.
- Bestätigung mit Animation (Avatar geht zum Objekt, Putz-Animation, Objekt wird
  grün, Punkte fliegen hoch).
- Liegt der Fortschritt unter dem Mindestfortschritt, wird die Erledigung
  gespeichert (das Objekt wird grün), bringt aber **0 Punkte**; Hinweis „wurde
  gerade erst erledigt“.
- Doppelte Taps/Formularsendungen werden serverseitig erkannt (Idempotenz).
- **Historie pro Aufgabe:** wer wann erledigt hat (letzte 10 Einträge, mit
  Avatar).

### 5.6 Einplanen („Ich mach das“)

- Auf jeder Aufgabe: „Einplanen“ → Datum wählen. Pro Aufgabe gibt es höchstens
  eine offene Einplanung.
- Am Objekt erscheint ein **Wecker-Icon mit Datum und Avatar**.
- Optional **.ics-Datei** (VALARM, Standard 2 h vorher, einstellbar).
- Andere sehen, dass die Aufgabe vergeben ist; jeder darf trotzdem erledigen
  (die Einplanung gilt dann als erfüllt).
- Geplantes Datum verstrichen und nicht erledigt → Hinweis an die Person.

---

## 6. Punktesystem & Fairness

### 6.1 Formel

`punkte = basis(phase) × multiplikator` (gerundet auf 0,5)

| Phase (Fortschritt)                  | Basis |
| ------------------------------------ | ----- |
| < Mindestfortschritt (Standard 15 %) | 0     |
| bis 40 % (zu früh)                   | 2     |
| 40 – 100 % (Sweet Spot)              | 3     |
| > 100 % (überfällig)                 | 3     |

Überfällige Aufgaben bringen bewusst volle Punkte, damit gerade die dreckigsten
Aufgaben attraktiv bleiben. Alle Schwellen sind global einstellbar und pro
Aufgabe überschreibbar (Admin). Aufgaben in privaten Zimmern geben keine Punkte.

### 6.2 Rangliste

- Sichtbare Rangliste aller Mitglieder, angezeigt werden **Rohpunkte**.
- **Standardansicht: aktueller Monat.** Die Monatswertung beginnt am 1. jedes
  Monats bei 0 (Zeitzone der WG).
- Umschalter auf **Gesamt seit Tag 1**.
- Kein automatisches Zuweisen von Aufgaben.

### 6.3 Widerspruch (optional)

**Aktivierung**

- Standardmäßig aus.
- Sobald alle erwarteten Mitglieder beigetreten sind, erhält jeder ein dezentes
  Pop-up: „Sollen Erledigungen angefochten werden können?“ Aktivierung nur, wenn
  **alle zustimmen**; angezeigt wird „x von y haben zugestimmt“.
- Zusätzlich darf ein **Admin die Funktion allein einschalten**. Alle Mitglieder
  erhalten dann eine Mitteilung; in den Einstellungen steht „vom Admin
  aktiviert“.

**Ablauf**

- In der Historie einer Erledigung: „…“-Menü → „Nicht erledigt“. Frist: 24 h
  nach der Erledigung.
- Die Punkte werden eingefroren (Status „angefochten“); die erledigende Person
  wird benachrichtigt, alle Stimmberechtigten erhalten eine Abstimmung.
- **Stimmberechtigt:** alle Mitglieder außer der erledigenden Person, die zum
  Zeitpunkt des Widerspruchs nicht im Urlaub sind. Der Widerspruch zählt als
  erste Stimme „nicht erledigt“.
- **Nach 24 h** zählen nur abgegebene Stimmen; wer nicht abgestimmt hat, fällt
  aus der Wertung. Es entscheidet die einfache Mehrheit.
- **Gleichstand** → die Erledigung bleibt gültig.
- **Vorzeitiges Ende**, sobald eine Seite die Mehrheit aller Stimmberechtigten
  erreicht hat.
- Ergebnis „nicht erledigt“ → Erledigung wird zurückgesetzt, Punkte entfallen,
  die Fälligkeit springt zurück (5.2).

**Beispiele**

| Situation                                                          | Ergebnis                      |
| ------------------------------------------------------------------ | ----------------------------- |
| 3er-WG: A erledigt, B widerspricht, C stimmt nicht ab              | 1:0 → zurückgesetzt           |
| 4er-WG: A erledigt, B widerspricht, C bestätigt, D stimmt nicht ab | 1:1 → bleibt gültig           |
| 2er-WG: A erledigt, B widerspricht                                 | 1:0 → zurückgesetzt (gewollt) |

---

## 7. Urlaub / Abwesenheit

- Mitglied trägt Zeitraum ein (von – bis). Urlaub gilt für **alle WGs** der
  Person.
- Während der Abwesenheit: Avatar ausgegraut / „mit Koffer“, keine Erinnerungen,
  nicht stimmberechtigt bei Widersprüchen.
- **Urlaubsvorbereitung** wird automatisch als Paket für die Person erstellt
  (fällig bis Urlaubsbeginn):

| Aufgabe                                       | Punkte |
| --------------------------------------------- | ------ |
| Eigene Sachen im Kühlschrank prüfen           | 1      |
| Saugen **und** Müll rausbringen (Kombination) | +4     |
| **Gesamt**                                    | **5**  |

- Welche regulären Aufgaben „Saugen + Müll“ zurücksetzt, legt der Admin einmal
  fest (Standard: Restmüll, Biomüll und alle „Saugen“-Aufgaben).
- Diese regulären Aufgaben werden auf grün gesetzt; die Erledigungen werden mit
  Quelle „Urlaub“ und **0 regulären Punkten** gespeichert (keine Doppelzählung,
  Historie bleibt korrekt).

---

## 8. Mitteilungszentrale (v1)

Glocken-Icon mit Badge (pro WG, siehe 2.2). Ereignisse:

- Aufgabe überfällig: an die Person, die sie **eingeplant** hat, plus eine
  **tägliche Sammelmeldung an alle**
- Eingeplante Aufgabe heute fällig / verpasst
- Neues Mitglied beigetreten
- Widerspruch gegen eigene Erledigung; Abstimmung über einen Widerspruch
- Abstimmung Widerspruchsfunktion / vom Admin aktiviert
- Urlaub eines Mitglieds beginnt
- Antwort auf eigenes Feedback-Ticket

Aufgaben in privaten Zimmern erzeugen Mitteilungen nur für die Besitzerin/den
Besitzer. Aktualisierung per Polling (30 s), solange die App offen ist.
**v2:** Web Push über dieselbe Ereignisquelle.

---

## 9. Admin-Bereich (nur Admins)

### 9.1 Statistiken

- Aktive Nutzer pro Tag/Woche; Sitzungen pro Nutzer, letzte Aktivität
- Feature-Nutzung: Aufrufe pro Screen, Aktionen (Erledigen, Einplanen,
  .ics-Download, Urlaub, Feedback, Widerspruch, Rangliste geöffnet)
- Aufgaben-Kennzahlen: Ø Fortschritt bei Erledigung, Anteil überfällig,
  meist-/am wenigsten erledigte Aufgaben
- Einfache Diagramme + Tabelle, Zeitraum wählbar
- Eigene Event-Tabelle, kein externer Dienst. Events werden **ab Phase 1**
  erfasst. Private Zimmer sind ausgenommen.

### 9.2 Feedback-Tickets

- Jedes Mitglied: „Feedback senden“ im Profilmenü (Bug / Idee / Sonstiges, Text,
  optional Screenshot, max. 5 MB).
- Automatisch: aktueller Screen, Gerät/Browser, Zeitpunkt.
- Admin-Ansicht: Status (Neu / In Arbeit / Erledigt / Verworfen), interne Notiz,
  Antwort an Absender (Mitteilungszentrale).

### 9.3 Einstellungen

- Sweet-Spot-Schwellen und Mindestfortschritt global
- Widerspruchsfunktion an/aus
- Urlaubspaket: verknüpfte Aufgaben
- Einladungen verwalten (aktive Links, widerrufen)
- Mitglieder verwalten (entfernen, Admin-Rechte vergeben/abgeben,
  Passwort-Reset-Link), Ersteller geschützt (2.1)
- Datenexport (JSON, ohne private Zimmer) und Backup-Hinweis

---

## 10. Technik

| Bereich           | Wahl                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework         | Next.js 16 (App Router, `output: standalone`), TypeScript strict; Cache Components bewusst **aus** (alles request-basiert, einfacheres Modell) |
| Datenbank         | SQLite über `better-sqlite3` (WAL-Modus), Datei im Docker-Volume                                                                               |
| ORM               | Drizzle ORM + drizzle-kit-Migrationen (laufen beim Serverstart)                                                                                |
| Auth              | Better Auth (E-Mail/Passwort + Username-Plugin), Session-Cookies                                                                               |
| Validierung       | Zod                                                                                                                                            |
| Rendering         | Phase 1: SVG-Draufsicht; Phase 2: PixiJS v8 (isometrisch)                                                                                      |
| Styling           | Tailwind CSS v4                                                                                                                                |
| Echtzeit          | Polling (30 s)                                                                                                                                 |
| Hintergrundjobs   | In-Process-Scheduler (gestartet in `instrumentation.ts`)                                                                                       |
| Kalender          | `.ics` serverseitig (`ics`-Paket)                                                                                                              |
| QR-Code           | `qrcode`-Paket                                                                                                                                 |
| Tests             | Vitest (Fachlogik), Playwright (E2E über http)                                                                                                 |
| Deployment        | Docker-Image (GHCR) + docker-compose, ZimaOS Custom App                                                                                        |
| Erreichbarkeit v1 | `http://<zimaboard-ip>:3000` im Heimnetz                                                                                                       |
| Backup            | täglich per `VACUUM INTO` nach `/data/backups` (konsistent trotz WAL), 14 Tage aufbewahrt                                                      |

### 10.1 Betrieb ohne HTTPS

- Die Basis-URL wird aus dem Host der Anfrage gebildet (IP und Hostname
  funktionieren); über http werden **keine Secure-Cookies** gesetzt, sonst würde
  der Browser sie verwerfen. Mit HTTPS (Phase 5) genügt `APP_PROTOCOL=https`.
- Das Auth-Secret wird beim ersten Start erzeugt und im Volume gespeichert.
- Clipboard-API, Service Worker und Web Push stehen über http nicht zur
  Verfügung; die App nutzt Fallbacks bzw. aktiviert sie erst mit HTTPS. Manifest
  und Icons sind von Anfang an vorhanden.
- Alle Zeitpunkte werden in UTC gespeichert und in der Zeitzone der WG
  (Standard `Europe/Berlin`) dargestellt („heute fällig“, Monatswertung,
  Sammelmeldung, .ics).

### 10.2 Datenmodell

Das maßgebliche Schema steht in `src/db/schema.ts`. Übersicht:

```
user               id, name, email, username, avatar_json, last_household_id, …
session/account/verification   (Better Auth)
household          id, name, emoji, created_by_user_id, expected_member_count,
                   timezone, settings_json, created_at
membership         household_id, user_id, role(admin|member), joined_at
invite             id, household_id, token, created_by_user_id, expires_at,
                   max_uses, uses, revoked_at
password_reset     id, household_id, user_id, token_hash, created_by_user_id,
                   expires_at, used_at
room               id, household_id, type, name, private_owner_id?,
                   parent_room_id?, tiles_json, doors_json
object_group       id, room_id, name
object             id, household_id, room_id, group_id?, type, name,
                   x, y, w, h, rotation, is_floor
task               id, household_id, object_id, name, description,
                   interval_days, multiplier, early_threshold?, late_threshold?,
                   min_progress?, active, paused_at, baseline_at, created_at
completion         id, task_id, user_id, completed_at, progress_at_completion,
                   points, status(valid|contested|revoked),
                   source(manual|vacation), idempotency_key
commitment         id, task_id, user_id, planned_for,
                   status(open|fulfilled|missed|cancelled)   ≤ 1 offen pro Aufgabe
absence            id, user_id, from, to
vacation_bundle    id, absence_id, household_id, fridge_done_at,
                   vacuum_trash_done_at, points
vacation_linked_task  household_id, task_id
objection          id, completion_id, created_by_user_id, deadline_at,
                   resolved_at, resolution(valid|revoked)
objection_vote     objection_id, user_id, vote(confirm|reject)
feature_vote       household_id, feature, user_id, vote
notification       id, user_id, household_id, type, payload_json, dedupe_key,
                   read_at, created_at
feedback_ticket    id, household_id, user_id, category, text, screenshot_path,
                   context_json, status, admin_note, admin_reply, …
analytics_event    id, household_id, user_id, name, screen, meta_json, created_at
```

---

## 11. Assets (kostenlos)

1. **Selbst gebaut (empfohlen):** Räume, Wände und Möbel prozedural als
   isometrische Blöcke (Low-Poly-/Voxel-Look). Avatare als Pixel-Sprites
   (16×24 px, 4 Richtungen, Laufen/Putzen/Idle), z. B. mit Aseprite oder Piskel.
2. **CC0-Assets als Ergänzung:** Kenney.nl (CC0). Vor Verwendung Stil prüfen.

---

## 12. Design-Brief für Claude Design

### 12.1 Gesamteindruck

Ein gemütliches, verspieltes **isometrisches Diorama** der eigenen WG – wie ein
Puppenhaus von schräg oben, angelehnt an Sims, Habbo Hotel und Stardew Valley.
Die App soll sich wie ein kleines Spiel anfühlen, bleibt aber auf einen Blick
lesbar: **Was ist dreckig, was ist als Nächstes dran?**

### 12.2 Perspektive & Kamera

- Isometrische Ansicht (ca. 30° Neigung, 45° gedreht), orthografisch.
- Wände **abgeschnitten/halbhoch** (Sims-Cutaway); die zwei vorderen Wände jedes
  Raums sind ausgeblendet.
- Pinch-to-Zoom und Wischen zum Verschieben; Doppeltipp auf einen Raum zoomt
  hinein.
- Optional: Drehen der Ansicht in 90°-Schritten.

### 12.3 Stil

- **Low-Poly-/Voxel-Pixel-Look:** blockige Formen, flache Flächen mit zwei bis
  drei Schattierungsstufen, dünne dunkle Kontur.
- Böden je Raumtyp: Fliesen (Bad/Küche), Holzdielen (Zimmer/Wohnzimmer),
  Laminat (Flur).
- Grundpalette warm und gedeckt (Creme, Holzbraun, Salbeigrün, gedämpftes Blau),
  damit die **Statusfarben** klar herausstechen.
- Weiche Umgebungsschatten, leichter Tageslicht-Look; optional Tag/Nacht.

### 12.4 Objekte & Status

- Jedes Objekt hat eine **farbige Aura bzw. Bodenplatte** plus Tönung:
  Grün = frisch, Gelb = Sweet Spot, Orange = Sweet Spot/bald fällig,
  Rot pulsierend = überfällig.
- > 150 %: animierte Fliegen, Staubwölkchen, Wasserflecken (Bad), Geruchslinien
  > (Mülleimer).
- Frisch erledigte Objekte glitzern kurz (Sparkle-Partikel).
- Eingeplante Aufgaben: **Wecker-Icon** mit Mini-Avatar und Datum („Fr“).
- Einbauküche als zusammenhängender Möbelblock; Teile einzeln antippbar und
  eingefärbt.
- Private Zimmer anderer: ausgegraut, nur Umriss + Namensschild.

### 12.5 Avatare

- Pixel-Figuren (chibi), individuell: Hautton, Frisur, Haarfarbe,
  Oberteilfarbe, Accessoire.
- **Idle-Verhalten wie Sims:** laufen durch die Wohnung, Sofa, Kühlschrank,
  Pflanzen gießen, aus dem Fenster schauen, Gedankenblasen mit Emojis.
  Avatare betreten keine fremden privaten Zimmer.
- Bei Erledigung: Avatar läuft zum Objekt, Putz-Animation (Schwamm, Besen,
  Mülltüte), danach schwebt „+3“ hoch.
- Im Urlaub: ausgegraut mit Koffer an der Tür oder ausgeblendet mit Koffer-Icon
  am Zimmer.
- Jedes private Zimmer trägt ein Namensschild.

### 12.6 UI-Überlagerung (mobile-first, Hochformat)

- **Oben:** WG-Name, eigene Monatspunkte, Glocke mit Badge, Profilbild
  (öffnet Menü mit WG-Wechsler).
- **Mitte:** das Diorama.
- **Unten:** einklappbares Bottom-Sheet „Als Nächstes“ mit den 3–5 dringendsten
  Aufgaben (Objekt-Icon, Name, Statusbalken, Punkte bei Erledigung jetzt).
- **Tab-Bar:** Wohnung · Aufgaben · Rangliste · Profil; für Admins zusätzlich
  Admin.
- Tipp auf ein Objekt → Bottom-Sheet: Statusbalken mit markiertem Sweet Spot,
  „Erledigt“, „Einplanen“, Historie.
- Runde Sans-Serif für UI; Pixel-Font nur für Punkte-Popups und Überschriften.
- Buttons mit leichtem 3D-Kanten-Look.

### 12.7 Zu gestaltende Screens

1. Login / Registrierung über Einladungslink (mit QR-Scan-Hinweis)
2. Avatar-Editor
3. WG erstellen – Raum-Editor (Raster von oben, Isometrie-Vorschau,
   Raumtyp-Palette, Zimmer zuweisen)
4. Objekte platzieren – Bibliothek, Gruppierung „Einbauküche“
5. Aufgaben anlegen – Vorschlagsliste mit Intervall, Multiplikator und
   „Zuletzt gemacht?“
6. Hauptansicht Wohnung (Diorama + „Als Nächstes“)
7. Objekt-Detail-Sheet
8. Einplanen-Dialog (Datum + „Zum Kalender hinzufügen“)
9. Aufgabenliste (nach Dringlichkeit, Filter nach Raum)
10. Rangliste (Podest für Top 3, Umschalter Monat / Gesamt)
11. Urlaub eintragen + Urlaubsvorbereitung (1 + 4 = 5 Punkte)
12. Mitteilungszentrale
13. Abstimmungs-Pop-up Widerspruchsfunktion („x von y“)
14. Abstimmung über einen Widerspruch
15. Feedback senden
16. Einladen (Link kopieren + großer QR-Code)
17. WG-Wechsler
18. Eigenes privates Zimmer einrichten
19. Admin: Statistik-Dashboard
20. Admin: Ticket-Liste und Ticket-Detail
21. Admin: Einstellungen inkl. Mitglieder und Passwort-Reset-Link

### 12.8 Mikro-Interaktionen

- Erledigen: Objekt wechselt in ca. 600 ms mit Sparkle zu Grün, Punkte zählen in
  der Kopfzeile hoch. Unter 15 % Fortschritt: dezenter Hinweis „wurde gerade erst
  erledigt“ statt Punkte-Popup.
- Überfällig: langsames rotes Pulsieren (2 s Zyklus).
- Rangplatz verbessert: kurzes Konfetti im Ranglisten-Tab-Icon.
- Alles grün: Avatare tanzen / sitzen entspannt zusammen, „Alles sauber.“

---

## 13. Umsetzung in Phasen

Siehe [`PLAN.md`](./PLAN.md).

---

## 14. Offene Punkte

Keine. Entschieden in v0.2:

1. Widerspruch: Mehrheit der abgegebenen Stimmen, Nichtwähler fallen nach 24 h
   heraus, Gleichstand → gültig (6.3).
2. Rangliste: Rohpunkte, Monatswertung als Standard + Gesamt (6.2).
3. Private Zimmer: vom Besitzer frei einrichtbar, für andere nur Umriss, ohne
   Punkte und Statistik (4.2).
4. Mehrere WGs pro Account: ja, Wechsel über das Profilbild (2.2).
