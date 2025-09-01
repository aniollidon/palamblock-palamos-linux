#!/bin/bash
set -euo pipefail

APP="/opt/palamos-dashboard/palam-dash"
DISPLAY_VAL=":1"
WAIT_SECS=15
NOVNC_PROXY="/home/super/noVNC/utils/novnc_proxy"
NOVNC_ARGS="--vnc localhost:5900"

log(){ echo "[run.sh] $*"; }

export DISPLAY=$DISPLAY_VAL
if [ ! -S "/tmp/.X11-unix/${DISPLAY_VAL#:}" ]; then
  log "Socket X per $DISPLAY_VAL no existeix. Esperant fins ${WAIT_SECS}s..."
  for i in $(seq 1 $WAIT_SECS); do
    if [ -S "/tmp/.X11-unix/${DISPLAY_VAL#:}" ]; then
      log "X disponible després de ${i}s"; break; fi
    sleep 1
  done
fi
if [ ! -S "/tmp/.X11-unix/${DISPLAY_VAL#:}" ]; then
  log "ATENCIÓ: No s'ha trobat el socket X a $DISPLAY_VAL. L'aplicació pot fallar."
fi

# Inicia noVNC proxy si disponible
if [ -x "$NOVNC_PROXY" ]; then
  if pgrep -f "$(basename $NOVNC_PROXY).*localhost:5900" >/dev/null 2>&1; then
    log "noVNC proxy ja en execució (localhost:5900)."
  else
    log "Iniciant noVNC proxy: $NOVNC_PROXY $NOVNC_ARGS"
    "$NOVNC_PROXY" $NOVNC_ARGS &
    disown || true
  fi
else
  log "noVNC proxy no trobat a $NOVNC_PROXY (omitint)."
fi

log "Iniciant applicació: $APP"
exec "$APP"
