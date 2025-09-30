const { ipcRenderer } = require("electron");
const { logger } = require("../logger");

(async () => {
  const player = document.getElementById("player");
  const frame = document.getElementById("frame");
  const messageEl = document.getElementById("message");

  let socket;
  let roomName;
  let pc = null;
  let mediaStream = null;
  let hideCursorTimer = null;
  let currentMode = null; // 'webrtc' | 'url' | null
  let actualRoom = roomName; // La room real on estem connectats (pot ser diferent si som redirigits)
  let hasEverConnected = false; // Per saber si és una reconnexió
  let shouldRejoin = false; // Marquem que cal tornar a enviar viewer-join
  let reloadScheduled = false; // Per evitar múltiples recàrregues simultànies

  function scheduleReload(delay = 5000) {
    if (reloadScheduled) return;
    reloadScheduled = true;
    logger.debug(
      `Recarregant la pàgina en ${delay} ms per recuperar la connexió WebRTC`
    );
    showMessage(
      `Error de connexió. Reintentant en ${Math.round(delay / 1000)}s...`
    );
    setTimeout(() => {
      location.reload();
    }, delay);
  }

  // Inicialització
  try {
    const serverUrl = await ipcRenderer.invoke("get-server-url");
    roomName = await ipcRenderer.invoke("get-username");

    logger.info("CONFIGURACIÓ INICIAL:");
    logger.info("  - Server URL:", serverUrl);
    logger.info("  - Room Name (username):", roomName);

    if (!serverUrl) {
      logger.error("Error: servidor no configurat (.env)");
      showMessage("Error: servidor no configurat (.env)");
      return;
    }
    if (!roomName) {
      logger.error("Error: no s'ha pogut obtenir el nom d'usuari");
      showMessage("Error: no s'ha pogut obtenir el nom d'usuari");
      return;
    }

    // Connexió al servidor
    socket = io(serverUrl, { path: "/ws-cast" });
    logger.info("Socket creat, connectant...");

    // Configurar events de socket
    setupSocketEvents();

    // Iniciar visualització
    startViewing();
  } catch (e) {
    logger.error("Error inicialitzant:", e);
    showMessage(
      "Error inicialitzant: " + (e && e.message ? e.message : "desconegut")
    );
  }

  function showMessage(text) {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.classList.remove("hidden");
  }

  function hideMessage() {
    if (!messageEl) return;
    messageEl.classList.add("hidden");
  }

  function scheduleHideCursor() {
    if (hideCursorTimer) clearTimeout(hideCursorTimer);
    document.body.classList.remove("nocursor");
    hideCursorTimer = setTimeout(() => {
      document.body.classList.add("nocursor");
    }, 3000);
  }

  ["mousemove", "mousedown", "keydown", "touchstart", "wheel"].forEach(
    (evt) => {
      window.addEventListener(evt, scheduleHideCursor, { passive: true });
    }
  );

  function ensurePeer() {
    if (pc) return pc;
    pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.ontrack = (event) => {
      try {
        if (!mediaStream) {
          mediaStream = new MediaStream();
          player.srcObject = mediaStream;
        }
        if (event.streams && event.streams[0]) {
          event.streams[0].getTracks().forEach((t) => mediaStream.addTrack(t));
        } else {
          mediaStream.addTrack(event.track);
        }
        player.play().catch((e) => logger.warn("Error playing video:", e));
        hideMessage();
        // Assegura que el mode visual és vídeo
        if (frame) {
          frame.classList.add("hidden");
          frame.src = "about:blank";
        }
        player.classList.remove("hidden");
        currentMode = "webrtc";
      } catch (error) {
        logger.error("Error handling track:", error);
        hideMessage();
        showMessage("Error rebent el vídeo. Esperant emissió...");
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          room: roomName,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      logger.info("Connection state:", pc.connectionState);
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected" ||
        pc.connectionState === "closed"
      ) {
        cleanupPeer();
        showMessage("Connexió perduda. Reintentant en 5s...");
        scheduleReload();
      } else if (pc.connectionState === "connected") {
        hideMessage();
      }
    };

    return pc;
  }

  function cleanupPeer() {
    if (pc) {
      try {
        pc.close();
      } catch {}
      pc = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => mediaStream.removeTrack(t));
      mediaStream = null;
    }
    if (player) {
      player.srcObject = null;
    }
  }

  async function startViewing() {
    if (!roomName) {
      showMessage("No s'ha pogut obtenir el nom d'usuari");
      return;
    }
    logger.info("Iniciant visualització per sala:", roomName);
    scheduleHideCursor();
    socket.emit("viewer-join", { room: roomName });
    showMessage("Connectant a la sala...");
  }

  function setupSocketEvents() {
    logger.info("Configurant events de socket...");

    socket.on("connect", () => {
      const first = !hasEverConnected;
      hasEverConnected = true;
      logger.info("Socket connectat!", first ? "(inicial)" : "(reconnexió)");
      logger.info("  - Socket ID:", socket.id);
      logger.info("  - Room Name:", roomName);
      // Amaga qualsevol missatge d'error antic
      hideMessage();
      // Si és una reconnexió, tornem a unir-nos a la sala
      if (!first) {
        if (roomName) {
          logger.info("Reenviant viewer-join després de reconnexió");
          socket.emit("viewer-join", { room: roomName });
          showMessage("Reconnectat. Esperant emissió...");
          // Si ja hi ha broadcaster, el servidor ens enviarà els events pertinents
        }
      }
    });

    socket.on("connect_error", (error) => {
      logger.error("Error de connexió socket:", error);
      showMessage("Error de connexió: " + error.message);
    });

    socket.on("disconnect", (reason) => {
      logger.info("Socket desconnectat:", reason);
      showMessage("Desconnectat. Reconnectant...");
      shouldRejoin = true;
    });

    socket.on("broadcaster-available", async () => {
      logger.info("Broadcaster disponible!");
      showMessage("Emissor disponible. Negociant...");
      // Canvia a mode WebRTC
      if (frame) {
        frame.classList.add("hidden");
        frame.src = "about:blank";
      }
      player.classList.remove("hidden");
      currentMode = "webrtc";

      try {
        const peer = ensurePeer();
        const offer = await peer.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await peer.setLocalDescription(offer);
        logger.info("Enviant viewer-offer");
        socket.emit("viewer-offer", {
          room: roomName,
          sdp: peer.localDescription,
        });

        // Timeout per amagar el missatge si la negociació es queda penjada
        setTimeout(() => {
          if (currentMode === "webrtc" && !mediaStream) {
            hideMessage();
          }
        }, 5000); // 5 segons
      } catch (error) {
        logger.error("Error en la negociació WebRTC:", error);
        hideMessage();
        showMessage("Error en la connexió. Reintentant en 5s...");
        scheduleReload();
      }
    });

    socket.on("broadcaster-answer", async ({ sdp }) => {
      logger.info("Rebut broadcaster-answer");
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        hideMessage();
      } catch (error) {
        logger.error("Error setting remote description:", error);
        hideMessage();
        showMessage("Error en la connexió. Reintentant en 5s...");
        scheduleReload();
      }
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      if (!pc || !candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        logger.warn("Error afegint ICE candidate", e);
      }
    });

    socket.on("broadcaster-ended", () => {
      logger.info("Broadcaster ended");
      cleanupPeer();
      // Neteja iframe si estava actiu
      if (frame) {
        frame.classList.add("hidden");
        frame.src = "about:blank";
      }
      player.classList.remove("hidden");
      currentMode = null;
      showMessage("No hi ha emissió ara mateix. Esperant que torni...");
    });

    // Nou: suport per compartició de URL
    socket.on("url-broadcast-started", ({ url, interactive }) => {
      logger.info("URL broadcast started:", { url, interactive });
      // Tanca connexió WebRTC si existia
      cleanupPeer();
      // Configura l'iframe
      if (frame) {
        // sandbox: allow-scripts allow-same-origin per defecte; si interactive -> afegir allow-forms, allow-pointer-lock
        let sandbox = "allow-scripts allow-same-origin";
        if (interactive) {
          sandbox += " allow-forms allow-pointer-lock";
        }
        frame.setAttribute("sandbox", sandbox);
        frame.src = url || "about:blank";
        frame.classList.remove("hidden");
        // control d'interacció
        frame.style.pointerEvents = interactive ? "auto" : "none";
        frame.setAttribute("tabindex", interactive ? "0" : "-1");
      }
      if (player) {
        player.classList.add("hidden");
        try {
          player.pause();
        } catch {}
        player.srcObject = null;
      }
      hideMessage();
      currentMode = "url";
    });
  }

  // Listener per tancament de missatges emesos (iframe misssatge.html)
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.type !== "palam-message-close") return;
    if (frame) {
      frame.classList.add("hidden");
      frame.src = "about:blank";
    }
    if (player) {
      player.classList.add("hidden");
      try {
        player.pause();
      } catch {}
      player.srcObject = null;
    }
    currentMode = null;
    showMessage("Missatge finalitzat. Esperant emissió...");
  });

  // Prevenir clic dret
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  document.addEventListener(
    "keydown",
    function (e) {
      const key = e.key || "";
      const upper = key.toUpperCase();
      const lower = key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (key === "F12") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (mod && (lower === "s" || lower === "p" || lower === "u")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (
        mod &&
        e.shiftKey &&
        (upper === "I" || upper === "J" || upper === "C")
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    },
    true
  );

  document.addEventListener("dragstart", function (e) {
    e.preventDefault();
  });
})();
