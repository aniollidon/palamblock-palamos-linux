const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const os = require('os');
const ip = require('ip');
const io = require('socket.io-client');
const axios = require('axios');
const { getUsername } = require('./user');
const { getCurrentSSID } = require('./network');
require('dotenv').config();

// Variables globals
let mainWindow;
let displayWindow;
let socket;
let currentIP = null;
let username = 'unknown';
let isDisplayOpen = false;
let allowCloseDisplay = false;

// Configuració de l'aplicació
const isDev = process.argv.includes('--dev');

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false, // No es mostra la finestra principal
        skipTaskbar: false, // En Linux no hi ha skipTaskbar
        alwaysOnTop: true
    });

    // Carrega la pàgina principal (opcional, per a debugging)
    if (isDev) {
        mainWindow.loadFile('src/index.html');
        mainWindow.webContents.openDevTools();
    }

    // Prevé que l'usuari tanqui l'aplicació
    mainWindow.on('close', (e) => {
        e.preventDefault();
        console.log('Intent de tancar l\'aplicació bloquejat');
    });

    // Amaga la finestra principal
    mainWindow.hide();
}

function createDisplayWindow() {
    if (displayWindow) {
        allowCloseDisplay = true;
        displayWindow.close();
        allowCloseDisplay = false;
    }

    displayWindow = new BrowserWindow({
        fullscreen: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false,
        alwaysOnTop: true,
        skipTaskbar: false, // En Linux no hi ha skipTaskbar
        frame: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false
    });

    // Carrega la pàgina de display
    displayWindow.loadFile('src/display.html');

    // Mostra la finestra quan estigui carregada
    displayWindow.once('ready-to-show', () => {
        displayWindow.show();
        isDisplayOpen = true;
        console.log('Display obert');
        
        // Registra els shortcuts només quan el display està obert
        registerDisplayShortcuts();
    });

    // Prevé que l'usuari tanqui la finestra
    displayWindow.on('close', (e) => {
        if (!allowCloseDisplay) {
            e.preventDefault();
            console.log('Intent de tancar el display bloquejat');
        }
    });
}

function closeDisplayWindow() {
    if (displayWindow) {
        allowCloseDisplay = true;

        // Desregistra els shortcuts quan es tanca el display
        unregisterDisplayShortcuts();

        // Intenta sortir de fullscreen abans de tancar
        try {
            if (displayWindow.isFullScreen()) {
                displayWindow.setFullScreen(false);
            }
        } catch (e) {
            // ignore
        }

        // Evita que algun listener extern bloquegi el tancament
        try {
            displayWindow.removeAllListeners('close');
        } catch (e) {
            // ignore
        }

        displayWindow.once('closed', () => {
            allowCloseDisplay = false;
            displayWindow = null;
            isDisplayOpen = false;
            console.log('Display tancat');
        });
        displayWindow.close();

        // Si no es tanca, forcem el destroy després d'un temps
        setTimeout(() => {
            if (displayWindow && !displayWindow.isDestroyed()) {
                try {
                    displayWindow.destroy();
                } catch (e) {
                    // ignore
                }
            }
        }, 1500);
    }
}

function checkIPChanges() {
    setInterval(async () => {
        try {
            const newIP = ip.address();
            if (newIP !== currentIP) {
                currentIP = newIP;
                console.log('IP canviada a: ' + currentIP);
                
                if (socket && socket.connected) {
                    const ssid = await getCurrentSSID();
                    socket.emit('updateOS', {
                        version: app.getVersion(),
                        os: os.platform(),
                        ip: currentIP,
                        ssid: ssid,
                        username: username
                    });
                }
            }
        } catch (err) {
            console.log('Error comprovant IP:', err);
        }
    }, (process.env.IP_CHECK_INTERVAL || 30) * 1000);
}

function connectToServer() {
    const serverUrl = process.env.SERVER_PALAMBLOCK || 'ws://localhost:3000';
    
    socket = io.connect(serverUrl, {
        transports: ['websocket'],
        path: '/ws-os'
    });

    socket.on('connect', async () => {
        console.log('Connectat al servidor');
        username = getUsername();
        currentIP = ip.address();
        const ssid = await getCurrentSSID();

        console.log("Enviant dades al servidor", {
            version: app.getVersion(),
            os: os.platform(),
            ip: currentIP,
            ssid: ssid,
            alumne: username
        });
        
        socket.emit('registerOS', {
            version: app.getVersion(),
            os: os.platform(),
            ip: currentIP,
            ssid: ssid,
            alumne: username
        });

        // Inicia la comprovació d'IP
        checkIPChanges();
    });

    socket.on('execute', (data) => {
        if (data.command === 'open-display') {
            console.log('Rebuda ordre d\'obrir display');
            createDisplayWindow();
        }
        else if (data.command === 'close-display') {
            console.log('Rebuda ordre de tancar display');
            closeDisplayWindow();
        }
        else {
            console.log('Executant comanda:', data.command); //TODO: Implementar comandes
        }
    });

    socket.on('ping', (data) => {
        socket.emit('pong', { version: app.getVersion() });
    });

    socket.on('connect_error', (error) => {
        console.error('Error de connexió:', error.message);
    });

    socket.on('disconnect', () => {
        console.log('Desconnectat del servidor');
    });
}

// Funció per registrar shortcuts només quan el display està obert
function registerDisplayShortcuts() {
    // Desactiva les tecles de sortida només quan el display està obert
    globalShortcut.register('Alt+F4', () => {
        console.log('Alt+F4 desactivat (display obert)');
        return false;
    });

    globalShortcut.register('Escape', () => {
        console.log('Escape desactivat (display obert)');
        return false;
    });
    
    // En Linux, també podem desactivar Alt+F2 (executar comanda)
    globalShortcut.register('Alt+F2', () => {
        console.log('Alt+F2 desactivat (display obert)');
        return false;
    });
    
    // En Linux, també podem desactivar Super (tecla Windows)
    // Nota: Super pot no funcionar en tots els sistemes
    try {
        /*globalShortcut.register('Super', () => {
            console.log('Super desSactivat (display obert)');
            return false;
        });*/
    } catch (e) {
        console.log('No s\'ha pogut registrar Super shortcut:', e);
    }
}

// Funció per desregistrar shortcuts quan es tanca el display
function unregisterDisplayShortcuts() {
    try {
        globalShortcut.unregister('Alt+F4');
        globalShortcut.unregister('Escape');
        globalShortcut.unregister('Alt+F2');
        // Super no és un shortcut vàlid, l'eliminem
        console.log('Shortcuts del display desregistrats');
    } catch (e) {
        console.log('Error desregistrant shortcuts:', e);
    }
}

// Events de l'aplicació
app.whenReady().then(() => {
    createMainWindow();
    connectToServer();
    
    // Registra shortcuts globals per a prevenir sortides (Linux) - sempre actius
    globalShortcut.register('Ctrl+Alt+Delete', () => {
        console.log('Ctrl+Alt+Delete desactivat');
        return false;
    });
});

app.on('window-all-closed', () => {
    // No tanquem l'aplicació quan es tanquen les finestres
    console.log('Totes les finestres tancades, però l\'aplicació segueix executant-se');
});

app.on('before-quit', (e) => {
    // Prevé que l'usuari tanqui l'aplicació
    e.preventDefault();
    console.log('Intent de tancar l\'aplicació bloquejat');
});

app.on('will-quit', () => {
    // Neteja els shortcuts globals
    globalShortcut.unregisterAll();
});

// IPC handlers per a comunicació entre processos
ipcMain.handle('get-ip', () => {
    return ip.address();
});

ipcMain.handle('get-username', () => {
    const username = getUsername();
    console.log('🔍 get-username cridat, retornant:', username);
    return username;
});

// Retorna la URL del servidor definida a .env per al display/viewer
ipcMain.handle('get-server-url', () => {
    const serverUrl = process.env.SERVER_PALAMBLOCK || 'http://localhost:3000';
    console.log('🌐 get-server-url cridat, retornant:', serverUrl);
    return serverUrl;
});
