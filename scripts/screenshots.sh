#!/usr/bin/env bash
# Erzeugt die README-Screenshots (docs/screenshots) gegen einen frischen
# Produktions-Build mit leerer Datenbank.
#
#   npm run screenshots
#
# Optional: PW_CHROMIUM_PATH=/pfad/zu/chromium, falls Playwright keinen
# eigenen Browser installiert hat.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build
rm -rf .next/standalone/public .next/standalone/.next/static
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/

DATA_DIR=$(mktemp -d)
PORT=${PORT:-3999}
(cd .next/standalone && DATA_DIR="$DATA_DIR" PORT="$PORT" HOSTNAME=0.0.0.0 node server.js >/dev/null 2>&1) &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null; rm -rf "$DATA_DIR"' EXIT

for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && break
  sleep 0.5
done

SCREENSHOTS=1 E2E_BASE_URL="http://127.0.0.1:$PORT" \
  npx playwright test e2e/screenshots.spec.ts
