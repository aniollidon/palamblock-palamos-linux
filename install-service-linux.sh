#!/bin/bash

echo "Instal·lant palam-dash com a servei d'usuari systemd (obligatori --user)..."
echo "Opcions:"
echo "  --user <usuari>          (REQUERIT) Usuari existent que executarà el servei (unitat a ~/.config/systemd/user)"
echo "  --display <:N>           Forçar DISPLAY (per defecte :1)"
echo "  --wait-display <s>       (Opcional) Espera fins a <s> segons a que el socket X11 existeixi (defecte 30)"
echo
echo "Exemples:"
echo "  sudo ./install-service-linux.sh --user alumne --display :0"
echo "  sudo ./install-service-linux.sh --user alumne --display :0 --wait-display 60"
echo

# Comprova si l'aplicació està compilada
if [ ! -f "dist/linux-unpacked/palam-dash" ]; then
    echo "Error: L'aplicació no està compilada. Executa 'npm run build' primer."
    exit 1
fi

# Comprova si estem executant com a root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Aquest script ha de ser executat com a root (sudo)"
    exit 1
fi

# Paràmetres
SERVICE_RUN_USER=""        # Obligatori amb --user
DISPLAY_VALUE=":1"         # DISPLAY per defecte
WAIT_DISPLAY_SECS=10        # Temps d'espera per socket X11

while [ $# -gt 0 ]; do
    case "$1" in
        --user|--as-user)
            # --as-user mantingut per compatibilitat retro, però marcat obsolet
            [ "$1" = "--as-user" ] && echo "Avís: --as-user està obsolet, utilitza --user" >&2
            shift
            if [ -z "${1:-}" ]; then echo "Error: falta valor per --user"; exit 1; fi
            SERVICE_RUN_USER="$1"
            ;;
        --display)
            shift
            if [ -z "${1:-}" ]; then echo "Error: falta valor per --display"; exit 1; fi
            DISPLAY_VALUE="$1"
            ;;
        --wait-display)
            shift
            if [ -z "${1:-}" ]; then echo "Error: falta valor per --wait-display"; exit 1; fi
            WAIT_DISPLAY_SECS="$1"
            ;;
        *)
            echo "Argument desconegut: $1"; exit 1;;
    esac
    shift
done

if [ -z "$SERVICE_RUN_USER" ]; then
    echo "Error: has d'especificar --user <usuari>"; exit 1
fi

# Comprova usuari existent
if ! id -u "$SERVICE_RUN_USER" >/dev/null 2>&1; then
    echo "Error: l'usuari $SERVICE_RUN_USER no existeix"; exit 1
fi

# Crea el directori del servei
mkdir -p /opt/palamos-dashboard

# Copia l'aplicació
echo "Copiant aplicació..."
cp -r dist/linux-unpacked/* /opt/palamos-dashboard/

# Copia / crea run.sh i fixa DISPLAY
EXEC_START="/opt/palamos-dashboard/run.sh"
if [ -f "run.sh" ]; then
    echo "Copiant run.sh i establint DISPLAY=$DISPLAY_VALUE..."
    cp run.sh /opt/palamos-dashboard/run.sh
    # Intenta substituir línia DISPLAY_VAL; si no existeix, afegeix-la
    if grep -q '^DISPLAY_VAL=' /opt/palamos-dashboard/run.sh; then
        sed -i "s|^DISPLAY_VAL=.*|DISPLAY_VAL=\"$DISPLAY_VALUE\"|" /opt/palamos-dashboard/run.sh
    else
        echo "DISPLAY_VAL=\"$DISPLAY_VALUE\"" >> /opt/palamos-dashboard/run.sh
    fi
else
    echo "Generant run.sh (plantilla) amb DISPLAY=$DISPLAY_VALUE..."
    cat > /opt/palamos-dashboard/run.sh << RSEOF
#!/bin/bash
set -euo pipefail
APP="/opt/palamos-dashboard/palam-dash"
DISPLAY_VAL="$DISPLAY_VALUE"
export DISPLAY="${DISPLAY_VAL}"
echo "[run.sh] Iniciant amb DISPLAY=${DISPLAY}"
exec "$APP"
RSEOF
fi
chmod +x /opt/palamos-dashboard/run.sh

# Script previ per esperar DISPLAY (evitem quoting complex a systemd unit)
cat > /opt/palamos-dashboard/prestart-wait-display.sh << PWDEOF
#!/bin/bash
LIMIT=${WAIT_DISPLAY_SECS}
echo "[prestart] Esperant socket X11 per DISPLAY=$DISPLAY (fins a ${LIMIT}s)" >&2
for i in $(seq 1 ${WAIT_DISPLAY_SECS}); do
    SOCK="/tmp/.X11-unix/${DISPLAY#:}"
    if [ -S "$SOCK" ]; then
        echo "[prestart] Socket X11 disponible: $SOCK" >&2
        exit 0
    fi
    sleep 1
done
echo "[prestart] NO s'ha trobat socket X11 després de ${LIMIT}s" >&2
exit 0  # No bloquegem l'arrencada; només avís
PWDEOF
chmod +x /opt/palamos-dashboard/prestart-wait-display.sh

# Crea l'arxiu .env al directori del servei
echo "Copiant configuració (.env)..."
if [ -f ".env" ]; then
    cp .env /opt/palamos-dashboard/.env
elif [ -f "env.example" ]; then
    echo "Avís: .env no trobat. Usant env.example com a base."
    cp env.example /opt/palamos-dashboard/.env
else
    echo "Avís: No s'ha trobat cap fitxer .env ni env.example. Continuant sense configuració."
fi

echo "Configurant permisos perquè el servei el gestioni l'usuari: $SERVICE_RUN_USER"
chown -R $SERVICE_RUN_USER:$SERVICE_RUN_USER /opt/palamos-dashboard
chmod +x /opt/palamos-dashboard/palam-dash
SERVICE_HOME=$(getent passwd "$SERVICE_RUN_USER" | cut -d: -f6)

USER_HOME=$(getent passwd "$SERVICE_RUN_USER" | cut -d: -f6)
USER_UNIT_DIR="$USER_HOME/.config/systemd/user"
mkdir -p "$USER_UNIT_DIR"
chown -R $SERVICE_RUN_USER:$SERVICE_RUN_USER "$USER_HOME/.config/systemd"

# Logs dins ~/.local/share/palamamos-dashboard per evitar permissos root
USER_LOG_DIR="$USER_HOME/.local/share/palamamos-dashboard/logs"
mkdir -p "$USER_LOG_DIR"
chown -R $SERVICE_RUN_USER:$SERVICE_RUN_USER "$USER_HOME/.local" "$USER_LOG_DIR"

echo "Creant servei d'usuari (només per a $SERVICE_RUN_USER)..."
cat > "$USER_UNIT_DIR/palamos-dashboard.service" << EOF
[Unit]
Description=palam-dash Service (user $SERVICE_RUN_USER)
After=network.target graphical-session.target
Wants=network-online.target

[Service]
Type=simple
Environment=DISPLAY=$DISPLAY_VALUE
WorkingDirectory=/opt/palamos-dashboard
ExecStartPre=/opt/palamos-dashboard/prestart-wait-display.sh
ExecStart=/opt/palamos-dashboard/run.sh
Restart=always
RestartSec=10
StandardOutput=append:$USER_LOG_DIR/app.log
StandardError=append:$USER_LOG_DIR/error.log

[Install]
WantedBy=default.target
EOF
chown $SERVICE_RUN_USER:$SERVICE_RUN_USER "$USER_UNIT_DIR/palamos-dashboard.service"

UID_NUM=$(id -u "$SERVICE_RUN_USER")
USER_RUNTIME_DIR="/run/user/$UID_NUM"
ENABLE_OK=false

echo "Verificant sessió d'usuari (XDG_RUNTIME_DIR)..."
if [ -d "$USER_RUNTIME_DIR" ]; then
    echo "Directori $USER_RUNTIME_DIR present. Intentant habilitar unitat d'usuari..."
    if sudo -u "$SERVICE_RUN_USER" XDG_RUNTIME_DIR="$USER_RUNTIME_DIR" systemctl --user daemon-reload 2>/dev/null && \
       sudo -u "$SERVICE_RUN_USER" XDG_RUNTIME_DIR="$USER_RUNTIME_DIR" systemctl --user enable palamos-dashboard.service 2>/dev/null; then
        ENABLE_OK=true
    else
        echo "No s'ha pogut habilitar ara (potser encara no hi ha bus DBus de sessió)." >&2
    fi
else
    echo "Encara no existeix $USER_RUNTIME_DIR (no hi ha login de l'usuari). Deixem unitat en estat pendent." >&2
fi

echo "Servei d'usuari creat per: $SERVICE_RUN_USER (estat: $( [ "$ENABLE_OK" = true ] && echo 'habilitat' || echo 'pendent' ))"
echo "Creant servei addicional novnc-proxy (si existeix /home/super/noVNC/utils/novnc_proxy)..."
    if [ -x /home/super/noVNC/utils/novnc_proxy ]; then
        cat > /etc/systemd/system/novnc-proxy.service << NOVNC
[Unit]
Description=noVNC proxy (localhost:5900 -> websocket 6080)
After=network.target

[Service]
Type=simple
User=super
Group=super
WorkingDirectory=/home/super/noVNC
ExecStart=/home/super/noVNC/utils/novnc_proxy --vnc localhost:5900 --listen 6080
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/palamos-dashboard/novnc.log
StandardError=append:/var/log/palamos-dashboard/novnc.log

[Install]
WantedBy=multi-user.target
NOVNC
        systemctl daemon-reload
        systemctl enable novnc-proxy.service
        echo "Servei novnc-proxy creat i habilitat. Inicia'l amb: sudo systemctl start novnc-proxy"
    else
        echo "No s'ha trobat /home/super/noVNC/utils/novnc_proxy. Ometent servei novnc-proxy."
    fi
echo
echo "Com a $SERVICE_RUN_USER després del primer login executa (si estat pendent):"
if [ "$ENABLE_OK" = false ]; then
    echo "  systemctl --user daemon-reload"
    echo "  systemctl --user enable --now palamos-dashboard"
else
    echo "  systemctl --user start palamos-dashboard (ja habilitat)"
fi
echo "Per parar:"
echo "  systemctl --user stop palamos-dashboard"
echo "Estat:"
echo "  systemctl --user status palamos-dashboard"
echo "Logs: tail -f $USER_LOG_DIR/app.log"
echo "  journalctl --user -u palamos-dashboard -f"
echo
echo "Per deshabilitar:"
echo "  systemctl --user disable palamos-dashboard"

echo
echo "Instal·lació completada."
