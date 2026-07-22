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
const { startCapture, stopCapture, setSessionId } = require("./capture");
const { getMachineId } = require("./machineId");
const { startBridgeServer, stopBridgeServer } = require("./bridge");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
// Ruta a la icona local dins palamOS-linux/assets/palamOS-logo.png
const APP_ICON = path.join(__dirname, "..", "assets", "palamOS-logo.png");
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
let currentLoginContext = { examOnly: false, baseUser: "" };
let examSessionTimer = null;
const examSession = {
  active: false,
  user: null,
  displayName: null,
  startedAt: null,
  expiresAt: null,
  sessionId: null,
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

function normalizeTextValue(value) {
  if (typeof value === "string") {
    return value.replace(/(\r\n|\n|\r)/gm, "").trim();
  }

  if (value && typeof value === "object") {
    return normalizeTextValue(
      value.displayName ?? value.name ?? value.user ?? value.label ?? value.text ?? value.value
    );
  }

  return null;
}

function getSessionPayloadForServer() {
  if (!isExamBaseUser()) return undefined;
  return {
    active: examSession.active,
    user: normalizeTextValue(examSession.user),
    displayName: normalizeTextValue(examSession.displayName),
    expiresAt: examSession.expiresAt,
  };
}

function emitSessionChange(reason) {
  if (!(socket && socket.connected)) return false;

  socket.emit("session_change", {
    active: examSession.active,
    user: normalizeTextValue(examSession.user),
    displayName: normalizeTextValue(examSession.displayName),
    expiresAt: examSession.expiresAt,
    sessionId: examSession.sessionId,
    startedAt: examSession.startedAt,
    machineId: getMachineId(),
    reason,
  });

  return true;
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
  examSession.sessionId = null;

  emitSessionChange(reason);

  // Si la sessió s'ha desactivat, neteja el sessionId de les captures
  if (!examSession.active) {
    setSessionId(null);
  }
}

function startExamSession(user, displayName, ttlHours = 3) {
  clearExamSessionTimer();
  examSession.active = true;
  examSession.user = normalizeTextValue(user);
  examSession.displayName = normalizeTextValue(displayName);
  examSession.startedAt = new Date().toISOString();
  examSession.sessionId = String(Date.now());
  examSession.expiresAt = new Date(
    Date.now() + ttlHours * 60 * 60 * 1000
  ).toISOString();

  examSessionTimer = setTimeout(() => {
    logger.info("Sessio temporal d'examen expirada");
    resetExamSession("expired");
  }, ttlHours * 60 * 60 * 1000);

  emitSessionChange("login2");

  // Actualitza el sessionId al sistema de captures
  setSessionId(examSession.sessionId);
}

function createLoginWindow(loginContext = { examOnly: false, baseUser: "" }) {
  currentLoginContext = {
    examOnly: Boolean(loginContext?.examOnly),
    baseUser:
      typeof loginContext?.baseUser === "string" ? loginContext.baseUser : "",
  };

  loginWindow = new BrowserWindow({
    width: 500,
    height: 720,
    icon: APP_ICON,
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
    fullscreen: false,
  });

  // Carrega la pàgina de login
  loginWindow.loadFile("src/login.html");

  // Mostra la finestra quan estigui carregada
  loginWindow.once("ready-to-show", () => {
    loginWindow.show();
    // Força visibilitat a tots els escriptoris i sempre al davant
    try {
      loginWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
      loginWindow.setAlwaysOnTop(true, "screen-saver");
      loginWindow.focus();
    } catch {}
    logger.info("Login window oberta");
  });

  // Reforç de focus: si es minimitza o perd el focus, el recuperem
  loginWindow.on("minimize", (e) => {
    try { e.preventDefault(); } catch {}
    try {
      loginWindow.restore();
      loginWindow.show();
      loginWindow.focus();
    } catch {}
  });

  loginWindow.on("blur", () => {
    if (loginWindow && !isLoggedIn) {
      setTimeout(() => {
        try {
          if (loginWindow) {
            loginWindow.show();
            loginWindow.focus();
          }
        } catch {}
      }, 50);
    }
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
    icon: APP_ICON,
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
    icon: APP_ICON,
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

    // Assegura que el focus keeper està actiu
    startFocusKeeper();

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

  const castBase = getSocketBaseFromServerUrl(selectedServerUrl).replace(/\/$/, "");
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

  castSocket.on("connect_error", (error) => {
    logger.warn(
      "No s'ha pogut verificar seqüència d'emissió (connect_error a ws-cast):",
      error && error.message
    );
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

    // Si el segon login ja ha iniciat sessió abans de tenir socket, reemeten l'event.
    if (isExamBaseUser() && examSession.active) {
      emitSessionChange("login2-connect");
    }

    // Inicia el sistema de captures de pantalla
    const machineId = getMachineId();
    startCapture(socket, username, machineId, examSession.sessionId);

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

// ========================================
// FOCUS KEEPER: Assegura que les finestres de login i display
// es mantinguin sempre al front i visibles a tots els workspaces
// ========================================
let focusKeeperInterval = null;

function startFocusKeeper() {
  if (focusKeeperInterval) return;
  focusKeeperInterval = setInterval(() => {
    // Login window: sempre al front mentre no s'hagi fet login
    if (loginWindow && !isLoggedIn) {
      try {
        if (loginWindow.isMinimized()) {
          loginWindow.restore();
        }
        if (!loginWindow.isFocused()) {
          loginWindow.show();
          loginWindow.focus();
        }
        // Reforça sticky i alwaysOnTop periòdicament
        loginWindow.setVisibleOnAllWorkspaces(true, {
          visibleOnFullScreen: true,
        });
        loginWindow.setAlwaysOnTop(true, "screen-saver");
      } catch {}
    }

    // Display window: sempre al front mentre estigui obert
    if (displayWindow && isDisplayOpen) {
      try {
        if (displayWindow.isMinimized()) {
          displayWindow.restore();
        }
        if (!displayWindow.isFocused()) {
          displayWindow.show();
          displayWindow.focus();
        }
        // Reforça sticky, alwaysOnTop i fullscreen periòdicament
        displayWindow.setVisibleOnAllWorkspaces(true, {
          visibleOnFullScreen: true,
        });
        displayWindow.setAlwaysOnTop(true, "screen-saver");
        if (!displayWindow.isFullScreen()) {
          displayWindow.setFullScreen(true);
        }
      } catch {}
    }
  }, 500);
  logger.debug("Focus keeper iniciat");
}

function stopFocusKeeper() {
  if (focusKeeperInterval) {
    clearInterval(focusKeeperInterval);
    focusKeeperInterval = null;
    logger.debug("Focus keeper aturat");
  }
}

// Events de l'aplicació
app.whenReady().then(() => {
  logger.info(`PalamOS Dashboard v${app.getVersion()}`);
  loadServerPreference();

  // Comprova si l'usuari està logat
  username = getUsername();
  if (username && username !== "unknown") {
    if (isExamUserName(username)) {
      logger.info("Usuari examen detectat. Obrint directament login2:", username);
      createLoginWindow({ examOnly: true, baseUser: username });
      startFocusKeeper();
    } else {
      logger.info("Usuari ja logat:", username);
      isLoggedIn = true;
      createMainWindow();
      connectToServer();
      // Inicia el pont local
      const bridgePort = parseInt(process.env.BRIDGE_PORT, 10) || 9876;
      startBridgeServer(selectedServerUrl, username, bridgePort, SECONDARY_SERVER_URL);
    }
  } else {
    logger.info("No hi ha usuari logat, mostrant login...");
    createLoginWindow({ examOnly: false, baseUser: "" });
    startFocusKeeper();
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

  // Comprova actualitzacions automàticament en producció
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 10000); // Espera 10 segons després d'iniciar
  }
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
  // Atura el pont local
  stopBridgeServer();
  // Atura el sistema de captures
  stopCapture();
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

ipcMain.handle("get-login-context", () => {
  return { ...currentLoginContext };
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("start-exam-session", async (_event, payload) => {
  const baseUser =
    (payload && payload.baseUser) || username || getUsername() || "unknown";
  if (!isExamUserName(baseUser)) {
    return { ok: false, error: "L'usuari base no és de tipus examen." };
  }

  const oauthCode = payload && payload.code;
  if (!oauthCode) {
    return { ok: false, error: "Falta el codi de validació d'OAuth de Google." };
  }

  const ttlHours =
    payload && Number.isFinite(Number(payload.ttlHours))
      ? Number(payload.ttlHours)
      : 3;

  const apiBase = getApiBaseFromServerUrl(selectedServerUrl);

  try {
    logger.info("Validant codi d'autenticació amb Google al servidor central...");
    const resp = await axios.post(
      `${apiBase}/api/v1/alumne/auth/google`,
      { code: oauthCode },
      { validateStatus: () => true }
    );

    logger.debug("Resposta autenticació Google del servidor central:", resp.status);

    if (resp.status !== 200 || !resp.data || resp.data.status !== "OK") {
      const errMsg = (resp.data && resp.data.data && resp.data.data.error) || "Error d'autenticació amb Google.";
      return { ok: false, error: errMsg };
    }

    const googlePayload = resp.data.data;
    const sessionUser = googlePayload.email;
    const displayName = `${googlePayload.nom} ${googlePayload.cognoms || ""}`.trim();

    if (!sessionUser) {
      return { ok: false, error: "El servidor de Google no ha retornat un correu vàlid." };
    }

    startExamSession(sessionUser, displayName, ttlHours);
    return { ok: true, session: { ...examSession } };

  } catch (err) {
    logger.error("Error al validar el codi OAuth de Google contra palamSRV:", err && err.message);
    return { ok: false, error: `Error de xarxa amb el servidor central: ${err.message}` };
  }
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

// Handler per iniciar el procés d'autenticació amb Google OAuth
ipcMain.handle("start-google-auth", async () => {
  return new Promise((resolve) => {
    const googleClientId = "1084270042118-o7og5umgkvhjluc5g2van7j7p3sg7jm5.apps.googleusercontent.com";
    // S'afegeix el paràmetre hd=inspalamos.cat per indicar a Google el domini de treball predeterminat dels alumnes
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${googleClientId}&redirect_uri=http://localhost&response_type=code&scope=email%20profile&hd=inspalamos.cat`;

    const authWindow = new BrowserWindow({
      width: 500,
      height: 650,
      icon: APP_ICON,
      parent: loginWindow || mainWindow,
      show: false,
      resizable: true,
      alwaysOnTop: true,
      autoHideMenuBar: true, // Oculta barra d'eines / fitxers / menú predeterminat
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: "temp_google_auth_session_" + Date.now(), // Força una sessió completament nova i no persistent a Electron
      },
    });

    // Eliminació estricta del menú superior (Fitxer, Eines, etc.)
    authWindow.removeMenu();

    authWindow.loadURL(authUrl);

    authWindow.once("ready-to-show", () => {
      authWindow.show();
      authWindow.focus();
    });

    let resolved = false;

    const handleNavigation = (url) => {
      if (url.startsWith("http://localhost")) {
        resolved = true;
        try {
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get("code");
          const error = urlObj.searchParams.get("error");

          if (code) {
            resolve({ ok: true, code });
          } else {
            resolve({ ok: false, error: error || "Autenticació fallida o cancel·lada." });
          }
        } catch (e) {
          resolve({ ok: false, error: "Error de redirecció des de l'autenticació de Google." });
        }
        authWindow.close();
      }
    };

    authWindow.webContents.on("will-navigate", (event, url) => {
      handleNavigation(url);
    });

    authWindow.webContents.on("will-redirect", (event, url) => {
      handleNavigation(url);
    });

    authWindow.on("close", () => {
      if (!resolved) {
        resolve({ ok: false, error: "Finestra de login de Google tancada per l'usuari." });
      }
    });
  });
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

  // Inicia el pont local per a l'extensió del navegador
  const bridgePort = parseInt(process.env.BRIDGE_PORT, 10) || 9876;
  startBridgeServer(selectedServerUrl, username, bridgePort, SECONDARY_SERVER_URL);

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

  // Copiar la nova AppImage a /data/palamos-dashboard/ (no cal sudo, alumne hi té permisos)
  const downloadedFile = info.downloadedFile;
  if (downloadedFile && fs.existsSync(downloadedFile)) {
    try {
      const targetPath = "/data/palamos-dashboard/bin/palam-dash.AppImage";
      fs.copyFileSync(downloadedFile, targetPath);
      fs.chmodSync(targetPath, 0o755);
      log.info("AppImage actualitzada a", targetPath);
    } catch (err) {
      log.error("Error copiant AppImage a /data/palamos-dashboard/bin:", err);
    }
  } else {
    log.warn("No s'ha trobat el fitxer descarregat a:", downloadedFile);
  }

  // Reiniciar: systemd té Restart=always, així que app.exit(0) reinicia el servei
  setTimeout(() => {
    log.info("Reiniciant aplicació per aplicar l'actualització...");
    app.exit(0);
  }, 1000);
});

// Les comprovacions d'actualització es fan dins app.whenReady().then()
