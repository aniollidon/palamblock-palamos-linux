#!/bin/bash

# Comprovació d'execució com a root
if [[ $EUID -ne 0 ]]; then
   echo "Executa aquest script amb sudo."
   exit 1
fi

echo "Aplicant restriccions per a Debian..."
# Neteja de configuracions anteriors i errònies
rm -f /etc/polkit-1/rules.d/49-school-*.rules
rm -f /etc/dconf/db/local.d/00-school-shell
rm -f /etc/dconf/db/local.d/locks/shell
rm -rf /etc/dconf/db/school /etc/dconf/db/school.d
rm -rf /etc/dconf/db/alumne

############################################
# 0. COMPROVACIÓ FONS PERSONALITZAT
############################################
if [ ! -f /usr/share/wallpapers/background-pb.png ]; then
   echo "ERROR: No existeix /usr/share/wallpapers/background-pb.png"
   exit 1
fi

############################################
# 1. POLKIT – LLENGUA DEL DISPOSITIU
############################################
cat <<EOF > /etc/polkit-1/rules.d/00-alumne-language.rules
polkit.addRule(function(action, subject) {
    if (subject.user == "alumne") {
        if (action.id.indexOf("org.freedesktop.locale1") == 0)
            return polkit.Result.NO;
    }
});
EOF

############################################
# 2. POLKIT – DATA I HORA
############################################
cat <<EOF > /etc/polkit-1/rules.d/00-alumne-datetime.rules
polkit.addRule(function(action, subject) {
    if (subject.user == "alumne") {
        if (action.id.indexOf("org.freedesktop.timedate1") == 0)
            return polkit.Result.NO;
    }
});
EOF

############################################
# 3. PERFIL OBLIGATORI DE DCONF – FONS FIX PELS ALUMNES
############################################

# Crear el perfil específic de l'alumne
mkdir -p /etc/dconf/profile
echo -e "user-db:user\nsystem-db:alumne" > /etc/dconf/profile/alumne

# Configurar el sistema perquè carregui aquest perfil d'usuari només a "alumne"
# En sessions X11, utilitzem /etc/profile.d/ per exportar la variable d'entorn
cat <<EOF > /etc/profile.d/set-alumne-profile.sh
if [ "\$USER" = "alumne" ]; then
    export DCONF_PROFILE=alumne
fi
EOF
chmod 755 /etc/profile.d/set-alumne-profile.sh

# En Debian, GDM llegeix profile.d correctament, però per assegurar-nos-en
# forcem també la variable al ~/.profile de l'alumne:
ALUMNE_HOME=$(eval echo ~alumne 2>/dev/null)
if [ -n "$ALUMNE_HOME" ] && [ -d "$ALUMNE_HOME" ]; then
    if ! grep -q "DCONF_PROFILE=alumne" "$ALUMNE_HOME/.profile" 2>/dev/null; then
        echo "export DCONF_PROFILE=alumne" >> "$ALUMNE_HOME/.profile"
        chown alumne:alumne "$ALUMNE_HOME/.profile"
    fi
fi

# Crear la base de dades obligatòria i els bloquejos (Sempre ha de ser .d)
mkdir -p /etc/dconf/db/alumne.d
mkdir -p /etc/dconf/db/alumne.d/locks

# Forçar el fons obligatori i desactivar l'accés al panell de xarxa/wifi control center
cat <<EOF > /etc/dconf/db/alumne.d/00-alumne-settings
[org/gnome/desktop/background]
picture-uri='file:///usr/share/wallpapers/background-pb.png'
picture-uri-dark='file:///usr/share/wallpapers/background-pb.png'

EOF

# Bloquejar les claus perquè siguin immutables
echo "/org/gnome/desktop/background/picture-uri" > /etc/dconf/db/alumne.d/locks/background
echo "/org/gnome/desktop/background/picture-uri-dark" >> /etc/dconf/db/alumne.d/locks/background

# Actualitzar dconf
dconf update

############################################
# 4. BLOQUEIG DE CONFIGURACIÓ (GNOME Settings)
############################################
# Crear grup per accés a Configuració
if ! getent group settings-access > /dev/null 2>&1; then
    groupadd settings-access
fi

# Afegir super al grup (si existeix)
if id "super" > /dev/null 2>&1; then
    usermod -aG settings-access super
fi

# Bloquejar gnome-control-center: només root i grup settings-access
chown root:settings-access /usr/bin/gnome-control-center
chmod 750 /usr/bin/gnome-control-center

echo "--------------------------------------"
echo "Restriccions aplicades correctament."
echo "- Fons d'escriptori bloquejat."
echo "- Canvi de llengua bloquejat."
echo "- Canvi de data i hora bloquejat."
echo "- Configuració del sistema bloquejada (només super)."
echo ""
echo "Només l'usuari super pot obrir la Configuració."
echo "La resta de configuracions (Bluetooth, So, etc.) continuen accessibles."
echo "IMPORTANT: Com s'han instal·lat extensions de GNOME noves, és obligatori"
echo "reiniciar el sistema perquè GNOME Shell les carregui i apliqui els canvis."
echo "--------------------------------------"
