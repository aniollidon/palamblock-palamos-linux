#!/bin/bash
# Auto-detecció del display X de l'usuari
source "$(dirname "$(readlink -f "$0")")/lib-display.sh"
detect_display 10 || exit 1
xinput disable 9
xinput disable 13
