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
SCREENSHOTS=1 scripts/with-server.sh npx playwright test e2e/screenshots.spec.ts
