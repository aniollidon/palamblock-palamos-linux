#!/bin/bash

echo "Instal·lant palam-dash com a servei systemd en Linux..."
echo "Opció: --as-user <usuari_escriptori> per executar el servei amb un usuari existent (p.ex. alumne)"
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
SERVICE_RUN_USER="palamos-dashboard"   # Usuari per defecte (de sistema)
USE_EXISTING_USER=false
DISPLAY_VALUE=":1"  # DISPLAY per defecte

while [ $# -gt 0 ]; do
    case "$1" in
        --as-user)
            shift
            if [ -z "${1:-}" ]; then echo "Error: falta valor per --as-user"; exit 1; fi
            SERVICE_RUN_USER="$1"
            USE_EXISTING_USER=true
            ;;
        --display)
            shift
            if [ -z "${1:-}" ]; then echo "Error: falta valor per --display"; exit 1; fi
            DISPLAY_VALUE="$1"
            ;;
        *)
            echo "Argument desconegut: $1"; exit 1;;
    esac
    shift
done

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

if [ "$USE_EXISTING_USER" = true ]; then
    # Executarem amb un usuari d'escriptori existent
    if ! id -u "$SERVICE_RUN_USER" >/dev/null 2>&1; then
        echo "Error: l'usuari $SERVICE_RUN_USER no existeix"; exit 1; fi
    echo "Configurant servei per executar-se com a usuari existent: $SERVICE_RUN_USER"
    # Només assegurem permisos de lectura/execució
    chown -R $SERVICE_RUN_USER:$SERVICE_RUN_USER /opt/palamos-dashboard
    chmod +x /opt/palamos-dashboard/palam-dash
    SERVICE_HOME=$(getent passwd "$SERVICE_RUN_USER" | cut -d: -f6)
else
    # Usuari de sistema aïllat
    SERVICE_USER="$SERVICE_RUN_USER"
    SERVICE_HOME="/var/lib/$SERVICE_USER"
    echo "Creant / validant usuari de sistema: $SERVICE_USER"
    if id -u "$SERVICE_USER" >/dev/null 2>&1; then
            CURRENT_HOME=$(getent passwd "$SERVICE_USER" | cut -d: -f6)
            [ ! -d "$SERVICE_HOME" ] && mkdir -p "$SERVICE_HOME"
            [ "$CURRENT_HOME" != "$SERVICE_HOME" ] && usermod -d "$SERVICE_HOME" "$SERVICE_USER"
    else
            useradd -r -d "$SERVICE_HOME" -s /usr/sbin/nologin -m "$SERVICE_USER"
    fi
    mkdir -p "$SERVICE_HOME/.cache/fontconfig"
    chown -R $SERVICE_USER:$SERVICE_USER "$SERVICE_HOME"
    chown -R $SERVICE_USER:$SERVICE_USER /opt/palamos-dashboard
    chmod +x /opt/palamos-dashboard/palam-dash
fi

# Directori de logs
LOG_DIR="/var/log/palamos-dashboard"
mkdir -p "$LOG_DIR"
chown "$SERVICE_RUN_USER":"$SERVICE_RUN_USER" "$LOG_DIR"
chmod 750 "$LOG_DIR"

# Crea el fitxer de servei systemd
echo "Creant servei systemd (amb logs dedicats)..."
cat > /etc/systemd/system/palamos-dashboard.service << EOF
[Unit]
Description=palam-dash Service
After=network.target graphical.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_RUN_USER
Group=$SERVICE_RUN_USER
Environment=DISPLAY=$DISPLAY_VALUE
EOF

# Si usem usuari de sistema afegim caches pròpies; si és existent confiem en el seu HOME
if [ "$USE_EXISTING_USER" = true ]; then
    : # No fem res extra
else
cat >> /etc/systemd/system/palamos-dashboard.service << EOF
Environment=XDG_CACHE_HOME=$SERVICE_HOME/.cache
Environment=HOME=$SERVICE_HOME
EOF
fi

cat >> /etc/systemd/system/palamos-dashboard.service << EOF
WorkingDirectory=/opt/palamos-dashboard
ExecStart=/opt/palamos-dashboard/run.sh
ExecStartPre=/bin/sh -c 'if [ -n "${DISPLAY}" ] && [ ! -S "/tmp/.X11-unix/${DISPLAY#:}" ]; then echo "DISPLAY definit però no disponible"; fi'
PermissionsStartOnly=true
ExecStartPre=/bin/bash -c 'if [ -x /home/super/noVNC/utils/novnc_proxy ]; then if ! pgrep -f "novnc_proxy.*localhost:5900" >/dev/null; then echo "[service] iniciant noVNC proxy com root"; /home/super/noVNC/utils/novnc_proxy --vnc localhost:5900 --listen 6080 & sleep 1; else echo "[service] noVNC ja en execució"; fi; else echo "[service] noVNC no trobat"; fi'
Restart=always
RestartSec=10
StandardOutput=append:/var/log/palamos-dashboard/app.log
StandardError=append:/var/log/palamos-dashboard/error.log

[Install]
WantedBy=multi-user.target
EOF

# Recarrega systemd i habilita el servei
echo "Habilitant servei..."
systemctl daemon-reload
systemctl enable palamos-dashboard.service

if [ $? -eq 0 ]; then
    echo "Servei creat correctament! Usuari d'execució: $SERVICE_RUN_USER"
    echo
    echo "Per a iniciar el servei, executa:"
        echo "sudo systemctl start palamos-dashboard"
        if [ "$USE_EXISTING_USER" = true ]; then
            echo
            echo "Recorda: el servei s'executa com $SERVICE_RUN_USER. Ha de tenir sessió gràfica oberta per mostrar UI."
            echo "Si no vols forçar DISPLAY=:0, edita el fitxer /etc/systemd/system/palamos-dashboard.service i ajusta 'Environment=DISPLAY='"
        fi
    echo
    echo "Per a aturar el servei, executa:"
    echo "sudo systemctl stop palamos-dashboard"
    echo
    echo "Per a veure l'estat del servei:"
    echo "sudo systemctl status palamos-dashboard"
    echo
    echo "Per a veure els logs:"
    echo "sudo journalctl -u palamos-dashboard -f"
    echo
    echo "Per a deshabilitar el servei:"
    echo "sudo systemctl disable palamos-dashboard"
else
    echo "Error creant el servei systemd."
fi

echo
echo "Instal·lació completada."
