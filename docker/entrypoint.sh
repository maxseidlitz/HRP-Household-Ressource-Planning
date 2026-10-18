#!/bin/sh
set -e

# ZimaOS legt Bind-Mounts oft als root an. Datenverzeichnis an den
# unprivilegierten Benutzer übergeben und die App ohne Root-Rechte starten.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
