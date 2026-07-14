const { desktopCapturer, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { logger } = require('./logger');

// ─── Carrega sharp (WebP) amb fallback a JPEG natiu ──────────────
let sharp = null;
let imageFormat = 'jpg'; // 'webp' | 'jpg'

try {
  sharp = require('sharp');
  imageFormat = 'webp';
  logger.info('[capture] sharp carregat: format WebP');
} catch (e) {
  logger.warn(`[capture] sharp no disponible (${e.message || e.code || 'error desconegut'}). Fent servir JPEG natiu d\'Electron.`);
  logger.warn('[capture] Per WebP, executa: npm install sharp && npx electron-rebuild -f -w sharp');
}

// ─── Estat intern ────────────────────────────────────────────────
let captureIntervalId = null;
let sendIntervalId = null;
let socketRef = null;
let usernameRef = null;
let machineIdRef = null;
let sessionIdRef = null;
let captureInterval = 30;    // segons entre captures
let captureImgBuffer = 120;  // maxim d'imatges locals
let captureSendInterval = 180; // segons entre enviaments
const pendingAcks = new Set(); // fitxers pendents de confirmacio del servidor

// ─── Helpers ────────────────────────────────────────────────────

function getFileExtension() {
  return imageFormat === 'webp' ? '.webp' : '.jpg';
}

function getLocalDir() {
  return path.join(app.getPath('userData'), 'screenshots');
}

function ensureLocalDir() {
  const dir = getLocalDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`[capture] Carpeta local creada: ${dir}`);
  }
  return dir;
}

function getLocalFiles() {
  const dir = getLocalDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.webp') || f.endsWith('.jpg'))
    .map(f => path.join(dir, f));
}

function applyLocalBufferLimit() {
  let files = getLocalFiles();
  // Ordena per nom (timestamp.webp) ascendent — els més antics primer
  files.sort();

  while (files.length > captureImgBuffer) {
    const oldest = files.shift();
    try {
      fs.unlinkSync(oldest);
      logger.debug(`[capture] Buffer local ple, esborrat: ${path.basename(oldest)}`);
    } catch (e) {
      logger.error(`[capture] Error esborrant ${oldest}:`, e.message);
    }
  }
}

// ─── Captura ─────────────────────────────────────────────────────

async function takeScreenshot() {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });

    if (!sources || sources.length === 0) {
      logger.warn('[capture] No s\'ha trobat cap font de pantalla');
      return null;
    }

    const source = sources[0];
    const ext = getFileExtension();
    let imageBuffer;

    if (imageFormat === 'webp' && sharp) {
      // WebP via sharp (millor compressio)
      const pngBuffer = source.thumbnail.toPNG();
      imageBuffer = await sharp(pngBuffer)
        .webp({ quality: 80 })
        .toBuffer();
    } else {
      // JPEG natiu d'Electron (fallback)
      imageBuffer = source.thumbnail.toJPEG(80);
    }

    const timestamp = Date.now();
    const filename = `${timestamp}${ext}`;
    const localPath = path.join(ensureLocalDir(), filename);

    fs.writeFileSync(localPath, imageBuffer);
    logger.debug(`[capture] Captura desada: ${filename} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

    // Aplica limit del buffer local
    applyLocalBufferLimit();

    return filename;
  } catch (err) {
    logger.error('[capture] Error capturant pantalla:', err.message);
    return null;
  }
}

// ─── Enviament ───────────────────────────────────────────────────

async function sendPendingScreenshots() {
  if (!socketRef || !socketRef.connected) {
    logger.debug('[capture] Socket no connectat — enviament posposat');
    return;
  }

  const files = getLocalFiles();
  if (files.length === 0) return;

  logger.info(`[capture] Enviant ${files.length} captures pendents...`);

  for (const filePath of files) {
    const filename = path.basename(filePath);

    // Evita reenviar fitxers que ja estan pendents d'ack
    if (pendingAcks.has(filename)) continue;

    try {
      const buffer = fs.readFileSync(filePath);
      pendingAcks.add(filename);

      socketRef.emit('screenshot_upload', {
        alumne: usernameRef,
        machineId: machineIdRef,
        filename,
        format: imageFormat,
        sessionId: sessionIdRef,
        timestamp: new Date().toISOString(),
      }, buffer);

      logger.debug(`[capture] Enviat: ${filename}`);
    } catch (err) {
      logger.error(`[capture] Error enviant ${filename}:`, err.message);
      pendingAcks.delete(filename);
    }
  }
}

// ─── Confirmació del servidor ────────────────────────────────────

function handleAck(data) {
  const { filename, status } = data || {};
  if (!filename) return;

  pendingAcks.delete(filename);

  if (status === 'ok') {
    const filePath = path.join(getLocalDir(), filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`[capture] Esborrat local després d'ack: ${filename}`);
      }
    } catch (err) {
      logger.error(`[capture] Error esborrant ${filename} després d'ack:`, err.message);
    }
  } else {
    logger.warn(`[capture] Servidor ha rebutjat ${filename}: ${data.message || 'desconegut'}`);
  }
}

// ─── API pública ─────────────────────────────────────────────────

function startCapture(socket, username, machineId, sessionId, config = {}) {
  if (captureIntervalId || sendIntervalId) {
    logger.warn('[capture] El sistema de captura ja esta en marxa');
    return;
  }

  socketRef = socket;
  usernameRef = username;
  machineIdRef = machineId;
  sessionIdRef = sessionId || null;

  captureInterval = parseInt(config.captureInterval || process.env.CAPTURE_INTERVAL || 30, 10);
  captureImgBuffer = parseInt(config.captureImgBuffer || process.env.CAPTURE_IMG_BUFFER || 120, 10);
  captureSendInterval = parseInt(config.captureSendInterval || process.env.CAPTURE_SEND_INTERVAL || 180, 10);

  ensureLocalDir();

  // Escolta les confirmacions del servidor
  socket.on('screenshot_ack', handleAck);

  // Interval de captura
  captureIntervalId = setInterval(async () => {
    await takeScreenshot();
  }, captureInterval * 1000);

  // Interval d'enviament
  sendIntervalId = setInterval(async () => {
    await sendPendingScreenshots();
  }, captureSendInterval * 1000);

  logger.info(
    `[capture] Sistema iniciat: captura cada ${captureInterval}s, ` +
    `buffer ${captureImgBuffer} imatges, enviament cada ${captureSendInterval}s, ` +
    `format: ${imageFormat}`
  );
  logger.info(`[capture] Alumne: ${username}, Maquina: ${machineId}`);
}

function stopCapture() {
  if (captureIntervalId) {
    clearInterval(captureIntervalId);
    captureIntervalId = null;
  }
  if (sendIntervalId) {
    clearInterval(sendIntervalId);
    sendIntervalId = null;
  }

  if (socketRef) {
    socketRef.off('screenshot_ack', handleAck);
  }

  socketRef = null;
  usernameRef = null;
  machineIdRef = null;
  sessionIdRef = null;
  pendingAcks.clear();

  logger.info('[capture] Sistema aturat');
}

/**
 * Actualitza el sessionId actual (cridat quan canvia la sessió d'examen).
 * @param {string|null} sessionId
 */
function setSessionId(sessionId) {
  sessionIdRef = sessionId || null;
  logger.debug(`[capture] sessionId actualitzat: ${sessionIdRef || 'null'}`);
}

module.exports = { startCapture, stopCapture, takeScreenshot, sendPendingScreenshots, setSessionId };
