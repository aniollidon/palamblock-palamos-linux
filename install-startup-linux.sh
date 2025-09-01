#!/bin/bash

echo "Instal·lant palam-dash com a programa d'auto-inici en Linux..."
echo

# Comprova si l'aplicació està compilada
if [ ! -f "dist/linux-unpacked/palam-dash" ]; then
    echo "Error: L'aplicació no està compilada. Executa 'npm run build' primer."
    exit 1
fi

# Obté l'usuari actual
CURRENT_USER=$(whoami)
USER_HOME=$(eval echo ~$CURRENT_USER)

# Crea el directori de l'aplicació
mkdir -p /opt/palamos-dashboard

# Copia l'aplicació
echo "Copiant aplicació..."
cp -r dist/linux-unpacked/* /opt/palamos-dashboard/

# Crea l'arxiu .env al directori de l'aplicació
echo "Creant configuració..."
cp env.example /opt/palamos-dashboard/.env

# Canvia la propietat dels fitxers
chown -R $CURRENT_USER:$CURRENT_USER /opt/palamos-dashboard
chmod +x /opt/palamos-dashboard/PalamOS\ Dashboard

# Crea l'enllaç d'auto-inici
echo "Creant enllaç d'auto-inici..."
mkdir -p "$USER_HOME/.config/autostart"

cat > "$USER_HOME/.config/autostart/palamos-dashboard.desktop" << EOF
[Desktop Entry]
Type=Application
Name=palam-dash
Comment=Sistema de gestió i control centralitzat
Exec=/opt/palamos-dashboard/palam-dash
Terminal=false
Hidden=false
X-GNOME-Autostart-enabled=true
EOF

# Canvia la propietat del fitxer d'auto-inici
chown $CURRENT_USER:$CURRENT_USER "$USER_HOME/.config/autostart/palamos-dashboard.desktop"
chmod +x "$USER_HOME/.config/autostart/palamos-dashboard.desktop"

if [ $? -eq 0 ]; then
    echo "Enllaç d'auto-inici creat correctament!"
    echo
    echo "L'aplicació s'iniciarà automàticament quan l'usuari faci login."
    echo
    echo "Per a eliminar l'auto-inici, elimina el fitxer:"
    echo "$USER_HOME/.config/autostart/palamos-dashboard.desktop"
    echo
    echo "O executa:"
    echo "rm '$USER_HOME/.config/autostart/palamos-dashboard.desktop'"
else
    echo "Error creant l'enllaç d'auto-inici."
fi

echo
echo "Instal·lació completada."
