## 🚫 Anti-circumvention notice
This tool is intended for educational use.
Instructions for disabling, bypassing, or uninstalling it without authorization
are intentionally not documented.

If you are a student attempting to disable this tool, please contact your teacher.

# Setup-OS:
Modificacions a un sistema operatiu amb base debian per garantir el funcionament de la màquina alumne.

Segueix les [instruccions d'instal·lació](setup-OS/setup.md) dels diferents components


# PalamDash: PalamOS Dashboard

Aplicació Electron que funciona com a servei (unitat d'usuari systemd) per a PalamOS, connectant-se amb un servidor WebSocket i mostrant un dashboard a pantalla completa controlat remotament.

### Configuració

1. Copia `env.example` a `.env`
2. Configura les variables d'entorn:

#### Configuració del fitxer sudoers

L'script d'instal·lació crea automàticament `/etc/sudoers.d/palamos-dashboard` amb:

```bash
alumne ALL=(ALL) NOPASSWD: /sbin/shutdown, /sbin/reboot, /sbin/poweroff, /sbin/halt
alumne ALL=(ALL) NOPASSWD: /data/palamos-dashboard/scripts/*
```

Això permet que palam-dash pugui apagar/reiniciar la màquina i executar
scripts del professor des del panell de control, sense que l'alumne hagi
de tenir password. Els scripts són propietat de root (només lectura per
a alumne), així que no es poden modificar.

### Compilar

```bash
npm run build
```

### Instal·lar com a servei

```bash
git clone --depth 1 https://github.com/aniollidon/palamblock-palamos-linux.git /tmp/palamblock
cd /tmp/palamblock/palam-dash
sudo make install user=alumne display=:0
```

Opcional: ajusta `--display :1` si uses un altre servidor X.

### Logs

```bash
# Logs persistents (electron-log)
tail -f /data/palamos-dashboard/data/logs/main.log

# Logs stdout/stderr (systemd, no persistents)
tail -f ~/.local/share/palamamos-dashboard/logs/app.log
tail -f ~/.local/share/palamamos-dashboard/logs/error.log

# Journal en temps real
journalctl --user -u palamos-dashboard -f
```

## Serveis VNC

`x11vnc` i `noVNC` s'instal·len per separat amb `install-novnc-services.sh`
(veure [setup-OS/setup.md](setup-OS/setup.md)).
