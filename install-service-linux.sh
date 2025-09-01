#!/bin/bash

echo "Instal·lant palam-dash com a servei systemd en Linux..."
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

# Crea el directori del servei
mkdir -p /opt/palamos-dashboard

# Copia l'aplicació
echo "Copiant aplicació..."
cp -r dist/linux-unpacked/* /opt/palamos-dashboard/

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

# Usuari i HOME del servei
SERVICE_USER="palamos-dashboard"
SERVICE_HOME="/var/lib/$SERVICE_USER"

echo "Creant / validant usuari del servei..."
if id -u "$SERVICE_USER" >/dev/null 2>&1; then
    # Si existeix però no té HOME, el creem
    CURRENT_HOME=$(getent passwd "$SERVICE_USER" | cut -d: -f6)
    if [ ! -d "$SERVICE_HOME" ]; then
        mkdir -p "$SERVICE_HOME"
    fi
    if [ "$CURRENT_HOME" != "$SERVICE_HOME" ]; then
        usermod -d "$SERVICE_HOME" "$SERVICE_USER"
    fi
else
    useradd -r -d "$SERVICE_HOME" -s /usr/sbin/nologin -m "$SERVICE_USER"
fi

# Directori de cache fontconfig per evitar "Font config error: No writable cache directories"
mkdir -p "$SERVICE_HOME/.cache/fontconfig"
chown -R $SERVICE_USER:$SERVICE_USER "$SERVICE_HOME"

# Canvia la propietat dels fitxers de l'aplicació
chown -R $SERVICE_USER:$SERVICE_USER /opt/palamos-dashboard
chmod +x /opt/palamos-dashboard/palam-dash

# Directori de logs
LOG_DIR="/var/log/palamos-dashboard"
mkdir -p "$LOG_DIR"
chown palamos-dashboard:palamos-dashboard "$LOG_DIR"
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
User=palamos-dashboard
Group=palamos-dashboard
Environment=XDG_CACHE_HOME=/var/lib/palamos-dashboard/.cache
Environment=HOME=/var/lib/palamos-dashboard
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/\$SUDO_USER/.Xauthority
WorkingDirectory=/opt/palamos-dashboard
ExecStart=/opt/palamos-dashboard/run.sh
ExecStartPre=/bin/sh -c 'if [ -n "${DISPLAY}" ] && [ ! -S "/tmp/.X11-unix/${DISPLAY#:}" ]; then echo "DISPLAY definit però no disponible"; fi'
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
    echo "Servei creat correctament!"
    echo
    echo "Per a iniciar el servei, executa:"
    echo "sudo systemctl start palamos-dashboard"
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
