const { ipcRenderer } = require('electron');

// Elements del DOM
const loadingElement = document.getElementById('loading');
const mainContentElement = document.getElementById('main-content');
const usernameDisplay = document.getElementById('username-display');
const ipDisplay = document.getElementById('ip-display');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');

// Variables globals
let updateInterval;

// Funció per a inicialitzar la pàgina
async function initializePage() {
    try {
        // Obté la informació del sistema
        const username = await ipcRenderer.invoke('get-username');
        const ip = await ipcRenderer.invoke('get-ip');

        // Actualitza la interfície
        usernameDisplay.textContent = username;
        ipDisplay.textContent = ip;

        // Amaga el loading i mostra el contingut principal
        loadingElement.style.display = 'none';
        mainContentElement.style.display = 'block';

        // Actualitza l'estat de connexió
        updateConnectionStatus('Conectat');

        // Inicia l'interval d'actualització
        startUpdateInterval();

        console.log('Pàgina de display inicialitzada correctament');
    } catch (error) {
        console.error('Error inicialitzant la pàgina:', error);
        showError('Error inicialitzant la pàgina');
    }
}

// Funció per a actualitzar l'estat de connexió
function updateConnectionStatus(status) {
    statusText.textContent = status;
    
    if (status === 'Conectat') {
        statusIndicator.className = 'status-indicator status-connected';
    } else if (status === 'Desconnectat') {
        statusIndicator.className = 'status-indicator status-disconnected';
    } else {
        statusIndicator.className = 'status-indicator';
    }
}

// Funció per a mostrar errors
function showError(message) {
    console.error(message);
    // Aquí es podria implementar una notificació visual d'error
}

// Funció per a iniciar l'interval d'actualització
function startUpdateInterval() {
    // Actualitza la informació cada 30 segons
    updateInterval = setInterval(async () => {
        try {
            const ip = await ipcRenderer.invoke('get-ip');
            ipDisplay.textContent = ip;
        } catch (error) {
            console.error('Error actualitzant IP:', error);
        }
    }, 30000);
}

// Funció per a netejar recursos
function cleanup() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM carregat, inicialitzant pàgina...');
    initializePage();
});

// Prevé que l'usuari tanqui la pàgina
window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = '';
    return '';
});

// Prevé que l'usuari faci clic dret
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Prevé que l'usuari faci clic esquerre
document.addEventListener('click', (e) => {
    // Permet clics normals però registra l'activitat
    console.log('Activitat detectada a la pàgina');
});

// Prevé que l'usuari faci scroll
document.addEventListener('wheel', (e) => {
    e.preventDefault();
});

// Prevé que l'usuari faci zoom
document.addEventListener('keydown', (e) => {
    // Bloqueja Ctrl+Plus, Ctrl+Minus, Ctrl+0
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '0')) {
        e.preventDefault();
    }
    
    // Bloqueja F11 (fullscreen)
    if (e.key === 'F11') {
        e.preventDefault();
    }
    
    // Bloqueja Escape
    if (e.key === 'Escape') {
        e.preventDefault();
    }
});

// Neteja quan es tanca la pàgina
window.addEventListener('unload', cleanup);

// Funció per a actualitzar l'estat de connexió des del procés principal
window.updateConnectionStatus = updateConnectionStatus;

// Exporta funcions per a ús extern
module.exports = {
    updateConnectionStatus,
    showError,
    cleanup
};
