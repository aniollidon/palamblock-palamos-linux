#!/bin/bash
# Auto-detecció del display X de l'usuari
source "$(dirname "$(readlink -f "$0")")/lib-display.sh"
detect_display 10 || exit 1
xinput enable 9
xinput enable 13
