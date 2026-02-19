#!/bin/bash

echo "Instal·lant dependències del sistema per a PalamOS Dashboard en Ubuntu..."
echo

# Actualitza la llista de paquets
echo "Actualitzant llista de paquets..."
sudo apt update

# Instal·la les dependències necessàries
echo "Instal·lant dependències..."

# Detecta la versió d'Ubuntu per escollir els paquets correctes
UBUNTU_VERSION=$(lsb_release -rs 2>/dev/null || echo "22.04")
UBUNTU_MAJOR=$(echo "$UBUNTU_VERSION" | cut -d. -f1)

# Paquets que canvien segons la versió d'Ubuntu
if [ "$UBUNTU_MAJOR" -ge 24 ]; then
    WEBKIT_PKG="libwebkit2gtk-4.1-dev"
    SECRET_PKG="libsecret-1-dev"
else
    WEBKIT_PKG="libwebkit2gtk-4.0-dev"
    SECRET_PKG="libgnome-keyring-dev libgconf-2-4 libgconf2-dev"
fi

sudo apt install -y \
    curl \
    wget \
    git \
    build-essential \
    libgtk-3-dev \
    $WEBKIT_PKG \
    libappindicator3-dev \
    librsvg2-dev \
    libnotify-dev \
    $SECRET_PKG \
    libxtst-dev \
    libxss-dev \
    libnss3-dev \
    libnspr4-dev \
    libasound2-dev \
    libatspi2.0-dev \
    libdrm-dev \
    libgbm-dev \
    libxcomposite-dev \
    libxdamage-dev \
    libxrandr-dev \
    libxfixes-dev \
    libxkbcommon-dev \
    libpango1.0-dev \
    libcairo2-dev \
    libgdk-pixbuf2.0-dev \
    libgtk2.0-dev \
    libatk1.0-dev \
    libx11-dev \
    libxext-dev \
    libxrender-dev \
    libxinerama-dev \
    libxi-dev \
    libxcursor-dev \
    libpulse-dev \
    libdbus-1-dev \
    libudev-dev \
    libcups2-dev

# Instal·la Node.js i npm si no estan instal·lats
if ! command -v node &> /dev/null; then
    echo "Instal·lant Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js ja està instal·lat: $(node --version)"
fi

# Instal·la dependències de Node.js
echo "Instal·lant dependències de Node.js..."
cd "$(dirname "$0")"
npm install

# Corregir permisos del sandbox d'Electron
SANDBOX_PATH="node_modules/electron/dist/chrome-sandbox"
if [ -f "$SANDBOX_PATH" ]; then
    echo "Corregint permisos del chrome-sandbox d'Electron..."
    sudo chown root:root "$SANDBOX_PATH"
    sudo chmod 4755 "$SANDBOX_PATH"
    echo "Permisos del sandbox corregits correctament."
else
    echo "AVÍS: No s'ha trobat chrome-sandbox a $SANDBOX_PATH"
    echo "Executa 'npm install' primer i torna a executar aquest script."
fi

# Instal·la PM2 globalment si no està instal·lat
if ! command -v pm2 &> /dev/null; then
    echo "Instal·lant PM2..."
    sudo npm install -g pm2
else
    echo "PM2 ja està instal·lat: $(pm2 --version)"
fi

echo
echo "Dependències instal·lades correctament!"
echo
echo "Ara pots:"
echo "1. Executar 'npm install' per a instal·lar les dependències de Node.js"
echo "2. Executar 'npm run build' per a compilar l'aplicació"
echo "3. Executar './install-service-linux.sh' per a instal·lar com a servei systemd"
echo "4. O executar './install-startup-linux.sh' per a instal·lar com a auto-inici"
