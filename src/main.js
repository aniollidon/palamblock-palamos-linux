const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const os = require('os');
const ip = require('ip');
const io = require('socket.io-client');
const axios = require('axios');
require('dotenv').config();

// Variables globals
let mainWindow;
let displayWindow;
let socket;
let currentIP = null;
let username = 'unknown';
let isDisplayOpen = false;

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
        displayWindow.close();
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
        maximizable: false,
        closable: false
    });

    // Carrega la pàgina de display
    displayWindow.loadFile('src/display.html');

    // Mostra la finestra quan estigui carregada
    displayWindow.once('ready-to-show', () => {
        displayWindow.show();
        isDisplayOpen = true;
        console.log('Display obert');
    });

    // Prevé que l'usuari tanqui la finestra
    displayWindow.on('close', (e) => {
        e.preventDefault();
        console.log('Intent de tancar el display bloquejat');
    });

    // Desactiva les tecles de sortida
    globalShortcut.register('Alt+F4', () => {
        console.log('Alt+F4 desactivat');
        return false;
    });

    globalShortcut.register('Escape', () => {
        console.log('Escape desactivat');
        return false;
    });
}

function closeDisplayWindow() {
    if (displayWindow) {
        displayWindow.close();
        displayWindow = null;
        isDisplayOpen = false;
        console.log('Display tancat');
    }
}

function getUsername() {
    // En Linux, agafem el nom de l'usuari del sistema
    return os.userInfo().username;
}

function checkIPChanges() {
    setInterval(async () => {
        try {
            const newIP = ip.address();
            if (newIP !== currentIP) {
                currentIP = newIP;
                console.log('IP canviada a: ' + currentIP);
                
                if (socket && socket.connected) {
                    socket.emit('updateOS', {
                        version: app.getVersion(),
                        os: os.platform(),
                        ip: currentIP,
                        ssid: 'unknown',
                        username: username
                    });
                }
            }
        } catch (err) {
            console.log('Error comprovant IP:', err);
        }
    }, (process.env.IP_CHECK_INTERVAL || 30) * 1000);
}

async function sendIPToServer(ip, username) {
    try {
        await axios.post(`${process.env.API_PALAMBLOCK || 'http://localhost:3000'}/register/machine`, {
            currentIp: ip,
            alumne: username
        });
    } catch (err) {
        console.error('Servidor no trobat:', err.message);
    }
}

function connectToServer() {
    const serverUrl = process.env.SERVER_PALAMBLOCK || 'ws://localhost:3000';
    
    socket = io.connect(serverUrl, {
        transports: ['websocket'],
        path: '/ws-os'
    });

    socket.on('connect', () => {
        console.log('Connectat al servidor');
        username = getUsername();
        currentIP = ip.address();
        
        socket.emit('registerOS', {
            version: app.getVersion(),
            os: os.platform(),
            ip: currentIP,
            ssid: 'unknown',
            alumne: username
        });

        // Envia la IP inicial al servidor
        sendIPToServer(currentIP, username);
        
        // Inicia la comprovació d'IP
        checkIPChanges();
    });

    socket.on('open-display', (data) => {
        console.log('Rebuda ordre d\'obrir display');
        createDisplayWindow();
    });

    socket.on('close-display', (data) => {
        console.log('Rebuda ordre de tancar display');
        closeDisplayWindow();
    });

    socket.on('execute', (data) => {
        console.log('Executant comanda:', data.command);
        // Aquí es podrien implementar comandes específiques de Windows
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

// Events de l'aplicació
app.whenReady().then(() => {
    createMainWindow();
    connectToServer();
    
    // Registra shortcuts globals per a prevenir sortides (Linux)
    globalShortcut.register('Ctrl+Alt+Delete', () => {
        console.log('Ctrl+Alt+Delete desactivat');
        return false;
    });
    
    // En Linux, també podem desactivar Alt+F2 (executar comanda)
    globalShortcut.register('Alt+F2', () => {
        console.log('Alt+F2 desactivat');
        return false;
    });
    
    // En Linux, també podem desactivar Super (tecla Windows)
    globalShortcut.register('Super', () => {
        console.log('Super desactivat');
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
    return getUsername();
});
