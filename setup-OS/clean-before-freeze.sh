#!/usr/bin/env bash
# Neteja logs, caches i dades temporals abans de congelar una plantilla Examen.

set -euo pipefail

TARGET_USER="alumne"

usage() {
    cat <<'EOF'
Us:
  sudo ./clean-before-freeze.sh [--user USUARI]

Opcions:
  --user USUARI  Usuari de l'alumne que es neteja (default: alumne)
  --help, -h     Mostra aquesta ajuda
EOF
}

log_info() {
    echo "[INFO] $*"
}

remove_contents() {
    local directory="$1"

    if [[ -d "$directory" ]]; then
        find "$directory" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    fi
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --user)
            if [[ $# -lt 2 || -z "$2" ]]; then
                echo "ERROR: --user necessita un nom d'usuari." >&2
                exit 1
            fi
            TARGET_USER="$2"
            shift 2
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "ERROR: Opcio desconeguda: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ "$(id -u)" -ne 0 ]]; then
    echo "ERROR: Executa aquest script amb sudo." >&2
    exit 1
fi

if ! id "$TARGET_USER" &>/dev/null; then
    echo "ERROR: L'usuari '$TARGET_USER' no existeix." >&2
    exit 1
fi

USER_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
USER_GROUP="$(id -gn "$TARGET_USER")"

if [[ -z "$USER_HOME" || ! -d "$USER_HOME" ]]; then
    echo "ERROR: No s'ha trobat el directori home de '$TARGET_USER'." >&2
    exit 1
fi

echo "============================================="
echo "  Neteja abans de congelar PalamOS Examen"
echo "============================================="
echo "Usuari: $TARGET_USER ($USER_HOME)"
echo ""

log_info "Netejant cache i llistes de paquets APT..."
apt-get clean
rm -rf -- /var/lib/apt/lists/*

log_info "Netejant fitxers temporals segons la politica del sistema..."
systemd-tmpfiles --clean || log_info "Avís: systemd-tmpfiles no disponible, es continua..."

log_info "Netejant cache, paperera i histories de '$TARGET_USER'..."
remove_contents "$USER_HOME/.cache"
remove_contents "$USER_HOME/.local/share/Trash"
remove_contents "$USER_HOME/.thumbnails"
rm -f -- \
    "$USER_HOME/.bash_history" \
    "$USER_HOME/.python_history" \
    "$USER_HOME/.local/share/recently-used.xbel" \
    "$USER_HOME/.wget-hsts" \
    "$USER_HOME/.lesshst" \
    "$USER_HOME/.viminfo"

log_info "Netejant caches de Brave, Firefox i VS Code..."

for profile_root in \
    "$USER_HOME/.config/BraveSoftware/Brave-Browser" \
    "$USER_HOME/.config/google-chrome" \
    "$USER_HOME/.mozilla/firefox"; do
    if [[ -d "$profile_root" ]]; then
        find "$profile_root" -type d \
            \( -name Cache -o -name "Code Cache" -o -name GPUCache -o -name CacheStorage -o -name cache2 -o -name startupCache \) \
            -prune -exec rm -rf -- {} +
    fi
done

for cache_dir in \
    "$USER_HOME/.config/Code/Cache" \
    "$USER_HOME/.config/Code/CachedData" \
    "$USER_HOME/.config/Code/GPUCache" \
    "$USER_HOME/.config/Code/Crashpad" \
    "$USER_HOME/.config/Code/logs" \
    "$USER_HOME/.config/Code/User/workspaceStorage" \
    "$USER_HOME/.config/Code/Backups"; do
    rm -rf -- "$cache_dir"
done

log_info "Netejant cache de root..."
remove_contents "/root/.cache"
rm -f -- /root/.bash_history

log_info "Netejant logs del sistema..."
journalctl --rotate || log_info "Avís: journalctl --rotate ha fallat, es continua..."
journalctl --vacuum-time=1s || log_info "Avís: journalctl --vacuum-time=1s ha fallat, es continua..."
find /var/log -type f ! -path '/var/log/journal/*' -exec truncate -s 0 {} +

log_info "Netejant /tmp i /var/tmp (preservant sockets X11)..."
find /tmp -mindepth 1 -maxdepth 1 \
    ! -name '.X*-lock' \
    ! -name 'systemd-private-*' \
    ! -path '/tmp/.X11-unix' \
    ! -path '/tmp/.font-unix' \
    ! -path '/tmp/.ICE-unix' \
    ! -path '/tmp/.Test-unix' \
    -exec rm -rf -- {} + 2>/dev/null || true
find /var/tmp -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + 2>/dev/null || true

log_info "Restablint propietaris de les dades de '$TARGET_USER'..."
chown -R "$TARGET_USER:$USER_GROUP" "$USER_HOME/.cache" "$USER_HOME/.local" 2>/dev/null || true

echo ""
echo "Neteja acabada. Comprova la plantilla i executa freeze-home.sh per congelar-la (s'aplica en reiniciar)."