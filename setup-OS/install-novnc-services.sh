#!/bin/bash
# =============================================================================
# install-novnc-services.sh — Instal·lador de x11vnc + noVNC per a PalamOS
# =============================================================================
#
# Aquest script instal·la i configura:
#   1. x11vnc (servidor VNC que captura la pantalla X11 de l'alumne)
#   2. noVNC (proxy WebSocket per accedir al VNC des del navegador)
#
# REQUISITS PREVIS (veure setup.md):
#   - Sistema Debian/Ubuntu amb GNOME + GDM
#   - X11 forçat (WaylandEnable=false)
#   - Usuari alumne amb sessió gràfica iniciada (display X detectat)
#   - Git, Node.js i npm instal·lats
#
# ÚS:
#   sudo ./install-novnc-services.sh --password CONTRASENYA [OPCIONS]
#
# OPCIONS:
#   --password PWD       Contrasenya VNC (obligatori)
#   --user USER          Usuari de la sessió X a capturar (default: alumne)
#   --display :N         Display X a capturar (default: autodetectar o :1)
#   --novnc-user USER    Usuari que executarà el proxy noVNC (default: qui
#                        executa l'script, normalment super)
#   --novnc-dir DIR      Directori on clonar/instal·lar noVNC
#                        (default: $HOME/noVNC de novnc-user)
#   --help               Mostra aquesta ajuda
#
# EXEMPLES:
#   sudo ./install-novnc-services.sh --password patata123
#   sudo ./install-novnc-services.sh --password patata123 --display :1
#   sudo ./install-novnc-services.sh --password patata123 --user alumne --display :1
#
# L'script l'ha d'executar l'usuari administrador (super) amb sudo.
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# 0. Configuració inicial i parsing d'arguments
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NOVNC_ASSETS="$SCRIPT_DIR/novnc"

# Valors per defecte
VNC_USER="alumne"
DISPLAY_VAL=""                        # Buit = autodetectar
NOVNC_USER="$(whoami)"               # Qui executa l'script (super)
NOVNC_DIR=""                          # Buit = $HOME/noVNC del novnc-user
VNC_PASSWORD=""

# Colors per als missatges
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[AVÍS]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

usage() {
    head -40 "$0" | grep '^#' | sed 's/^# \?//'
    exit 0
}

# Parsejar arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --password)
            VNC_PASSWORD="$2"
            shift 2
            ;;
        --user)
            VNC_USER="$2"
            shift 2
            ;;
        --display)
            DISPLAY_VAL="$2"
            shift 2
            ;;
        --novnc-user)
            NOVNC_USER="$2"
            shift 2
            ;;
        --novnc-dir)
            NOVNC_DIR="$2"
            shift 2
            ;;
        --help|-h)
            usage
            ;;
        *)
            log_error "Opció desconeguda: $1"
            usage
            ;;
    esac
done

# Validar paràmetres obligatoris
if [ -z "$VNC_PASSWORD" ]; then
    log_error "Cal especificar --password"
    echo ""
    usage
fi

# Comprovar que s'executa com a root (sudo)
if [ "$(id -u)" -ne 0 ]; then
    log_error "Aquest script s'ha d'executar amb sudo (com a root)"
    exit 1
fi

echo "============================================="
echo "  Instal·lador x11vnc + noVNC per PalamOS"
echo "============================================="
echo ""

# -----------------------------------------------------------------------------
# 1. Detectar display X de l'usuari
# -----------------------------------------------------------------------------

if [ -z "$DISPLAY_VAL" ]; then
    log_info "Auto-detectant el display X de l'usuari '$VNC_USER'..."

    # Intentar amb w (funciona des de root)
    if command -v w &>/dev/null; then
        DISPLAY_VAL=$(w -h "$VNC_USER" 2>/dev/null | awk '{print $3}' | grep '^:' | head -1)
    fi

    # Si w no funciona, mirar els sockets X11
    if [ -z "$DISPLAY_VAL" ] && [ -d /tmp/.X11-unix ]; then
        DISPLAY_VAL=$(ls /tmp/.X11-unix/X* 2>/dev/null | sed 's|.*/X|:|' | sort -V | tail -1)
    fi

    if [ -z "$DISPLAY_VAL" ]; then
        log_error "No s'ha pogut detectar cap display X11."
        log_error ""
        log_error "  Comprova-ho manualment des de l'usuari '$VNC_USER':"
        log_error "    echo \$DISPLAY"
        log_error "    w"
        log_error ""
        log_error "  Després torna a executar l'script amb:"
        log_error "    sudo $0 --password PWD --display :1"
        log_error ""
        exit 1
    fi

    log_info "Display detectat: $DISPLAY_VAL"
else
    log_info "Display especificat manualment: $DISPLAY_VAL"
fi

# Obtenir UID de l'usuari VNC
USER_UID=$(id -u "$VNC_USER" 2>/dev/null || true)
if [ -z "$USER_UID" ]; then
    log_error "L'usuari '$VNC_USER' no existeix. Crea'l primer (veure setup.md)."
    exit 1
fi
log_info "UID de '$VNC_USER': $USER_UID"

# -----------------------------------------------------------------------------
# 2. Determinar directori de noVNC
# -----------------------------------------------------------------------------

if [ -z "$NOVNC_DIR" ]; then
    # Obtenir el HOME del novnc-user
    NOVNC_HOME=$(getent passwd "$NOVNC_USER" | cut -d: -f6 2>/dev/null || echo "/home/$NOVNC_USER")
    NOVNC_DIR="$NOVNC_HOME/noVNC"
fi
log_info "Directori noVNC: $NOVNC_DIR"
log_info "Usuari noVNC: $NOVNC_USER (executa el proxy)"
log_info "Usuari VNC:   $VNC_USER (la seva pantalla es captura)"

# -----------------------------------------------------------------------------
# 3. Instal·lar x11vnc
# -----------------------------------------------------------------------------

echo ""
log_info "========== Instal·lant x11vnc =========="

if ! command -v x11vnc &>/dev/null; then
    log_info "Instal·lant paquet x11vnc via apt..."
    apt update -qq
    apt install -y x11vnc
    log_info "x11vnc instal·lat: $(x11vnc --version 2>&1 | head -1)"
else
    log_info "x11vnc ja està instal·lat: $(x11vnc --version 2>&1 | head -1)"
fi

# Crear fitxer de contrasenya
log_info "Creant fitxer de contrasenya VNC a /etc/x11vnc.pwd..."
x11vnc -storepasswd "$VNC_PASSWORD" /etc/x11vnc.pwd
chmod 644 /etc/x11vnc.pwd
log_info "Contrasenya VNC desada."

# -----------------------------------------------------------------------------
# 4. Instal·lar i configurar x11vnc.service
# -----------------------------------------------------------------------------

log_info "Instal·lant servei systemd x11vnc.service..."

# Generar el fitxer de servei a partir de la plantilla
sed -e "s|{{USER}}|$VNC_USER|g" \
    -e "s|{{UID}}|$USER_UID|g" \
    -e "s|{{DISPLAY}}|$DISPLAY_VAL|g" \
    "$NOVNC_ASSETS/x11vnc.service" > /etc/systemd/system/x11vnc.service

chmod 644 /etc/systemd/system/x11vnc.service
log_info "Fitxer de servei creat: /etc/systemd/system/x11vnc.service"

# -----------------------------------------------------------------------------
# 5. Instal·lar noVNC
# -----------------------------------------------------------------------------

echo ""
log_info "========== Instal·lant noVNC =========="

if [ ! -d "$NOVNC_DIR" ]; then
    log_info "Clonant noVNC des de GitHub..."
    mkdir -p "$(dirname "$NOVNC_DIR")"
    # Canviar al propietari correcte abans de clonar
    chown "$NOVNC_USER:$(id -gn "$NOVNC_USER")" "$(dirname "$NOVNC_DIR")" 2>/dev/null || true
    
    # Clonar com a l'usuari noVNC perquè els fitxers tinguin el propietari correcte
    sudo -u "$NOVNC_USER" git clone https://github.com/novnc/noVNC.git "$NOVNC_DIR"
    log_info "noVNC clonat a $NOVNC_DIR"
else
    log_info "noVNC ja existeix a $NOVNC_DIR, no es clona de nou."
fi

# Instal·lar dependències npm
if [ -f "$NOVNC_DIR/package.json" ]; then
    log_info "Instal·lant dependències npm..."
    cd "$NOVNC_DIR"
    sudo -u "$NOVNC_USER" npm install --silent
    log_info "Dependències npm instal·lades."
else
    log_error "No s'ha trobat package.json a $NOVNC_DIR. El clon pot haver fallat."
    exit 1
fi

# -----------------------------------------------------------------------------
# 6. Copiar vnc_iframe.html personalitzat
# -----------------------------------------------------------------------------

log_info "Copiant fitxer vnc_iframe.html personalitzat..."
if [ -f "$NOVNC_ASSETS/vnc_iframe.html" ]; then
    cp "$NOVNC_ASSETS/vnc_iframe.html" "$NOVNC_DIR/vnc_iframe.html"
    chown "$NOVNC_USER:$(id -gn "$NOVNC_USER")" "$NOVNC_DIR/vnc_iframe.html"
    log_info "vnc_iframe.html copiat (suporta ?view=true per bloquejar interacció)."
else
    log_warn "No s'ha trobat $NOVNC_ASSETS/vnc_iframe.html. S'usarà l'original de noVNC."
fi

# -----------------------------------------------------------------------------
# 7. Instal·lar i configurar novnc-proxy.service
# -----------------------------------------------------------------------------

log_info "Instal·lant servei systemd novnc-proxy.service..."

# Generar el fitxer de servei a partir de la plantilla
sed -e "s|{{USER}}|$NOVNC_USER|g" \
    -e "s|{{NOVNC_DIR}}|$NOVNC_DIR|g" \
    "$NOVNC_ASSETS/novnc-proxy.service" > /etc/systemd/system/novnc-proxy.service

chmod 644 /etc/systemd/system/novnc-proxy.service
log_info "Fitxer de servei creat: /etc/systemd/system/novnc-proxy.service"

# -----------------------------------------------------------------------------
# 8. Crear directori de logs
# -----------------------------------------------------------------------------

log_info "Creant directori de logs..."
mkdir -p /var/log/palamos-dashboard
chown "$NOVNC_USER:$(id -gn "$NOVNC_USER")" /var/log/palamos-dashboard 2>/dev/null || true
log_info "Directori creat: /var/log/palamos-dashboard"

# -----------------------------------------------------------------------------
# 9. Activar i iniciar serveis
# -----------------------------------------------------------------------------

echo ""
log_info "========== Activant serveis =========="

systemctl daemon-reload

log_info "Activat x11vnc.service..."
systemctl enable x11vnc.service
systemctl start x11vnc.service
if systemctl is-active --quiet x11vnc.service; then
    log_info "x11vnc.service ACTIU. Port VNC: 5900"
else
    log_warn "x11vnc.service NO s'ha pogut iniciar. Comprova:"
    echo "       systemctl status x11vnc.service"
    echo "       journalctl -u x11vnc.service"
fi

log_info "Activat novnc-proxy.service..."
systemctl enable novnc-proxy.service
systemctl start novnc-proxy.service
if systemctl is-active --quiet novnc-proxy.service; then
    log_info "novnc-proxy.service ACTIU. Port WebSocket: 6080"
else
    log_warn "novnc-proxy.service NO s'ha pogut iniciar. Comprova:"
    echo "       systemctl status novnc-proxy.service"
    echo "       journalctl -u novnc-proxy.service"
fi

# -----------------------------------------------------------------------------
# 10. Resum final
# -----------------------------------------------------------------------------

echo ""
echo "============================================="
echo "  Instal·lació completada!"
echo "============================================="
echo ""
echo "  Serveis instal·lats:"
echo "    - x11vnc.service      (VNC al port 5900, usuari: $VNC_USER, display: $DISPLAY_VAL)"
echo "    - novnc-proxy.service (WebSocket al port 6080, usuari: $NOVNC_USER)"
echo ""
echo "  Fitxers clau:"
echo "    - /etc/x11vnc.pwd                     (contrasenya VNC)"
echo "    - /etc/systemd/system/x11vnc.service"
echo "    - /etc/systemd/system/novnc-proxy.service"
echo "    - $NOVNC_DIR/vnc_iframe.html          (iframe personalitzat)"
echo "    - /var/log/x11vnc.log"
echo "    - /var/log/palamos-dashboard/novnc.log"
echo ""
echo "  Per verificar:"
echo "    sudo systemctl status x11vnc.service"
echo "    sudo systemctl status novnc-proxy.service"
echo "    ss -tlnp | grep -E '5900|6080'"
echo ""
echo "  Prova d'accés:"
echo "    http://$(hostname -I | awk '{print $1}'):6080/vnc_iframe.html"
echo ""
