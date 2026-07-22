#!/bin/bash
# Auto-detecció del display X de l'usuari
for s in /tmp/.X11-unix/X*; do [ -S "$s" ] && [ -O "$s" ] && export DISPLAY=":${s##*X}" && break; done
xinput disable 9
xinput disable 13
