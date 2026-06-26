const { app, BrowserWindow, ipcMain, globalShortcut, powerMonitor } = require("electron");
const os = require("os");
const ip = require("ip");
const io = require("socket.io-client");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const commands = require("./commands");
const { getUsername } = require("./user");
const { getCurrentSSID } = require("./network");
const { logger } = require("./logger");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
require("dotenv").config();

const DEFAULT_SERVER_URL =
  process.env.SERVER_PALAMBLOCK || "http://192.168.0.103:4000";
const SECONDARY_SERVER_URL =
  process.env.SERVER_PALAMBLOCK_ALT || "https://palamblock.online";

// Configuració del logger per l'autoUpdater
log.transports.file.level = "info";
autoUpdater.logger = log;

// Variables globals
let mainWindow;
let displayWindow;
let loginWindow;
let socket;
let currentIP = null;
let username = "unknown";
let isDisplayOpen = false;
let allowCloseDisplay = false;
let isLoggedIn = false;
let selectedServerUrl = DEFAULT_SERVER_URL;
let examSessionTimer = null;
const examSession = {
  active: false,
  user: null,
  displayName: null,
  startedAt: null,
  expiresAt: null,
};

// Configuració de l'aplicació
const isDev = process.argv.includes("--dev");

function normalizeServerUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return DEFAULT_SERVER_URL;
  if (/^https?:\/\//i.test(value) || /^wss?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function getApiBaseFromServerUrl(rawUrl) {
  return normalizeServerUrl(rawUrl);
}

function getSocketBaseFromServerUrl(rawUrl) {
  return normalizeServerUrl(rawUrl);
}

function getServerPrefFile() {
  return path.join(app.getPath("userData"), ".server");
}

function loadServerPreference() {
  try {
    const fromFile = fs.readFileSync(getServerPrefFile(), "utf8").trim();
    if (fromFile) selectedServerUrl = normalizeServerUrl(fromFile);
  } catch (_err) {
    selectedServerUrl = normalizeServerUrl(DEFAULT_SERVER_URL);
  }
}

function saveServerPreference(url) {
  selectedServerUrl = normalizeServerUrl(url);
  fs.writeFileSync(getServerPrefFile(), selectedServerUrl, "utf8");
  return selectedServerUrl;
}

function isExamBaseUser() {
  return typeof username === "string" && username.startsWith("examen");
}

function isExamUserName(userValue) {
  return typeof userValue === "string" && userValue.startsWith("examen");
}

function getSessionPayloadForServer() {
  if (!isExamBaseUser()) return undefined;
  return {
    active: examSession.active,
    user: examSession.user,
    displayName: examSession.displayName,
    expiresAt: examSession.expiresAt,
  };
}

function clearExamSessionTimer() {
  if (examSessionTimer) {
    clearTimeout(examSessionTimer);
    examSessionTimer = null;
  }
}

function resetExamSession(reason = "manual") {
  clearExamSessionTimer();
  examSession.active = false;
  examSession.user = null;
  examSession.displayName = null;
  examSession.startedAt = null;
  examSession.expiresAt = null;

  if (socket && socket.connected) {
    socket.emit("session_change", {
      active: false,
      user: null,
      displayName: null,
      reason,
    });
  }
}

function startExamSession(user, displayName, ttlHours = 3) {
  clearExamSessionTimer();
  examSession.active = true;
  examSession.user = user;
  examSession.displayName = displayName || null;
  examSession.startedAt = new Date().toISOString();
  examSession.expiresAt = new Date(
    Date.now() + ttlHours * 60 * 60 * 1000
  ).toISOString();

  examSessionTimer = setTimeout(() => {
    logger.info("Sessio temporal d'examen expirada");
    resetExamSession("expired");
  }, ttlHours * 60 * 60 * 1000);

  if (socket && socket.connected) {
    socket.emit("session_change", {
      active: true,
      user,
      displayName,
      expiresAt: examSession.expiresAt,
    });
  }
}

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 500,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    frame: false, // Sense barra de títol
    center: true,
  });

  // Carrega la pàgina de login
  loginWindow.loadFile("src/login.html");

  // Mostra la finestra quan estigui carregada
  loginWindow.once("ready-to-show", () => {
    loginWindow.show();
    logger.info("Login window oberta");
  });

  // Preveu quan l'usuari tanqui la finestra de login
  loginWindow.on("close", (e) => {
    if (!isLoggedIn) {
      e.preventDefault();
      logger.debug("Intent de tancar login bloquejat");
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false, // No es mostra la finestra principal
    skipTaskbar: false, // En Linux no hi ha skipTaskbar
    alwaysOnTop: true,
  });

  // Carrega la pàgina principal (opcional, per a debugging)
  if (isDev) {
    mainWindow.loadFile("src/index.html");
    mainWindow.webContents.openDevTools();
  }

  // Prevé que l'usuari tanqui l'aplicació
  mainWindow.on("close", (e) => {
    e.preventDefault();
    logger.debug("Intent de tancar l'aplicació bloquejat");
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
      contextIsolation: false,
    },
    show: false,
    alwaysOnTop: true,
    skipTaskbar: false, // En Linux no hi ha skipTaskbar
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    kiosk: true,
  });

  // Carrega la pàgina de display
  displayWindow.loadFile("src/display.html");

  // Mostra la finestra quan estigui carregada
  displayWindow.once("ready-to-show", () => {
    displayWindow.show();
    // Assegura visibilitat damunt de tot i en tots els escriptoris
    try {
      displayWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
      displayWindow.setAlwaysOnTop(true, "screen-saver");
      displayWindow.focus();
    } catch {}
    isDisplayOpen = true;
    logger.debug("Display obert");

    // Registra els shortcuts només quan el display està obert
    registerDisplayShortcuts();
  });

  // Reforç de focus: si es minimitza o perd el focus, el recuperem
  displayWindow.on("minimize", (e) => {
    try {
      e.preventDefault();
    } catch {}
    try {
      displayWindow.restore();
      displayWindow.show();
      displayWindow.focus();
    } catch {}
  });

  displayWindow.on("blur", () => {
    if (isDisplayOpen && displayWindow) {
      setTimeout(() => {
        try {
          displayWindow.show();
          displayWindow.focus();
        } catch {}
      }, 50);
    }
  });

  displayWindow.on("leave-full-screen", () => {
    if (isDisplayOpen) {
      try {
        displayWindow.setFullScreen(true);
      } catch {}
    }
  });

  // Prevé que l'usuari tanqui la finestra
  displayWindow.on("close", (e) => {
    if (!allowCloseDisplay) {
      e.preventDefault();
      logger.debug("Intent de tancar el display bloquejat");
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
      displayWindow.removeAllListeners("close");
    } catch (e) {
      // ignore
    }

    displayWindow.once("closed", () => {
      allowCloseDisplay = false;
      displayWindow = null;
      isDisplayOpen = false;
      logger.debug("Display tancat");
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

let ipCheckIntervalId = null;
let castSocket = null;
let castTimeoutId = null;

function checkCastActive() {
  // Neteja agressiva d'intents de resolució previs per evitar leaks
  if (castTimeoutId) clearTimeout(castTimeoutId);
  if (castSocket) {
    try { castSocket.close(); } catch {}
  }

  const castBase = (process.env.SERVER_PALAMBLOCK || "http://localhost:3000").replace(/\/$/, "");
  castSocket = io.connect(castBase, {
    path: "/ws-cast",
    transports: ["websocket"],
    forceNew: true // Assegura una nova connexió que no es recicli erròniament
  });

  let answered = false;

  castSocket.on("connect", () => {
    logger.debug("ws-cast connectat, consultant emissió activa...");
    castSocket.emit("cast-active-query", { alumne: username }, (res) => {
      answered = true;
      if (res && res.active) {
        logger.info("Emissió activa detectada (ws-cast).");
        if (!isDisplayOpen) createDisplayWindow();
      } else {
        logger.info("Cap emissió activa en iniciar (ws-cast).");
      }
      closeCastSocket();
    });
  });

  castSocket.on("connect_error", () => {
    logger.warn("No s'ha pogut verificar seqüència d'emissió (connect_error a ws-cast).");
    closeCastSocket();
  });

  // Seguretat en cas que el servidor no respongui al 'cast-active-query'
  castTimeoutId = setTimeout(() => {
    if (!answered) {
      logger.warn("Timeout de xarxa assolit esperant ws-cast.");
      closeCastSocket();
    }
  }, 5000);
}

function closeCastSocket() {
  if (castTimeoutId) clearTimeout(castTimeoutId);
  if (castSocket) {
    try { castSocket.close(); } catch {}
    castSocket = null; // Lliurem de memòria l'objecte
  }
}

function checkIPChanges() {
  if (ipCheckIntervalId) clearInterval(ipCheckIntervalId);
  ipCheckIntervalId = setInterval(async () => {
    try {
      const newIP = ip.address();
      
      // Filtrem falsos diagnòstics quan l'equip cau momentàniament
      if (!newIP || newIP === '127.0.0.1') return;

      if (newIP !== currentIP) {
        logger.info("Nova xarxa detectada i estabilitzada TCP. IP: " + newIP);
        currentIP = newIP;
        const ssid = await getCurrentSSID();

        // En lloc de tancar/obrir de pitjor forma, aprofitem el protocol de Socket.io
        if (socket && socket.connected) {
          logger.info("Notificant canvi de xarxa al servidor ws-os...");
          socket.emit("updateOS", {
            version: app.getVersion(),
            os: os.platform(),
            ip: currentIP,
            ssid: ssid,
            username: username,
            session: getSessionPayloadForServer(),
          });
          // Si canviem de xarxa hem de tornar a comprovar si la pantalla s'hauria de veure:
          checkCastActive();
        } else if (socket) {
          // Cas límit: Si la IP és nova però el socket ha col·lapsat internament
          socket.disconnect();
          socket.connect();
        }
      }
    } catch (err) {
      logger.error("Error comprovant IP fons:", err);
    }
  }, (process.env.IP_CHECK_INTERVAL || 15) * 1000); // Execució àgil de monitorització
}

function connectToServer() {
  const serverUrl = getSocketBaseFromServerUrl(selectedServerUrl);

  socket = io.connect(serverUrl, {
    transports: ["websocket"],
    path: "/ws-os",
    reconnection: true,     // Fem que socket.IO ho gestioni a baix nivell
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
  });

  // Assignem el Gos de Guarda NOMÉS un cop, independent de l'estatus actual del WebSocket
  checkIPChanges();

  socket.on("connect", async () => {
    logger.info("Connectat al protocol ws-os");
    username = getUsername();
    
    // Obtenim informació fiable només si hi és
    const loopBackIgnore = ip.address();
    currentIP = (loopBackIgnore !== '127.0.0.1') ? loopBackIgnore : currentIP;
    const ssid = await getCurrentSSID();

    logger.info("Enviant metadades segures de sessió (" + username + ")");
    socket.emit("registerOS", {
      version: app.getVersion(),
      os: os.platform(),
      ip: currentIP,
      ssid: ssid,
      alumne: username,
      session: getSessionPayloadForServer(),
    });

    // Després de registrar verifiquem sempre
    checkCastActive();
  });

  socket.on("execute", (data) => {
    if (data.command === "open-display") {
      logger.info("Rebuda ordre d'obrir display");
      createDisplayWindow();
    } else if (data.command === "close-display") {
      logger.info("Rebuda ordre de tancar display");
      closeDisplayWindow();
    } else {
      logger.info("Executant comanda:", data.command);
      if (
        !data.command ||
        (!commands.linux[data.command] && !commands.linux_sudo[data.command])
      ) {
        logger.error("Comanda " + data.command + " no disponible");
        return;
      }

      if (commands.linux[data.command]) {
        const args = data.message ? " " + data.message : "";
        logger.info(
          "Executant comanda: " + commands.linux[data.command] + args
        );
        exec(commands.linux[data.command] + args, (error, stdout, stderr) => {
          if (error) {
            logger.error(`Error: ${error.message}`);
            return;
          }
          if (stderr) {
            logger.error(`Error: ${stderr}`);
            return;
          }
          logger.info(`stdout: ${stdout}`);
        });
      } else if (commands.linux_sudo[data.command]) {
        logger.info(
          "Executant comanda (sudo): " + commands.linux_sudo[data.command]
        );
        exec(
          `echo "${process.env.SUDO_PASSWORD}" | sudo -S ${
            commands.linux_sudo[data.command]
          }`,
          (error, stdout, stderr) => {
            if (error) {
              logger.error(`Error: ${error.message}`);
              return;
            }
            if (stderr) {
              logger.error(`Error: ${stderr}`);
              return;
            }
            logger.info(`stdout: ${stdout}`);
          }
        );
      }
    }
  });

  socket.on("ping", (data) => {
    socket.emit("pong", { version: app.getVersion() });
  });

  socket.on("connect_error", (error) => {
    logger.error("Dificultat accedint al WebSocket (ws-os):", error.message);
  });

  socket.on("disconnect", (reason) => {
    logger.info("Desconnectat de ws-os per:", reason);
  });
}

// Funció per registrar shortcuts només quan el display està obert
function registerDisplayShortcuts() {
  // Desactiva les tecles de sortida només quan el display està obert
  globalShortcut.register("Alt+F4", () => {
    logger.debug("Alt+F4 desactivat (display obert)");
    return false;
  });

  globalShortcut.register("Escape", () => {
    logger.debug("Escape desactivat (display obert)");
    return false;
  });

  // En Linux, també podem desactivar Alt+F2 (executar comanda)
  globalShortcut.register("Alt+F2", () => {
    logger.debug("Alt+F2 desactivat (display obert)");
    return false;
  });

  // Bloqueja altres combinacions habituals
  globalShortcut.register("CommandOrControl+W", () => {
    logger.debug("Ctrl/Cmd+W desactivat (display obert)");
    return false;
  });
  globalShortcut.register("CommandOrControl+Q", () => {
    logger.debug("Ctrl/Cmd+Q desactivat (display obert)");
    return false;
  });
  globalShortcut.register("F11", () => {
    logger.debug("F11 desactivat (display obert)");
    return false;
  });

  // En molts entorns Linux, Alt+Tab i Super són reservats pel SO i no es poden bloquejar
  try {
    /*globalShortcut.register('Super', () => {
            logger.debug('Super desactivat (display obert)');
            return false;
        });*/
  } catch {}
}

// Funció per desregistrar shortcuts quan es tanca el display
function unregisterDisplayShortcuts() {
  try {
    globalShortcut.unregister("Alt+F4");
    globalShortcut.unregister("Escape");
    globalShortcut.unregister("Alt+F2");
    globalShortcut.unregister("CommandOrControl+W");
    globalShortcut.unregister("CommandOrControl+Q");
    globalShortcut.unregister("F11");
    logger.debug("Shortcuts del display desregistrats");
  } catch (e) {
    logger.error("Error desregistrant shortcuts:", e);
  }
}

// Events de l'aplicació
app.whenReady().then(() => {
  loadServerPreference();

  // Comprova si l'usuari està logat
  username = getUsername();
  if (username && username !== "unknown") {
    logger.info("Usuari ja logat:", username);
    isLoggedIn = true;
    createMainWindow();
    connectToServer();
  } else {
    logger.info("No hi ha usuari logat, mostrant login...");
    createLoginWindow();
  }

  // Registra shortcuts globals per a prevenir sortides (Linux) - sempre actius
  globalShortcut.register("Ctrl+Alt+Delete", () => {
    logger.debug("Ctrl+Alt+Delete desactivat");
    return false;
  });

  // Lògica blindada per recuperar xarxa al despertar d'una suspensió
  powerMonitor.on('resume', () => {
    logger.info('Sistema despertat (resume). Esperant a obtenir una IP vàlida per reconectar...');
    if (socket) {
      socket.disconnect(); // Tallem estricament qualsevol túnel zombie
    }
    
    let retries = 0;
    const wakeInterval = setInterval(() => {
      const testIP = ip.address();
      // Esperem fins que se'ns assigni una IP real rutable al negociar l'adreça al router
      if (testIP && testIP !== '127.0.0.1') {
        clearInterval(wakeInterval);
        logger.info('IP establerta després de suspensió en ' + retries + 's. Resumint: ' + testIP);
        if (socket) socket.connect();
      }
      
      retries++;
      if (retries > 30) {
        // Fallback contingència: Si passen 30 segons i no detectem res, força-ho igualment
        clearInterval(wakeInterval);
        logger.warn('Timeout de xarxa en tornar. Intentem reconnectar a cegues.');
        if (socket) socket.connect();
      }
    }, 1000);
  });
});

app.on("window-all-closed", () => {
  // No tanquem l'aplicació quan es tanquen les finestres
  logger.info(
    "Totes les finestres tancades, però l'aplicació segueix executant-se"
  );
});

app.on("before-quit", (e) => {
  // Prevé que l'usuari tanqui l'aplicació
  e.preventDefault();
  logger.debug("Intent de tancar l'aplicació bloquejat");
});

app.on("will-quit", () => {
  // Neteja els shortcuts globals
  globalShortcut.unregisterAll();
});

// IPC handlers per a comunicació entre processos
ipcMain.handle("get-ip", () => {
  return ip.address();
});

ipcMain.handle("get-username", () => {
  logger.debug("get-username cridat, retornant:", username);
  return username;
});

ipcMain.handle("start-exam-session", async (_event, payload) => {
  // TODO(OAuth): validar la identitat amb Google OAuth/OIDC i no només amb dades entrades al formulari.
  const baseUser =
    (payload && payload.baseUser) || username || getUsername() || "unknown";
  if (!isExamUserName(baseUser)) {
    return { ok: false, reason: "not-exam-user" };
  }

  const sessionUser = (payload && payload.user) || null;
  const displayName = (payload && payload.displayName) || null;
  const ttlHours =
    payload && Number.isFinite(Number(payload.ttlHours))
      ? Number(payload.ttlHours)
      : 3;

  if (!sessionUser) {
    return { ok: false, reason: "missing-user" };
  }

  startExamSession(sessionUser, displayName, ttlHours);
  return { ok: true, session: { ...examSession } };
});

ipcMain.handle("end-exam-session", () => {
  resetExamSession("manual-end");
  return { ok: true };
});

ipcMain.handle("get-exam-session", () => {
  return {
    isExamUser: isExamBaseUser(),
    ...examSession,
  };
});

// Retorna la URL del servidor definida a .env per al display/viewer
ipcMain.handle("get-server-url", () => {
  const serverUrl = selectedServerUrl;
  logger.debug("get-server-url cridat, retornant:", serverUrl);
  return serverUrl;
});

ipcMain.handle("get-server-options", () => {
  return {
    primary: normalizeServerUrl(DEFAULT_SERVER_URL),
    secondary: normalizeServerUrl(SECONDARY_SERVER_URL),
    selected: normalizeServerUrl(selectedServerUrl),
  };
});

ipcMain.handle("set-server-url", (_event, serverUrl) => {
  try {
    const saved = saveServerPreference(serverUrl);
    logger.info("Servidor seleccionat:", saved);
    return { ok: true, serverUrl: saved };
  } catch (error) {
    logger.error("Error guardant servidor:", error);
    return { ok: false, error: error.message };
  }
});

// Valida les credencials contra l'API
ipcMain.handle("validate-credentials", async (event, payload) => {
  const username = (payload && payload.username) || "";
  const password = (payload && payload.password) || "";
  const selectedUrlFromUi = payload && payload.serverUrl;
  const apiBase = getApiBaseFromServerUrl(selectedUrlFromUi || selectedServerUrl);
  try {
    const resp = await axios.post(
      `${apiBase}/api/v1/alumne/auth`,
      {
        alumne: username,
        clau: password,
      },
      { validateStatus: () => true }
    );
    logger.debug("validate-credentials resposta:", resp.status);
    if (resp.status === 200) return { ok: true };
    if (resp.status === 401 || resp.status === 404)
      return { ok: false, reason: "invalid" };
    return { ok: false, reason: "server", status: resp.status };
  } catch (err) {
    logger.error("Error validant credencials:", err && err.message);
    return { ok: false, reason: "network", message: err && err.message };
  }
});

// Guarda el nom d'usuari al fitxer .user
ipcMain.handle("save-username", async (event, username) => {
  try {
    const userfile = path.join(app.getPath("userData"), ".user");
    fs.writeFileSync(userfile, username, "utf8");
    logger.info("Usuari guardat:", username);
    return { success: true };
  } catch (error) {
    logger.error("Error guardant usuari:", error);
    return { success: false, error: error.message };
  }
});

// Quan el login es completa
ipcMain.handle("login-completed", () => {
  logger.info("Login completat, iniciant aplicació...");
  isLoggedIn = true;

  // Tanca la finestra de login
  if (loginWindow) {
    loginWindow.close();
    loginWindow = null;
  }

  // Inicia l'aplicació principal
  username = getUsername();
  createMainWindow();
  connectToServer();

  return { success: true };
});

// ========================================
// AUTO-UPDATER - Gestió d'actualitzacions
// ========================================

autoUpdater.on("checking-for-update", () => {
  log.info("Comprovant actualitzacions...");
});

autoUpdater.on("update-available", (info) => {
  log.info("Actualització disponible:", info.version);
});

autoUpdater.on("update-not-available", (info) => {
  log.info("Aplicació actualitzada. Versió actual:", info.version);
});

autoUpdater.on("error", (err) => {
  log.error("Error en actualització:", err);
});

autoUpdater.on("download-progress", (progressObj) => {
  const logMessage = `Descarregant actualització: ${progressObj.percent.toFixed(
    2
  )}%`;
  log.info(logMessage);
});

autoUpdater.on("update-downloaded", (info) => {
  log.info("Actualització descarregada. Versió:", info.version);
  // Instal·la automàticament després de 5 segons
  setTimeout(() => {
    autoUpdater.quitAndInstall();
  }, 5000);
});

// Comprova actualitzacions quan l'app està llesta
app.on("ready", () => {
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 10000); // Espera 10 segons després d'iniciar
  }
});
