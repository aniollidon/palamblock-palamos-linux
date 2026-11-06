#!/bin/bash
# Instal·la el firmware wifi MediaTek (MT7922) i el de la GPU AMD, recarrega
# el driver mt7921e i reinicia una màquina remota. Ús: repara_xarxa.sh <IP> <contrasenya_super>
# La mateixa contrasenya s'usa per a SSH i per a sudo. Requereix sshpass.

if [ $# -ne 2 ]; then
    echo "Ús: $0 <contrasenya_super> <IP>"
    exit 1
fi

IP="$2"
PASS="$1"

if ! command -v sshpass >/dev/null; then
    echo "Cal instal·lar sshpass (sudo apt install sshpass)"
    exit 1
fi

# sshpass -e llegeix la contrasenya de l'entorn i evita exposar-la als arguments
export SSHPASS="$PASS"

# La contrasenya de sudo s'envia per stdin (-S), un sol sudo per a totes les comandes, i no apareix a la llista de processos remots
printf '%s\n' "$PASS" | sshpass -e ssh -o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no super@"$IP" \
    'sudo -S -p "" sh -c "apt install -y firmware-mediatek firmware-amd-graphics && modprobe -r mt7921e && modprobe mt7921e; systemctl reboot"' \
    || { echo "Error executant les comandes a $IP"; exit 1; }

echo "Fet. La màquina $IP s'està reiniciant."
