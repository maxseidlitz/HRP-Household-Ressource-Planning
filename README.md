# 🏠 HRP – Household Ressource Planning

Die Haushalts-App für eure WG: Aufgaben mit rollierender Fälligkeit, Punkte für
Fairness und ein isometrischer Wohnungsplan, in dem sich Klo, Herd und
Mülleimer von grün nach rot verfärben. Einplanen mit Kalender-Erinnerung,
Mitteilungen und Urlaubsmodus inklusive. Selbst gehostet, läuft im Heimnetz.

## 🚀 Schnellstart

**Auf dem ZimaBoard (ZimaOS):**

1. ZimaOS öffnen → **App Store** → **Custom App installieren** →
   **Docker Compose importieren**.
2. Den Inhalt von [`docker-compose.yml`](docker-compose.yml) einfügen und
   installieren.
3. Am Handy `http://<zimaboard-ip>:3000` öffnen und den ersten Account anlegen.

**Mit Docker auf einem beliebigen Rechner:**

```bash
git clone https://github.com/maxseidlitz/HRP-Household-Ressource-Planning.git
cd HRP-Household-Ressource-Planning
docker compose up -d --build
# → http://localhost:3000
```

**Zum Entwickeln** (Node.js 22):

```bash
npm install
npm run dev
# → http://localhost:3000
```

**Mit eigener Domain und HTTPS** (für Push-Nachrichten und App-Installation):
siehe [Umzug auf eine eigene Domain](#-umzug-auf-eine-eigene-domain-https).

Alle Daten liegen in einem Ordner (auf ZimaOS `/DATA/AppData/hrp`): SQLite-Datei,
Auth-Schlüssel, Feedback-Screenshots und Backups. Diesen Ordner sichern, mehr
braucht es nicht.

## 📱 So sieht's aus

|                                             Eure Wohnung als Diorama                                              |                                         Erledigt: Avatar putzt, es glitzert                                         |                                             Objekt antippen                                             |
| :---------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------: |
| <img src="docs/screenshots/00-wohnung.png" width="240" alt="Isometrisches Diorama mit Statusfarben und Avataren"> | <img src="docs/screenshots/12-geputzt.png" width="240" alt="Avatar hat das Klo geputzt, +4,5 Punkte schweben hoch"> | <img src="docs/screenshots/10-objekt.png" width="240" alt="Bottom-Sheet mit den Aufgaben der Toilette"> |

|                                          2D-Plan                                          |                                                     Baumodus                                                      |                                            Aufgaben                                             |
| :---------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------: |
| <img src="docs/screenshots/11-plan-2d.png" width="240" alt="Draufsicht mit Statusfarben"> | <img src="docs/screenshots/09-editor.png" width="240" alt="Baumodus: Küchenzeile ausgewählt, Möbel-Leiste unten"> | <img src="docs/screenshots/04-aufgaben.png" width="240" alt="Aufgabenliste nach Dringlichkeit"> |

|                                    Aufgabe & Historie                                     |                                      Rangliste                                       |                                   Einladen per QR-Code                                    |
| :---------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------: |
| <img src="docs/screenshots/05-aufgabe.png" width="240" alt="Aufgabendetail mit Historie"> | <img src="docs/screenshots/06-rangliste.png" width="240" alt="Rangliste mit Podest"> | <img src="docs/screenshots/07-einladen.png" width="240" alt="Einladungslink mit QR-Code"> |

|                                            Einplanen mit Kalender-Export                                            |                                                   Mitteilungen                                                   |                                           Urlaub & Urlaubspaket                                           |
| :-----------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------------: |
| <img src="docs/screenshots/13-einplanen.png" width="240" alt="Aufgabe einplanen mit Schnellwahl und .ics-Download"> | <img src="docs/screenshots/14-mitteilungen.png" width="240" alt="Mitteilungszentrale mit ungelesenen Meldungen"> | <img src="docs/screenshots/15-urlaub.png" width="240" alt="Geplanter Urlaub mit abhakbarem Urlaubspaket"> |

|                                               Widerspruch & Abstimmung                                                |                                                 Admin-Statistik                                                  |                                           Feedback-Tickets                                            |
| :-------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------: |
| <img src="docs/screenshots/16-widerspruch.png" width="240" alt="Abstimmung über einen Widerspruch mit Zwischenstand"> | <img src="docs/screenshots/17-statistik.png" width="240" alt="Statistik-Dashboard mit aktiven Personen pro Tag"> | <img src="docs/screenshots/18-feedback.png" width="240" alt="Feedback-Ticket mit Status und Antwort"> |

|                                              Vorlage wählen                                              |                              Profil & Avatar                               |                                  WG erstellen                                   |
| :------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------: | :-----------------------------------------------------------------------------: |
| <img src="docs/screenshots/03-vorlage.png" width="240" alt="Baumodus startet mit einer Wohnungsvorlage"> | <img src="docs/screenshots/08-profil.png" width="240" alt="Avatar-Editor"> | <img src="docs/screenshots/02-wg-erstellen.png" width="240" alt="WG erstellen"> |

|                                           Push & App installieren                                            |
| :----------------------------------------------------------------------------------------------------------: |
| <img src="docs/screenshots/19-push.png" width="240" alt="Push-Nachrichten einschalten und App installieren"> |

> Stand: Phase 5 mit Baumodus im Liquid-Glass-Design. Die Screenshots werden mit jeder Phase automatisch neu erzeugt
> (`npm run screenshots`).

## ✨ Funktionen

|     | Funktion                                                                                                                                           | Status      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 🔐  | Login mit Benutzername oder E-Mail, funktioniert ohne HTTPS im Heimnetz                                                                            | ✅ Phase 0  |
| 🐳  | Docker-Image, ZimaOS-Compose, automatische Migrationen                                                                                             | ✅ Phase 0  |
| 🏡  | WG anlegen, mehrere WGs pro Account, Einladung per Link + QR-Code                                                                                  | ✅ Phase 1a |
| 🧽  | Aufgaben mit Vorschlägen, rollierender Fälligkeit, Punkten und Rangliste                                                                           | ✅ Phase 1a |
| 🔒  | Private Zimmer, mehrere Admins mit Ersteller-Schutz, Passwort-Reset-Link, tägliches Backup                                                         | ✅ Phase 1a |
| 🗺️  | Wohnungsplan mit Statusfarben, Raum-Editor auf dem Raster (L-Formen, Türen, Möbel, Einbauküche, Unterräume)                                        | ✅ Phase 1b |
| 🎮  | Isometrisches Diorama (PixiJS): Voxel-Möbel in Statusfarben, Fliegen & Gerüche, Avatare mit Wegfindung, Putz-Animation, Drehen/Zoomen, 2D-Fallback | ✅ Phase 2  |
| ⏰  | Einplanen mit Wecker-Icon, Kalender-Export (.ics mit Erinnerung), Mitteilungen mit Badge, Urlaub mit Urlaubspaket und Koffer-Avatar                | ✅ Phase 3  |
| 📊  | Admin-Statistiken, Feedback-Tickets mit Screenshot, Einstellungen, JSON-Export, Widerspruch per Abstimmung                                         | ✅ Phase 4  |
| 🪟  | Modernes Liquid-Glass-Design: Glasflächen, schwebende Tab-Leiste, Linien-Icons                                                                     | ✅          |
| 🔔  | Eigene Domain mit HTTPS (Caddy), Installation als App (PWA), Push-Benachrichtigungen, Offline-Hinweis                                              | ✅ Phase 5  |
| 🧱  | Baumodus wie im Aufbauspiel: Vorlagen, Räume aufziehen, Türen von selbst, Möbel aus der Leiste ziehen, Rückgängig, Aufgaben kommen automatisch mit | ✅          |

Details: [Spezifikation](docs/SPEC.md) · [Umsetzungsplan](docs/PLAN.md)

## ⚙️ Konfiguration

Ohne Konfiguration lauffähig. Optional per Umgebungsvariable:

| Variable                                 | Standard                 | Bedeutung                                                                                                           |
| ---------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `DATA_DIR`                               | `/data`                  | Datenverzeichnis im Container                                                                                       |
| `ALLOWED_HOSTS`                          | `*`                      | Kommagetrennte Hosts (mit Port), unter denen die App erreichbar ist, z. B. `192.168.1.20:3000,zimaboard.local:3000` |
| `APP_PROTOCOL`                           | `http`                   | `https`, sobald die App hinter einem TLS-Proxy läuft                                                                |
| `BETTER_AUTH_URL`                        | –                        | Feste Basis-URL statt Ableitung aus dem Host                                                                        |
| `BETTER_AUTH_SECRET`                     | –                        | Eigener Schlüssel; sonst wird beim ersten Start einer erzeugt                                                       |
| `AUTH_RATE_LIMIT`                        | `on`                     | Schutz gegen Passwort-Raten (3 Logins pro 10 s und Gerät). Nur für automatisierte Tests auf `off`                   |
| `VAPID_SUBJECT`                          | `mailto:hrp@example.com` | Kontakt für die Push-Dienste von Apple, Google und Mozilla (`mailto:` oder `https://`)                              |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | –                        | Eigene Push-Schlüssel; sonst wird beim ersten Start ein Paar im Datenordner erzeugt                                 |

**Backups:** Die App legt täglich eine Kopie der Datenbank unter `backups/` im
Datenordner an und behält 14 Tage.

**Mitteilungen:** Die App prüft alle fünf Minuten, ob Eingeplantes heute
ansteht, verpasst wurde oder überfällig ist (Sammelmeldung ab 9 Uhr), und
die Glocke aktualisiert sich alle 30 Sekunden. Mit HTTPS kommen alle
Mitteilungen zusätzlich als Push-Nachricht aufs Handy (im Profil unter „Auf
diesem Gerät“ einschalten); ohne HTTPS erinnert der Kalendereintrag (.ics).

### Fertiges Image statt selbst bauen

Bei jedem Push auf `main` baut die CI das Image
`ghcr.io/maxseidlitz/hrp-household-ressource-planning:latest`. Ist das Paket auf
GitHub privat, auf dem ZimaBoard einmalig `docker login ghcr.io` mit einem
Personal Access Token (Scope `read:packages`) ausführen oder das Paket in den
GitHub-Einstellungen öffentlich schalten.

## 🔒 Umzug auf eine eigene Domain (HTTPS)

Browser erlauben Push-Nachrichten, App-Installation und den Offline-Modus nur
über HTTPS. Dafür gibt es eine zweite Compose-Datei mit [Caddy](https://caddyserver.com),
der das Zertifikat von Let's Encrypt automatisch holt und erneuert:
[`deploy/https/`](deploy/https).

1. **Domain:** Eine (Sub-)Domain, z. B. `wg.example.de`, per DNS (A/AAAA) auf die
   öffentliche IP eures Anschlusses zeigen lassen. Bei wechselnder IP einen
   DynDNS-Dienst nutzen (z. B. über den Router, bei der Fritz!Box „MyFRITZ!“
   oder „DynDNS“).
2. **Router:** Ports 80 und 443 (TCP, für HTTP/3 auch 443 UDP) an das ZimaBoard
   weiterleiten. ZimaOS belegt selbst Port 80: dann in der `.env`
   `HTTP_PORT=8080` und `HTTPS_PORT=8443` setzen und im Router 80 → 8080 und
   443 → 8443 weiterleiten.
3. **Starten:**

   ```bash
   cd deploy/https
   cp .env.example .env   # DOMAIN und VAPID_SUBJECT eintragen
   docker compose up -d
   # → https://wg.example.de
   ```

   Auf ZimaOS stattdessen die bisherige App stoppen und den Inhalt von
   [`deploy/https/docker-compose.yml`](deploy/https/docker-compose.yml) als
   Custom App importieren (Variablen dort eintragen; die `Caddyfile` muss neben
   der Compose-Datei liegen).

4. **Am Handy:** `https://<domain>` öffnen und einloggen. Die Daten bleiben
   erhalten, es ist derselbe Datenordner. Unter **Profil → Auf diesem Gerät**
   Push einschalten. Auf dem iPhone die App vorher über Teilen → „Zum
   Home-Bildschirm“ installieren (iOS 16.4+), sonst bietet Safari kein Push an.

Die App ist danach nur noch über die Domain erreichbar, nicht mehr über
`http://<ip>:3000` (Logins sind an die HTTPS-Adresse gebunden). Im Heimnetz
funktioniert die Domain ebenfalls, sofern der Router „NAT-Loopback“ kann (die
Fritz!Box kann das).

## 🛠️ Entwicklung

| Befehl                | Zweck                                                      |
| --------------------- | ---------------------------------------------------------- |
| `npm run dev`         | Entwicklungsserver                                         |
| `npm run lint`        | ESLint                                                     |
| `npm run typecheck`   | Routen-Typen generieren + `tsc`                            |
| `npm test`            | Unit-Tests (Vitest)                                        |
| `npm run e2e:local`   | Build + E2E-Tests (Playwright) gegen einen frischen Server |
| `npm run e2e`         | E2E-Tests gegen einen laufenden Server (`E2E_BASE_URL`)    |
| `npm run screenshots` | README-Screenshots neu erzeugen (frischer Build, leere DB) |
| `npm run icons`       | App-Icons (PNG) aus `src/app/icon.svg` erzeugen            |
| `npm run format`      | Prettier                                                   |
| `npm run db:generate` | Neue Migration aus `src/db/schema.ts` erzeugen             |

**Technik:** Next.js 16 · TypeScript · SQLite + Drizzle · Better Auth ·
Tailwind CSS · Vitest · Playwright · Docker
