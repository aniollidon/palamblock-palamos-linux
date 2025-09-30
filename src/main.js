const { app, BrowserWindow, ipcMain, globalShortcut } = require("electron");
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
require("dotenv").config();

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

// Configuració de l'aplicació
const isDev = process.argv.includes("--dev");

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

function checkIPChanges() {
  setInterval(async () => {
    try {
      const newIP = ip.address();
      if (newIP !== currentIP) {
        currentIP = newIP;
        logger.info("IP canviada a: " + currentIP);

        if (socket && socket.connected) {
          const ssid = await getCurrentSSID();
          socket.emit("updateOS", {
            version: app.getVersion(),
            os: os.platform(),
            ip: currentIP,
            ssid: ssid,
            username: username,
          });
        }
      }
    } catch (err) {
      logger.error("Error comprovant IP:", err);
    }
  }, (process.env.IP_CHECK_INTERVAL || 30) * 1000);
}

function connectToServer() {
  const serverUrl = process.env.SERVER_PALAMBLOCK || "ws://localhost:3000";

  socket = io.connect(serverUrl, {
    transports: ["websocket"],
    path: "/ws-os",
  });

  socket.on("connect", async () => {
    logger.info("Connectat al servidor");
    username = getUsername();
    currentIP = ip.address();
    const ssid = await getCurrentSSID();

    logger.info("Enviant dades al servidor", {
      version: app.getVersion(),
      os: os.platform(),
      ip: currentIP,
      ssid: ssid,
      alumne: username,
    });

    socket.emit("registerOS", {
      version: app.getVersion(),
      os: os.platform(),
      ip: currentIP,
      ssid: ssid,
      alumne: username,
    });

    // Inicia la comprovació d'IP
    checkIPChanges();

    // Després de registrar la màquina, comprova via ws-cast si hi ha emissió activa
    try {
      const castBase = (
        process.env.SERVER_PALAMBLOCK || "http://localhost:3000"
      ).replace(/\/$/, "");
      const castSocket = io.connect(castBase, {
        path: "/ws-cast",
        transports: ["websocket"],
      });
      let answered = false;
      castSocket.on("connect", () => {
        try {
          castSocket.emit("cast-active-query", { alumne: username }, (res) => {
            answered = true;
            if (res && res.active) {
              logger.info("Emissió activa detectada (ws-cast):", res);
              if (!isDisplayOpen) createDisplayWindow();
            } else {
              logger.info("Cap emissió activa en iniciar (ws-cast).");
            }
            try {
              castSocket.close();
            } catch {}
          });
        } catch (e) {
          logger.error("Error enviant cast-active-query:", e.message);
        }
      });
      // Timeout de seguretat
      setTimeout(() => {
        if (!answered) {
          try {
            castSocket.close();
          } catch {}
        }
      }, 4000);
    } catch (e) {
      logger.error(
        "Error comprovant emissió activa (ws-cast):",
        e && e.message
      );
    }
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
    logger.error("Error de connexió:", error.message);
  });

  socket.on("disconnect", () => {
    logger.info("Desconnectat del servidor");
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
  const username = getUsername();
  logger.debug("get-username cridat, retornant:", username);
  return username;
});

// Retorna la URL del servidor definida a .env per al display/viewer
ipcMain.handle("get-server-url", () => {
  const serverUrl = process.env.SERVER_PALAMBLOCK || "http://localhost:3000";
  logger.debug("get-server-url cridat, retornant:", serverUrl);
  return serverUrl;
});

// Valida les credencials contra l'API
ipcMain.handle("validate-credentials", async (event, payload) => {
  const username = (payload && payload.username) || "";
  const password = (payload && payload.password) || "";
  const apiBase = process.env.SERVER_PALAMBLOCK || "http://localhost:3000";
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
