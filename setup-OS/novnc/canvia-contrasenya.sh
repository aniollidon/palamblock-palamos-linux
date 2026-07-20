#!/bin/bash
# =============================================================================
# canvia-contrasenya.sh — Canvia la contrasenya de VNC (noVNC/x11vnc)
# =============================================================================
#
# Aquest script canvia la contrasenya del servidor VNC (x11vnc) que es
# guarda a /etc/x11vnc.pwd.  El proxy noVNC no té contrasenya pròpia:
# és el navegador qui la demana en connectar-s'hi (vnc_iframe.html).
#
# REQUISITS:
#   - Tenir x11vnc instal·lat i els serveis x11vnc + novnc-proxy actius.
#   - Executar com a root (sudo).
#
# ÚS:
#   sudo ./canvia-contrasenya.sh
#   sudo ./canvia-contrasenya.sh --password NOVA_CONTRASENYA
#
# Si no es passa --password, el script la demanarà interactivament.
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[AVÍS]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

VNC_PWD_FILE="/etc/x11vnc.pwd"

# -----------------------------------------------------------------------------
# 0. Comprovar root i dependències
# -----------------------------------------------------------------------------

if [ "$(id -u)" -ne 0 ]; then
    log_error "Aquest script s'ha d'executar amb sudo (com a root)"
    exit 1
fi

if ! command -v x11vnc &>/dev/null; then
    log_error "x11vnc no està instal·lat. Executa primer install-novnc-services.sh"
    exit 1
fi

if [ ! -f "$VNC_PWD_FILE" ]; then
    log_error "No es troba $VNC_PWD_FILE. Executa primer install-novnc-services.sh"
    exit 1
fi

# -----------------------------------------------------------------------------
# 1. Obtenir la nova contrasenya
# -----------------------------------------------------------------------------

NEW_PASSWORD=""

if [[ "${1:-}" == "--password" ]]; then
    NEW_PASSWORD="${2:-}"
    if [ -z "$NEW_PASSWORD" ]; then
        log_error "Cal passar una contrasenya amb --password"
        exit 1
    fi
fi

if [ -z "$NEW_PASSWORD" ]; then
    echo ""
    log_info "Canvi de contrasenya VNC de PalamOS"
    echo ""

    # Demanar contrasenya dues vegades per confirmar
    while true; do
        read -rsp "Nova contrasenya VNC: " NEW_PASSWORD
        echo ""
        read -rsp "Torna a escriure la contrasenya: " CONFIRM_PASSWORD
        echo ""

        if [ "$NEW_PASSWORD" = "$CONFIRM_PASSWORD" ]; then
            break
        else
            log_error "Les contrasenyes no coincideixen. Torna-ho a intentar."
            echo ""
        fi
    done
fi

if [ -z "$NEW_PASSWORD" ]; then
    log_error "La contrasenya no pot estar buida."
    exit 1
fi

# -----------------------------------------------------------------------------
# 2. Desa la nova contrasenya amb x11vnc -storepasswd
# -----------------------------------------------------------------------------

log_info "Desant la nova contrasenya a $VNC_PWD_FILE..."
x11vnc -storepasswd "$NEW_PASSWORD" "$VNC_PWD_FILE"
chmod 644 "$VNC_PWD_FILE"
log_info "Contrasenya VNC actualitzada correctament."

# -----------------------------------------------------------------------------
# 3. Reiniciar serveis
# -----------------------------------------------------------------------------

log_info "Reiniciant x11vnc.service per aplicar la nova contrasenya..."
if systemctl is-active --quiet x11vnc.service 2>/dev/null; then
    systemctl restart x11vnc.service
    log_info "x11vnc.service reiniciat."
else
    log_warn "x11vnc.service no estava actiu. No s'ha reiniciat."
    log_warn "Revisa l'estat amb: systemctl status x11vnc.service"
fi

# El proxy noVNC no necessita reinici (no guarda cap contrasenya).
# La propera connexió des del navegador demanarà la nova contrasenya
# (el localStorage amb la contrasenya antiga s'esborra automàticament
#  si falla l'autenticació, gràcies a la lògica de vnc_iframe.html).

echo ""
log_info "Fet! La nova contrasenya VNC ja està activa."
log_info "Recorda que els navegadors que tinguin la contrasenya antiga al"
log_info "localStorage la reintentaran, fallaran, i automàticament"
log_info "demanaran la nova contrasenya."
