#!/bin/bash

export DISPLAY=:1
zenity --notification --window-icon=dialog-warning.png --text "$1"