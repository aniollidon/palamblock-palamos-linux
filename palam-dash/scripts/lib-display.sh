#!/bin/bash
# Llibreria compartida (cal fer-ne "source"): detecta en temps d'execució el display X
# de la sessió gràfica d'un usuari i exporta DISPLAY i XAUTHORITY.
#
# Ús:
#   source /data/palamos-dashboard/scripts/lib-display.sh
#   detect_display [timeout_segons] [usuari] || exit 1
#
# L'usuari per defecte és SUDO_USER (si s'executa amb sudo) o l'usuari actual.
# Si DISPLAY ja apunta a un display viu, es respecta.

_display_viu() {
    local n="${1#:}" sockets
    n="${n%%.*}"
    [ -S "/tmp/.X11-unix/X$n" ] || return 1
    command -v ss > /dev/null 2>&1 || return 0
    # Evita sockets orfes: cal que algú hi estigui escoltant
    sockets=$(ss -xl 2> /dev/null)
    [[ "$sockets" == *"/tmp/.X11-unix/X$n "* ]]
}

# Displays candidats, per ordre de preferència (un per línia)
_display_candidats() {
    local user="$1" id s

    [ -n "${DISPLAY:-}" ] && echo "$DISPLAY"

    # Display de la sessió gràfica activa de l'usuari
    if command -v loginctl > /dev/null 2>&1; then
        for id in $(loginctl list-sessions --no-legend 2> /dev/null | awk -v u="$user" '$3 == u { print $1 }'); do
            loginctl show-session "$id" -p Active -p Display 2> /dev/null |
                awk -F= '$1 == "Active" { a = $2 } $1 == "Display" { d = $2 } END { if (a == "yes" && d != "") print d }'
        done
    fi

    # Sockets X propietat de l'usuari
    for s in $(ls /tmp/.X11-unix/X* 2> /dev/null | sort -V); do
        [ "$(stat -c %U "$s" 2> /dev/null)" = "$user" ] && echo ":${s##*X}"
    done
}

_detect_xauthority() {
    local user="$1" uid home f
    uid=$(id -u "$user" 2> /dev/null) || return 1
    home=$(getent passwd "$user" | cut -d: -f6)
    for f in "${XAUTHORITY:-}" "/run/user/$uid/gdm/Xauthority" "$home/.Xauthority" /run/user/$uid/.mutter-Xwaylandauth.*; do
        if [ -n "$f" ] && [ -r "$f" ]; then
            export XAUTHORITY="$f"
            return 0
        fi
    done
    return 1
}

detect_display() {
    local timeout="${1:-0}" user="${2:-${SUDO_USER:-$(id -un)}}" t=0 d
    while :; do
        for d in $(_display_candidats "$user"); do
            if _display_viu "$d"; then
                export DISPLAY="$d"
                _detect_xauthority "$user" || true
                return 0
            fi
        done
        [ "$t" -ge "$timeout" ] && return 1
        sleep 1
        t=$((t + 1))
    done
}
