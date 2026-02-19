# PalamOS Dashboard - Aplicació Electron

Aplicació Electron que funciona com a servei (unitat d'usuari systemd) per a PalamOS, connectant-se amb un servidor WebSocket i mostrant un dashboard a pantalla completa controlat remotament.

### Configuració

1. Copia `env.example` a `.env`
2. Configura les variables d'entorn:

#### Configuració del fitxer sudoers

```bash
alumne ALL=(ALL) /sbin/shutdown, /sbin/reboot, /sbin/poweroff, /sbin/halt
alumne ALL=(ALL) /opt/palamos-dashboard/scripts/*
```

### Compilar

```bash
npm run build
```

### Instal·lar com a servei (unitat d'usuari)

El servei ara és EXCLUSIVAMENT d'usuari (no sistema). Necessites indicar quin usuari l'executarà.

1. Instal·la dependències: `./install-dependencies-ubuntu.sh`
2. Compila: `npm run build`
3. Caldrà posar la contrassenya a x11vnc

```bash
sudo x11vnc -storepasswd <contrasenya> /etc/x11vnc.pwd
```

4. Instal·la la unitat (com a root perquè copia a `/opt`):

```bash
sudo ./install-service-linux.sh --user <usuari_escriptori> --display :0
```

5. Si durant la instal·lació encara no hi havia sessió gràfica d'aquest usuari veuràs estat "pendent".
6. Després QUE L'USUARI FACI LOGIN (mateixa sessió):

```bash
systemctl --user daemon-reload
systemctl --user enable --now palamos-dashboard
```

7. En reinicis futurs s'activarà automàticament en iniciar sessió.

Opcional: ajusta `--display :1` si uses un altre servidor X.

### informació del servei

1. Estat: `systemctl --user status palamos-dashboard`
2. Logs: `journalctl --user -u palamos-dashboard -f`
3. Fitxers logs: `~/.local/share/palamamos-dashboard/logs/`

   ```
   ~/.local/share/palamamos-dashboard/logs/app.log
   ~/.local/share/palamamos-dashboard/logs/error.log
   ```

4. Journal (temps real)

   ```
   journalctl --user -u palamos-dashboard -f
   ```

5. Estat pendent després instal·lació: (després login) `systemctl --user enable --now palamos-dashboard`
6. "Failed to connect to bus": l'usuari no té sessió systemd (fes login gràfic o TTY normal).
7. Reinici ràpid: `systemctl --user restart palamos-dashboard`
8. Regenerar unitat: tornar a executar script d'instal·lació.

## Servei addicional noVNC

Si existeix `/home/super/noVNC/utils/novnc_proxy` l'script crea `novnc-proxy.service` (servei de sistema) exposant VNC via WebSocket :6080. Per desactivar:

```
sudo systemctl disable --now novnc-proxy
```
