#!/bin/bash
set -euo pipefail

APP="/opt/palamos-dashboard/palam-dash"
DISPLAY_VAL=${DISPLAY:-":0"}
WAIT_SECS=10

log(){ echo "[run.sh] $*"; }

# Si hi ha un DISPLAY definit, comprova que el socket existeixi
if [ -n "${DISPLAY:-}" ]; then
  if [ ! -S "/tmp/.X11-unix/${DISPLAY_VAL#:}" ]; then
    log "DISPLAY=${DISPLAY_VAL} no disponible. Esperant fins ${WAIT_SECS}s..."
    for i in $(seq 1 $WAIT_SECS); do
      if [ -S "/tmp/.X11-unix/${DISPLAY_VAL#:}" ]; then
        log "X disponible després de ${i}s"; break; fi
      sleep 1
    done
  fi
fi

# Si continua no existint el socket, arrenca Xvfb minimal (necessita paquet xvfb instal·lat)
if [ ! -S "/tmp/.X11-unix/${DISPLAY_VAL#:}" ]; then
  if command -v Xvfb >/dev/null 2>&1; then
    log "No hi ha servidor X. Arrencant Xvfb a ${DISPLAY_VAL}..."
    Xvfb ${DISPLAY_VAL} -screen 0 1024x768x24 &
    XVFB_PID=$!
    # Espera breu perquè arrenqui
    sleep 2
  else
    log "Xvfb no instal·lat i no hi ha servidor X. Continuant (pot fallar)."
  fi
fi

log "Iniciant applicació: $APP"
exec "$APP"
