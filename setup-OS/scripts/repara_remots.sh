#!/bin/bash

# Comprovem que hi hagi almenys 2 paràmetres (contrasenya + almenys 1 IP)
if [ $# -lt 2 ]; then
    echo "Ús: $0 <contrasenya_super> <ip1> [ip2] [ip3] ..."
    echo "Exemple: $0 laMevaContrasenya 192.168.1.10 192.168.1.11"
    exit 1
fi

# El primer paràmetre és la contrasenya
PASSWORD="$1"
shift  # Eliminem el primer paràmetre perquè quedin només les IPs

# Usuari super (root o l'usuari administrador)
USUARI="super"

# Comandes a executar remotament
COMANDES=$(cat <<'EOF'
# Neteja de extensió PalamBlock a Brave
rm -rf /home/alumne/.config/BraveSoftware/Brave-Browser/Default/Extensions/djdihbjaljagohkmfbjhacghcdplkhlh/
# Afegim el servidor sevundari de PalamBlock al fitxer .server2
echo https://palamblock.inspalamos.cat > /data/palamos-dashboard/data/.server2

# Evitar que la màquina se suspengui
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
mkdir -p /etc/systemd/logind.conf.d /etc/dconf/db/local.d/locks /etc/dconf/profile
printf "[Login]\nIdleAction=ignore\nHandleLidSwitch=ignore\nHandleLidSwitchExternalPower=ignore\nHandleSuspendKey=ignore\n" > /etc/systemd/logind.conf.d/nosuspend.conf
# Configuració GNOME per a tots els usuaris (dconf)
printf "[org/gnome/settings-daemon/plugins/power]\nsleep-inactive-ac-type='nothing'\nsleep-inactive-battery-type='nothing'\n" > /etc/dconf/db/local.d/00-nosuspend
printf "/org/gnome/settings-daemon/plugins/power/sleep-inactive-ac-type\n/org/gnome/settings-daemon/plugins/power/sleep-inactive-battery-type\n" > /etc/dconf/db/local.d/locks/nosuspend
[ -f /etc/dconf/profile/user ] || printf "user-db:user\nsystem-db:local\n" > /etc/dconf/profile/user
grep -q "system-db:local" /etc/dconf/profile/user || echo "system-db:local" >> /etc/dconf/profile/user
dconf update

# Bloqueig de GitHub Copilot via dnsmasq integrat a NetworkManager (dnsmasq-base)
mkdir -p /etc/NetworkManager/conf.d /etc/NetworkManager/dnsmasq.d
printf "[main]\ndns=dnsmasq\n" > /etc/NetworkManager/conf.d/00-dnsmasq.conf
printf "address=/githubcopilot.com/0.0.0.0\naddress=/githubcopilot.com/::\naddress=/copilot-proxy.githubusercontent.com/0.0.0.0\naddress=/copilot-proxy.githubusercontent.com/::\naddress=/origin-tracker.githubusercontent.com/0.0.0.0\naddress=/origin-tracker.githubusercontent.com/::\naddress=/copilot-telemetry.githubusercontent.com/0.0.0.0\naddress=/copilot-telemetry.githubusercontent.com/::\n" > /etc/NetworkManager/dnsmasq.d/nocopilot.conf
systemctl restart NetworkManager
EOF
)
# Codifiem les comandes en base64 per evitar problemes de cometes
COMANDES_B64=$(printf '%s' "$COMANDES" | base64 -w0)

# Comprovem que sshpass estigui instal·lat
if ! command -v sshpass &> /dev/null; then
    echo "ERROR: Cal instal·lar 'sshpass'. Prova:"
    echo "  sudo apt install sshpass"
    exit 1
fi

SSH_OPTS=(
    -o StrictHostKeyChecking=no
    -o UserKnownHostsFile=/dev/null
    -o ConnectTimeout=10
)
REPO_URL="https://raw.githubusercontent.com/aniollidon/palamblock-palamos-linux/refs/heads/master/setup-OS"
ESPERA_MAX=300  # segons màxims d'espera a que la màquina torni després d'un reinici

# Executa un text de comandes com a root a la màquina $IP (via base64 per evitar problemes de cometes)
executa_sudo() {
    local b64
    b64=$(printf '%s' "$1" | base64 -w0)
    sshpass -p "$PASSWORD" ssh "${SSH_OPTS[@]}" "$USUARI@$IP" \
        "sudo -S bash -c \"echo $b64 | base64 -d | bash\"" <<< "$PASSWORD"
}

# Reinicia la màquina i espera a que torni a respondre per SSH
reinicia_i_espera() {
    executa_sudo "systemctl reboot" > /dev/null 2>&1
    sleep 20  # donem temps a que s'aturi
    local t=0
    until sshpass -p "$PASSWORD" ssh "${SSH_OPTS[@]}" "$USUARI@$IP" true > /dev/null 2>&1; do
        sleep 5
        t=$((t + 5))
        if [ "$t" -ge "$ESPERA_MAX" ]; then
            echo "[ERROR] $IP no ha tornat després del reinici"
            return 1
        fi
    done
}

# Tipus de sistema de fitxers de /home a la màquina (overlay = congelada)
tipus_home() {
    sshpass -p "$PASSWORD" ssh "${SSH_OPTS[@]}" "$USUARI@$IP" "findmnt -no FSTYPE /home" 2> /dev/null
}

PARALEL=${PARALEL:-8}  # màquines processades alhora (es pot canviar: PARALEL=4 ./repara_remots.sh ...)
LOGDIR=$(mktemp -d /tmp/repara_remots.XXXXXX)

log() { echo "$(date +%H:%M:%S) $*"; }

# Processa una màquina. La sortida va a stdout (el pare hi afegeix el prefix [IP])
# i el resultat final s'escriu a $LOGDIR/<IP>.status
processa_ip() {
    local IP="$1"
    local STATUS="$LOGDIR/$IP.status"

    log "Connectant ..."
    local TIPUS
    TIPUS=$(tipus_home)
    if [ -z "$TIPUS" ]; then
        log "ERROR: no s'ha pogut connectar"
        echo "ERROR: no s'ha pogut connectar" > "$STATUS"
        return
    fi

    local CONGELADA=0
    if [ "$TIPUS" = "overlay" ]; then
        CONGELADA=1
        log "/home congelat: descongelant i reiniciant ..."
        if ! { executa_sudo "wget -q $REPO_URL/unfreeze-home.sh -O /tmp/unfreeze-home.sh && bash /tmp/unfreeze-home.sh" \
                && reinicia_i_espera; }; then
            log "ERROR: no s'ha pogut descongelar"
            echo "ERROR: no s'ha pogut descongelar" > "$STATUS"
            return
        fi
        if [ "$(tipus_home)" = "overlay" ]; then
            log "ERROR: continua congelada després de descongelar"
            echo "ERROR: continua congelada després de descongelar" > "$STATUS"
            return
        fi
        log "Descongelada"
    else
        log "/home no està congelat ($TIPUS): no es reinicia"
    fi

    log "Aplicant comandes ..."
    local RESULTAT="OK"
    if executa_sudo "$COMANDES"; then
        log "OK: comandes executades"
    else
        log "ERROR: han fallat les comandes"
        RESULTAT="ERROR: han fallat les comandes"
    fi

    if [ "$CONGELADA" -eq 1 ]; then
        log "Netejant, tornant a congelar i reiniciant ..."
        if ! { executa_sudo "wget -q $REPO_URL/clean-before-freeze.sh -O /tmp/clean-before-freeze.sh && bash /tmp/clean-before-freeze.sh && wget -q $REPO_URL/freeze-home.sh -O /tmp/freeze-home.sh && bash /tmp/freeze-home.sh" \
                && reinicia_i_espera; }; then
            log "ERROR: no s'ha pogut tornar a congelar: REVISA-LA MANUALMENT"
            echo "ERROR: no s'ha pogut tornar a congelar: REVISA-LA MANUALMENT" > "$STATUS"
            return
        fi
        if [ "$(tipus_home)" = "overlay" ]; then
            log "OK: congelada de nou"
        else
            log "ERROR: no ha quedat congelada: REVISA-LA MANUALMENT"
            echo "ERROR: no ha quedat congelada: REVISA-LA MANUALMENT" > "$STATUS"
            return
        fi
    fi

    echo "$RESULTAT" > "$STATUS"
}

echo "Màquines: $#  |  En paral·lel: $PARALEL  |  Logs: $LOGDIR"
echo

for IP in "$@"; do
    # Esperem que hi hagi lloc lliure
    while [ "$(jobs -rp | wc -l)" -ge "$PARALEL" ]; do
        wait -n
    done
    # Cada línia de sortida porta el prefix [IP] i es desa també a $LOGDIR/<IP>.log
    { processa_ip "$IP" 2>&1 | sed -u "s/^/[$IP] /" | tee "$LOGDIR/$IP.log"; } &
done
wait

echo
echo "=========================================="
echo "RESUM"
echo "=========================================="
FALLATS=0
for IP in "$@"; do
    R=$(cat "$LOGDIR/$IP.status" 2> /dev/null || echo "ERROR: sense resultat")
    printf '%-18s %s\n' "$IP" "$R"
    [ "$R" = "OK" ] || FALLATS=$((FALLATS + 1))
done
echo
echo "Logs detallats per màquina: $LOGDIR/<IP>.log"
echo "Procés finalitzat. Màquines amb error: $FALLATS"
[ "$FALLATS" -eq 0 ]
