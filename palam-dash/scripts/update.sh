#!/bin/bash

cd /home/super/palamblock-palamos-linux
git checkout .
git pull
chmod +x install-service-linux.sh
chmod +x run.sh
chmod +x scripts/*

./install-service-linux.sh --user alumne --display :1
