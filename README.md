# PalamOS Dashboard - Aplicació Electron

Aplicació Electron que funciona com a servei de Linux per a PalamOS, connectant-se amb un servidor WebSocket i mostrant una pàgina de dashboard a pantalla completa controlada pel servidor.

## Característiques

- ✅ **Servei de Linux**: S'executa automàticament com a servei systemd
- ✅ **Connexió WebSocket**: Es connecta al servidor PalamBlock
- ✅ **Detecció d'IP**: Detecta i envia canvis d'IP al servidor
- ✅ **Control remot**: El servidor pot obrir/tancar el display
- ✅ **Pantalla completa**: El display s'obre a pantalla completa
- ✅ **Seguretat**: L'usuari no pot tancar l'aplicació
- ✅ **Control de teclat/rató**: El servidor pot desactivar el control

## Instal·lació

### Prerequisits

- Ubuntu 20.04+ o distribució Linux compatible
- Node.js 18+ i npm
- X11 o Wayland

### Descarregar dependències

```bash
npm install
```

### Configuració

1. Copia `env.example` a `.env`
2. Configura les variables d'entorn:
   ```env
   SERVER_PALAMBLOCK=ws://localhost:3000
   IP_CHECK_INTERVAL=30
   IP_SEND_ALWAYS_CHECK=10
   ```

### Desenvolupament

```bash
# Executar en mode desenvolupament
npm run dev

# Executar normal
npm start
```

### Compilar

```bash
# Compilar per a Linux
npm run build
```

### Instal·lar com a servei

1. Instal·la les dependències del sistema: `./install-dependencies-ubuntu.sh`
2. Compila l'aplicació: `npm run build`
3. Executa `./install-service-linux.sh` com a root (sudo)
4. El servei s'iniciarà automàticament

### Instal·lar com a auto-inici

1. Instal·la les dependències del sistema: `./install-dependencies-ubuntu.sh`
2. Compila l'aplicació: `npm run build`
3. Executa `./install-startup-linux.sh`
4. L'aplicació s'iniciarà automàticament al fer login

### Instal·lació ràpida amb Makefile

```bash
# Instal·lació completa (dependències + build + servei)
make install

# O pas a pas:
make deps          # Instal·la dependències
make build         # Compila l'aplicació
make service       # Instal·la com a servei
make startup       # O instal·la com a auto-inici

# Gestió del servei:
make start         # Inicia el servei
make stop          # Atura el servei
make restart       # Reinicia el servei
make status        # Mostra l'estat
make logs          # Mostra els logs
make uninstall     # Desinstal·la completament
```

## Ús

### Com a servei

L'aplicació s'executa automàticament com a servei systemd de Linux i:

1. Es connecta al servidor WebSocket
2. Envia la IP local i informació del sistema
3. Detecta canvis d'IP i els notifica al servidor
4. Espera ordres del servidor per a obrir/tancar el display

### Comandes del servidor

- `open-display`: Obre la finestra de dashboard a pantalla completa
- `close-display`: Tanca la finestra de dashboard
- `execute`: Executa comandes al sistema (futur)

### Control remot

El servidor pot:
- Obrir/tancar el display
- Rebre informació del sistema
- Controlar l'estat de l'aplicació

## Estructura del projecte

```
palamDash/
├── src/
│   ├── main.js          # Procés principal d'Electron
│   ├── display.html     # Pàgina de dashboard
│   ├── display.js       # Lògica del dashboard
│   └── index.html       # Pàgina de debug
├── assets/              # Icones i recursos
├── package.json         # Dependències i scripts
├── env.example          # Variables d'entorn d'exemple
├── Makefile             # Comandes d'instal·lació i gestió
├── install-dependencies-ubuntu.sh  # Script d'instal·lació de dependències
├── install-service-linux.sh        # Script d'instal·lació del servei systemd
├── install-startup-linux.sh        # Script d'instal·lació d'auto-inici
├── ecosystem.config.js  # Configuració PM2
└── README.md           # Aquest fitxer
```

## Seguretat

- L'usuari no pot tancar l'aplicació
- Les tecles de sortida estan desactivades
- El control del sistema està limitat
- Només el servidor pot controlar l'aplicació

## Troubleshooting

### L'aplicació no s'executa

1. Comprova que Node.js està instal·lat
2. Executa `npm install` per a instal·lar dependències
3. Comprova la configuració del `.env`

### Problemes de connexió

1. Verifica que el servidor està executant-se
2. Comprova la URL del servidor al `.env`
3. Verifica que el firewall no bloqueja la connexió

### Problemes del servei

1. Executa `sudo systemctl status palamos-dashboard` per a veure l'estat
2. Comprova els logs amb `sudo journalctl -u palamos-dashboard -f`
3. Reinstal·la el servei amb `./install-service-linux.sh`

## Desenvolupament

### Afegir noves funcionalitats

1. Modifica `src/main.js` per a la lògica principal
2. Actualitza `src/display.html` per a la interfície
3. Afegeix noves comandes al sistema de WebSocket

### Testing

```bash
# Mode desenvolupament amb DevTools
npm run dev

# Mode normal
npm start
```

## Llicència

Aquest projecte està basat en [palamblock-palamos-linux](https://github.com/aniollidon/palamblock-palamos-linux) i adaptat per a Electron en Linux.

## Suport

Per a suport tècnic o preguntes, contacta amb l'equip de desenvolupament de PalamOS.
