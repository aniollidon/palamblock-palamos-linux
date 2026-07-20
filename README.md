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

### Instal·lar com a servei (unitat d'usuari)

El servei ara és EXCLUSIVAMENT d'usuari (no sistema). Necessites indicar quin usuari l'executarà.

1. Instal·la dependències: `./install-dependencies-ubuntu.sh`
2. Compila: `npm run build`
3. Instal·la la unitat (com a root perquè copia a `/data`):

```bash
sudo ./install-service-linux.sh --user <usuari_escriptori> --display :0
```

4. Si durant la instal·lació encara no hi havia sessió gràfica d'aquest usuari veuràs estat "pendent".
5. Després QUE L'USUARI FACI LOGIN (mateixa sessió):

```bash
systemctl --user daemon-reload
systemctl --user enable --now palamos-dashboard
```

6. En reinicis futurs s'activarà automàticament en iniciar sessió.

Opcional: ajusta `--display :1` si uses un altre servidor X.

### informació del servei

1. Estat: `systemctl --user status palamos-dashboard`
2. Logs: `journalctl --user -u palamos-dashboard -f`
3. Fitxers logs: `/data/palamos-dashboard/data/logs/main.log` (electron-log, persistent)

   ```
   /data/palamos-dashboard/data/logs/main.log
   ~/.local/share/palamamos-dashboard/logs/app.log   (stdout, no persistent)
   ~/.local/share/palamamos-dashboard/logs/error.log  (stderr, no persistent)
   ```

4. Journal (temps real)

   ```
   journalctl --user -u palamos-dashboard -f
   ```

5. Estat pendent després instal·lació: (després login) `systemctl --user enable --now palamos-dashboard`
6. "Failed to connect to bus": l'usuari no té sessió systemd (fes login gràfic o TTY normal).
7. Reinici ràpid: `systemctl --user restart palamos-dashboard`
8. Regenerar unitat: tornar a executar script d'instal·lació.

## Serveis VNC

`x11vnc` i `noVNC` s'instal·len per separat amb `install-novnc-services.sh`
(veure [setup-OS/setup.md](setup-OS/setup.md)).
