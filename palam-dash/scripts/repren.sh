#!/bin/bash
# Auto-detecció del display X de l'usuari
for s in /tmp/.X11-unix/X*; do [ -S "$s" ] && [ -O "$s" ] && export DISPLAY=":${s##*X}" && break; done
xinput enable 9
xinput enable 13
