#!/bin/bash

echo "Instal·lant palam-dash com a servei d'usuari systemd (obligatori --user)..."
echo "Opcions:"
echo "  --user <usuari>          (REQUERIT) Usuari existent que executarà el servei (unitat a ~/.config/systemd/user)"
echo "  --display <:N>           Forçar DISPLAY (per defecte :1)"
echo
echo "Exemples:"
echo "  sudo ./install-service-linux.sh --user alumne --display :0"
echo "  sudo ./install-service-linux.sh --user alumne --display :0"
echo

# Comprova si l'aplicació està compilada (busca l'AppImage)
APPIMAGE_FILE=$(ls -t dist/*.AppImage 2>/dev/null | head -n1)
if [ -z "$APPIMAGE_FILE" ]; then
    echo "Error: No s'ha trobat cap AppImage a dist/. Executa 'npm run build' primer."
    exit 1
fi
echo "AppImage trobada: $APPIMAGE_FILE"

# Comprova si estem executant com a root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Aquest script ha de ser executat com a root (sudo)"
    exit 1
fi

# Comprova/instal·la libvips (necessari per a sharp/screenshots)
if ! ldconfig -p 2>/dev/null | grep -q libvips; then
    echo "libvips no detectat. Instal·lant libvips42 (necessari per a les captures de pantalla)..."
    apt-get update -qq
    apt-get install -y libvips42
    echo "libvips42 instal·lat."
fi

# Paràmetres
SERVICE_RUN_USER=""        # Obligatori amb --user
DISPLAY_VALUE=":1"         # DISPLAY per defecte

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

# Ho parem tot i esborrem directoris
echo "Aturant serveis anteriors i netejant directoris..."
if [ -d "/data/palamos-dashboard" ]; then
    # Aturem el servei com a l'usuari especificat
    UID_NUM=$(id -u "$SERVICE_RUN_USER")
    USER_RUNTIME_DIR="/run/user/$UID_NUM"
    
    if [ -d "$USER_RUNTIME_DIR" ] && systemctl --user -M "$SERVICE_RUN_USER@" status palamos-dashboard.service &>/dev/null; then
        echo "Aturant servei existent per a l'usuari $SERVICE_RUN_USER..."
        systemctl --user -M "$SERVICE_RUN_USER@" stop palamos-dashboard.service
    else
        echo "No s'ha trobat cap servei actiu per a l'usuari $SERVICE_RUN_USER o no té sessió activa."
    fi
    
    # Esborrem el directori
    echo "Esborrant directori d'instal·lació anterior..."
    rm -rf /data/palamos-dashboard
fi

# Crea el directori del servei
mkdir -p /data/palamos-dashboard

# Copia l'AppImage
echo "Copiant AppImage..."
cp "$APPIMAGE_FILE" /data/palamos-dashboard/palam-dash.AppImage
chmod +x /data/palamos-dashboard/palam-dash.AppImage

# Copia els scripts
echo "Copia els scripts..."
cp -r scripts/* /data/palamos-dashboard/scripts/

# Copia / crea run.sh i fixa DISPLAY
EXEC_START="/data/palamos-dashboard/run.sh"
if [ -f "run.sh" ]; then
    echo "Copiant run.sh i establint DISPLAY=$DISPLAY_VALUE..."
    cp run.sh /data/palamos-dashboard/run.sh
    # Intenta substituir línia DISPLAY_VAL; si no existeix, afegeix-la
    if grep -q '^DISPLAY_VAL=' /data/palamos-dashboard/run.sh; then
        sed -i "s|^DISPLAY_VAL=.*|DISPLAY_VAL=\"$DISPLAY_VALUE\"|" /data/palamos-dashboard/run.sh
    else
        echo "DISPLAY_VAL=\"$DISPLAY_VALUE\"" >> /data/palamos-dashboard/run.sh
    fi
    # Actualitzar ruta APP al run.sh copiat
    sed -i "s|^APP=.*|APP=\"/data/palamos-dashboard/palam-dash.AppImage\"|" /data/palamos-dashboard/run.sh
else
    echo "Generant run.sh (plantilla) amb DISPLAY=$DISPLAY_VALUE..."
    cat > /data/palamos-dashboard/run.sh << RSEOF
#!/bin/bash
set -euo pipefail
APP="/data/palamos-dashboard/palam-dash.AppImage"
DATA_DIR="/data/palamos-dashboard/data"
DISPLAY_VAL="$DISPLAY_VALUE"
WAIT_SECS=5

log(){ echo "[run.sh] \$*"; }

# Assegurar que les dades persistents (.user, .server) sobrevisquin a congelacions
# Electron guarda a ~/.config/palam-dash/, fem symlink a /data/
CONFIG_DIR="\$HOME/.config/palam-dash"
mkdir -p "\$DATA_DIR"
if [ ! -L "\$CONFIG_DIR" ] || [ "\$(readlink -f "\$CONFIG_DIR" 2>/dev/null)" != "\$DATA_DIR" ]; then
  rm -rf "\$CONFIG_DIR"
  mkdir -p "\$(dirname "\$CONFIG_DIR")"
  ln -sf "\$DATA_DIR" "\$CONFIG_DIR"
  log "Dades persistents: \$CONFIG_DIR -> \$DATA_DIR"
fi

export DISPLAY="\$DISPLAY_VAL"
X_SOCKET="/tmp/.X11-unix/X\${DISPLAY_VAL#:}"
if [ ! -S "\$X_SOCKET" ]; then
  log "Socket X per \$DISPLAY_VAL no existeix. Esperant fins \${WAIT_SECS}s..."
  for i in \$(seq 1 \$WAIT_SECS); do
    if [ -S "\$X_SOCKET" ]; then
      log "X disponible després de \${i}s"; break; fi
    sleep 1
  done
fi
if [ ! -S "\$X_SOCKET" ]; then
  log "ATENCIÓ: No s'ha trobat el socket X a \$DISPLAY_VAL. L'aplicació pot fallar."
fi

log "Iniciant applicació: \$APP"
exec "\$APP"
RSEOF
fi
chmod +x /data/palamos-dashboard/run.sh


# Crea l'arxiu .env al directori del servei
echo "Copiant configuració (.env)..."
if [ -f ".env" ]; then
    cp .env /data/palamos-dashboard/.env
elif [ -f "env.example" ]; then
    echo "Avís: .env no trobat. Usant env.example com a base."
    cp env.example /data/palamos-dashboard/.env
else
    echo "Avís: No s'ha trobat cap fitxer .env ni env.example. Continuant sense configuració."
fi

echo "Configurant permisos (seguretat: alumne només pot escriure a data/)..."
# Directori arrel: root:root, alumne només lectura (no pot esborrar fitxers)
chown root:root /data/palamos-dashboard
chmod 755 /data/palamos-dashboard

# run.sh, .env, scripts/: només lectura per a alumne
chown root:root /data/palamos-dashboard/run.sh /data/palamos-dashboard/.env 2>/dev/null || true
chmod 755 /data/palamos-dashboard/run.sh 2>/dev/null || true
chmod 644 /data/palamos-dashboard/.env 2>/dev/null || true
[ -d /data/palamos-dashboard/scripts ] && chown -R root:root /data/palamos-dashboard/scripts && chmod -R 755 /data/palamos-dashboard/scripts

# AppImage: root:alumne 775 (alumne pot actualitzar-la però no esborrar-la del directori)
chown root:$SERVICE_RUN_USER /data/palamos-dashboard/palam-dash.AppImage
chmod 775 /data/palamos-dashboard/palam-dash.AppImage

# data/: alumne hi pot escriure lliurement (.user, .server, screenshots...)
mkdir -p /data/palamos-dashboard/data
chown -R $SERVICE_RUN_USER:$SERVICE_RUN_USER /data/palamos-dashboard/data
chmod 755 /data/palamos-dashboard/data
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
WorkingDirectory=/data/palamos-dashboard
ExecStart=/data/palamos-dashboard/run.sh
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

# L'AppImage és autònoma, no cal chrome-sandbox separat
echo "AppImage instal·lada. L'auto-update es gestiona via electron-updater."

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
