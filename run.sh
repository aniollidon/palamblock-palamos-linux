#!/bin/bash
set -euo pipefail

APP="/opt/palamos-dashboard/palam-dash"
DISPLAY_VAL=":1"
WAIT_SECS=15

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

log "Iniciant applicació: $APP"
exec "$APP"
