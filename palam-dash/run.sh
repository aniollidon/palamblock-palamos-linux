#!/bin/bash
set -euo pipefail

APP="/data/palamos-dashboard/bin/palam-dash.AppImage"
DATA_DIR="/data/palamos-dashboard/data"
DISPLAY_VAL=":1"
WAIT_SECS=5

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

export DISPLAY=$DISPLAY_VAL
X_SOCKET="/tmp/.X11-unix/X${DISPLAY_VAL#:}"
if [ ! -S "$X_SOCKET" ]; then
  log "Socket X per $DISPLAY_VAL no existeix. Esperant fins ${WAIT_SECS}s..."
  for i in $(seq 1 $WAIT_SECS); do
    if [ -S "$X_SOCKET" ]; then
      log "X disponible després de ${i}s"; break; fi
    sleep 1
  done
fi
if [ ! -S "$X_SOCKET" ]; then
  log "ATENCIÓ: No s'ha trobat el socket X a $DISPLAY_VAL. L'aplicació pot fallar."
fi

log "Iniciant applicació: $APP"
exec "$APP"
