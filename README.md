# HRP – Household Ressource Planning

Management-System für WGs und Einzel-Apartments: Haushaltsaufgaben mit
rollierender Fälligkeit, Punkten und Rangliste, später als isometrisches
Diorama der eigenen Wohnung.

- Spezifikation: [`docs/SPEC.md`](docs/SPEC.md)
- Umsetzungsplan: [`docs/PLAN.md`](docs/PLAN.md)

## Entwicklung

Voraussetzung: Node.js 22.

```bash
npm install
npm run dev          # http://localhost:3000
```

| Befehl                | Zweck                                          |
| --------------------- | ---------------------------------------------- |
| `npm run lint`        | ESLint                                         |
| `npm run typecheck`   | Routen-Typen generieren + `tsc`                |
| `npm test`            | Unit-Tests (Vitest)                            |
| `npm run e2e`         | E2E-Tests (Playwright) gegen `E2E_BASE_URL`    |
| `npm run format`      | Prettier                                       |
| `npm run db:generate` | Neue Migration aus `src/db/schema.ts` erzeugen |

Migrationen laufen automatisch beim Serverstart. Daten liegen in `DATA_DIR`
(Standard `./data`).

## Betrieb auf dem ZimaBoard (ZimaOS)

Das Image wird bei jedem Push auf `main` gebaut und unter
`ghcr.io/maxseidlitz/hrp-household-ressource-planning:latest` veröffentlicht.

1. In ZimaOS: **App Store → Custom App installieren → Docker Compose
   importieren** und den Inhalt von [`docker-compose.yml`](docker-compose.yml)
   einfügen.
2. Ist das Paket auf GitHub privat, vorher auf dem ZimaBoard einmalig
   `docker login ghcr.io` mit einem Personal Access Token (Scope
   `read:packages`) ausführen, oder das Paket in den GitHub-Einstellungen
   öffentlich machen.
3. Aufrufen unter `http://<zimaboard-ip>:3000` und den ersten Account
   registrieren.

Alle Daten (SQLite-Datei, Auth-Secret, später Uploads und Backups) liegen in
`/DATA/AppData/hrp`. Dieses Verzeichnis sichern.

### Umgebungsvariablen

| Variable             | Standard | Bedeutung                                                           |
| -------------------- | -------- | ------------------------------------------------------------------- |
| `DATA_DIR`           | `/data`  | Datenverzeichnis im Container                                       |
| `ALLOWED_HOSTS`      | `*`      | Kommagetrennte Hosts (mit Port), unter denen die App erreichbar ist |
| `APP_PROTOCOL`       | `http`   | `https` nach dem Umzug hinter einen TLS-Proxy                       |
| `BETTER_AUTH_URL`    | –        | Feste Basis-URL statt Ableitung aus dem Host                        |
| `BETTER_AUTH_SECRET` | –        | Eigenes Secret; sonst wird beim ersten Start eins erzeugt           |
