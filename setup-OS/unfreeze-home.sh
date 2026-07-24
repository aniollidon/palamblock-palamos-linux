#!/usr/bin/env bash
# unfreeze-home.sh — Desfà la congelació de /home i /tmp (mode manteniment)
# de la plantilla Examen de PalamOS.
#
# Ús:
#   sudo bash unfreeze-home.sh
#
# Desactiva home-overlay.service i tmp.mount, i restaura l'fstab original.
# Cal reiniciar per tornar al mode normal. Després del manteniment, torna a
# executar clean-before-freeze.sh + freeze-home.sh.

set -euo pipefail

FSTAB="/etc/fstab"
FSTAB_BACKUP="/etc/fstab.pre-freeze"
UNIT="/etc/systemd/system/home-overlay.service"

log() { echo "[unfreeze-home] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
    echo "ERROR: Executa aquest script amb sudo." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# 1. Desactivar el servei d'overlay
# ---------------------------------------------------------------------------
if [[ -f "$UNIT" ]]; then
    systemctl disable home-overlay.service || true
    rm -f "$UNIT"
    log "Servei home-overlay.service desactivat i eliminat."
else
    log "No hi havia home-overlay.service configurat."
fi

# ---------------------------------------------------------------------------
# 2. Restaurar /tmp al disc
# ---------------------------------------------------------------------------
if [[ -f /etc/systemd/system/tmp.mount ]]; then
    systemctl disable tmp.mount || true
    rm -f /etc/systemd/system/tmp.mount
    log "tmp.mount desactivat (/tmp torna al disc)."
fi

# ---------------------------------------------------------------------------
# 3. Restaurar l'fstab
# ---------------------------------------------------------------------------
if [[ -f "$FSTAB_BACKUP" ]]; then
    cp "$FSTAB_BACKUP" "$FSTAB"
    log "fstab restaurat des de $FSTAB_BACKUP."
else
    # Fallback: descomenta les línies marcades per freeze-home.sh
    sed -i -E "s|^# palam-freeze: (.*)$|\1|" "$FSTAB"
    log "No hi havia còpia de seguretat; s'han descomentat les entrades marcades a l'fstab."
fi

systemctl daemon-reload

cat <<MSG

Congelació desfeta. Reinicia per tornar al mode normal:
  sudo reboot

Recorda: després del manteniment, torna a congelar amb:
  clean-before-freeze.sh + freeze-home.sh
MSG
