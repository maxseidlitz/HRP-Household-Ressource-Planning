#!/usr/bin/env bash
# Startet den Standalone-Build (vorher `npm run build`) mit leerer Datenbank
# und führt den übergebenen Befehl aus. E2E_BASE_URL zeigt auf den Server.
#
#   scripts/with-server.sh npx playwright test
#
# HOST bestimmt die Adresse in E2E_BASE_URL. Standard ist die erste
# Netzwerk-IP, damit wie im Heimnetz über http ohne localhost getestet wird
# (localhost gilt im Browser als Secure Context). Das Login-Rate-Limit ist
# aus, weil alle Testanfragen von derselben IP kommen.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf .next/standalone/public .next/standalone/.next/static
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/

DATA_DIR=$(mktemp -d)
PORT=${PORT:-3999}
HOST=${HOST:-$(hostname -I 2>/dev/null | awk '{print $1}')}
HOST=${HOST:-127.0.0.1}
(cd .next/standalone && AUTH_RATE_LIMIT=off DATA_DIR="$DATA_DIR" PORT="$PORT" HOSTNAME=0.0.0.0 exec node server.js >"$DATA_DIR/server.log" 2>&1) &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  if [ "${KEEP_LOG:-}" = "1" ]; then cat "$DATA_DIR/server.log"; fi
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  curl -sf "http://$HOST:$PORT/api/health" >/dev/null && break
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Server konnte nicht starten:" >&2
    cat "$DATA_DIR/server.log" >&2
    exit 1
  fi
  sleep 0.5
done

E2E_DATA_DIR="$DATA_DIR" E2E_BASE_URL="http://$HOST:$PORT" "$@"
