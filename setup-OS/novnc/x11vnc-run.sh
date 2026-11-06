#!/bin/bash
# Llança x11vnc sobre el display X de l'usuari que executa el servei.
# El display es detecta en temps d'execució (lib compartida de palam-dash).
set -euo pipefail

LIB="/data/palamos-dashboard/scripts/lib-display.sh"
if [ ! -r "$LIB" ]; then
    echo "[x11vnc] Falta $LIB (cal instal·lar palam-dash)" >&2
    exit 1
fi
source "$LIB"

if ! detect_display 60; then
    echo "[x11vnc] No s'ha trobat cap display X. Systemd ho reintentarà." >&2
    exit 1
fi

exec /usr/bin/x11vnc -auth "${XAUTHORITY:-guess}" -forever -noxdamage -repeat -display "$DISPLAY" \
    -rfbauth /etc/x11vnc.pwd -rfbport 5900 -shared -o /var/log/x11vnc.log
