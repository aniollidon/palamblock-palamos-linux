#!/bin/bash
set -euo pipefail

APP="/data/palamos-dashboard/bin/palam-dash.AppImage"
DATA_DIR="/data/palamos-dashboard/data"
WAIT_SECS=120

log(){ echo "[run.sh] $*"; }

# Assegurar que les dades persistents (.user, .server) sobrevisquin a congelacions
# Electron guarda a ~/.config/palam-dash/, fem symlink a /data/
CONFIG_DIR="$HOME/.config/palam-dash"
mkdir -p "$DATA_DIR"
if [ ! -L "$CONFIG_DIR" ] || [ "$(readlink -f "$CONFIG_DIR" 2>/dev/null)" != "$DATA_DIR" ]; then
  rm -rf "$CONFIG_DIR"
  mkdir -p "$(dirname "$CONFIG_DIR")"
  ln -sf "$DATA_DIR" "$CONFIG_DIR"
  log "Dades persistents: $CONFIG_DIR -> $DATA_DIR"
fi

# El display X es detecta sempre en temps d'execució (qualsevol display, sense dependre de la instal·lació)
source "$(dirname "$(readlink -f "$0")")/scripts/lib-display.sh"
log "Esperant display X (màx. ${WAIT_SECS}s)..."
if ! detect_display "$WAIT_SECS"; then
  log "ERROR: no s'ha trobat cap display X. Sortim perquè systemd ho reintenti."
  exit 1
fi
log "Display detectat: $DISPLAY (XAUTHORITY=${XAUTHORITY:-no definit})"

log "Iniciant applicació: $APP"
exec "$APP"
