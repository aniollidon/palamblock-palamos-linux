#!/bin/bash

echo "Instal·lant dependències del sistema per a PalamOS Dashboard en Ubuntu..."
echo

# Actualitza la llista de paquets
echo "Actualitzant llista de paquets..."
sudo apt update

# Instal·la les dependències necessàries
echo "Instal·lant dependències..."
sudo apt install -y \
    curl \
    wget \
    git \
    build-essential \
    libgtk-3-dev \
    libwebkit2gtk-4.0-dev \
    libappindicator3-dev \
    librsvg2-dev \
    libnotify-dev \
    libxtst-dev \
    libxss-dev \
    libnss3-dev \
    libasound2-dev \
    libatspi2.0-dev \
    libdrm-dev \
    libxcomposite-dev \
    libxdamage-dev \
    libxrandr-dev \
    libgbm-dev \
    libxss-dev \
    libgconf-2-4 \
    libgnome-keyring-dev \
    libpango1.0-dev \
    libcairo2-dev \
    libgdk-pixbuf2.0-dev \
    libgtk2.0-dev \
    libatk1.0-dev \
    libgail-3-dev \
    libx11-dev \
    libxext-dev \
    libxrender-dev \
    libxinerama-dev \
    libxi-dev \
    libxrandr-dev \
    libxcursor-dev \
    libxcomposite-dev \
    libxdamage-dev \
    libxfixes-dev \
    libxss-dev \
    libxtst-dev \
    libxrandr-dev \
    libasound2-dev \
    libpulse-dev \
    libdbus-1-dev \
    libudev-dev \
    libgconf2-dev \
    libgnome-keyring-dev \
    libnss3-dev \
    libnspr4-dev \
    libcups2-dev \
    libatspi2.0-dev \
    libdrm-dev \
    libxkbcommon-dev \
    libxcomposite-dev \
    libxdamage-dev \
    libxrandr-dev \
    libgbm-dev \
    libxss-dev \
    libgconf-2-4 \
    libgnome-keyring-dev \
    libpango1.0-dev \
    libcairo2-dev \
    libgdk-pixbuf2.0-dev \
    libgtk2.0-dev \
    libatk1.0-dev \
    libgail-3-dev \
    libx11-dev \
    libxext-dev \
    libxrender-dev \
    libxinerama-dev \
    libxi-dev \
    libxrandr-dev \
    libxcursor-dev \
    libxcomposite-dev \
    libxdamage-dev \
    libxfixes-dev \
    libxss-dev \
    libxtst-dev \
    libxrandr-dev \
    libasound2-dev \
    libpulse-dev \
    libdbus-1-dev \
    libudev-dev \
    libgconf2-dev \
    libgnome-keyring-dev \
    libnss3-dev \
    libnspr4-dev \
    libcups2-dev \
    libatspi2.0-dev \
    libdrm-dev \
    libxkbcommon-dev

# Instal·la Node.js i npm si no estan instal·lats
if ! command -v node &> /dev/null; then
    echo "Instal·lant Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js ja està instal·lat: $(node --version)"
fi

# Descarregar l'última versió (canvia la versió si cal)
wget https://github.com/nicedoc/electron/releases/download/v33.3.1/electron_33.3.1_amd64.deb

# O directament des del release oficial d'Electron
wget https://github.com/nicedoc/electron-installer-debian/releases/latest

# Instal·lar
sudo dpkg -i electron_*.deb
sudo apt install -f

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
