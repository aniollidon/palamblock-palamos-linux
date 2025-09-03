const { ipcRenderer } = require("electron");

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
  let isNegotiating = false; // Evitar negociacions simultànies
  let lastRecoveryAttempt = 0;
  const RECOVERY_COOLDOWN_MS = 1500; // ms entre intents de recuperació

  function safeCreateOfferAndSend() {
    if (isNegotiating) return;
    isNegotiating = true;
    try {
      const peer = ensurePeer();
      peer
        .createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        .then((o) => peer.setLocalDescription(o))
        .then(() => {
          console.log("📤 (recover) Enviant viewer-offer directe");
          socket.emit("viewer-offer", {
            room: roomName,
            sdp: peer.localDescription,
          });
          setTimeout(() => {
            isNegotiating = false;
          }, 5000);
        })
        .catch((e) => {
          console.warn("Error createOffer recover:", e);
          isNegotiating = false;
        });
    } catch (e) {
      console.warn("Error inici negociació recover:", e);
      isNegotiating = false;
    }
  }

  function queryAndRestoreState() {
    if (!socket || socket.disconnected) return;
    const now = Date.now();
    if (now - lastRecoveryAttempt < RECOVERY_COOLDOWN_MS) return;
    lastRecoveryAttempt = now;
    console.log("🔍 (recover) cast-active-query", roomName);
    socket.emit("cast-active-query", { alumne: roomName }, (res) => {
      if (!res || !res.active) {
        console.log("🔍 (recover) cap emissió activa");
        return;
      }
      console.log("🔍 (recover) estat actiu:", res);
      if (res.mode === "url") {
        cleanupPeer();
        if (frame) {
          let sandbox = "allow-scripts allow-same-origin";
          if (res.interactive) sandbox += " allow-forms allow-pointer-lock";
          frame.setAttribute("sandbox", sandbox);
          frame.src = res.url || "about:blank";
          frame.classList.remove("hidden");
          frame.style.pointerEvents = res.interactive ? "auto" : "none";
          frame.setAttribute("tabindex", res.interactive ? "0" : "-1");
        }
        if (player) {
          player.classList.add("hidden");
          try {
            player.pause();
          } catch {}
          player.srcObject = null;
        }
        currentMode = "url";
        hideMessage();
        isNegotiating = false;
      } else if (res.mode === "webrtc") {
        // No forcem oferta immediata: confiem en que viewer-join + server ens enviï broadcaster-available
        // Per assegurar que estem a la room correcte, reenviem viewer-join
        console.log(
          "🔁 (recover) Mode webrtc actiu detectat. Reenviant viewer-join i esperant broadcaster-available"
        );
        currentMode = "webrtc";
        cleanupPeer();
        isNegotiating = false;
        socket.emit("viewer-join", { room: roomName });
        // Watchdog: si en 1500ms no hem iniciat negociació (no ha arribat broadcaster-available), reenviem viewer-join
        setTimeout(() => {
          if (currentMode === "webrtc" && !isNegotiating && !mediaStream) {
            console.log(
              "⏱️ (recover) Encara sense negociació, reenviant viewer-join"
            );
            socket.emit("viewer-join", { room: roomName });
          }
        }, 1500);
      }
    });
  }

  // Inicialització
  try {
    const serverUrl = await ipcRenderer.invoke("get-server-url");
    roomName = await ipcRenderer.invoke("get-username");

    console.log("🔧 CONFIGURACIÓ INICIAL:");
    console.log("  - Server URL:", serverUrl);
    console.log("  - Room Name (username):", roomName);

    if (!serverUrl) {
      console.error("❌ Error: servidor no configurat (.env)");
      showMessage("Error: servidor no configurat (.env)");
      return;
    }
    if (!roomName) {
      console.error("❌ Error: no s'ha pogut obtenir el nom d'usuari");
      showMessage("Error: no s'ha pogut obtenir el nom d'usuari");
      return;
    }

    // Connexió al servidor
    socket = io(serverUrl, { path: "/ws-cast" });
    console.log("✅ Socket creat, connectant...");

    // Configurar events de socket
    setupSocketEvents();

    // Iniciar visualització
    startViewing();
  } catch (e) {
    console.error("❌ Error inicialitzant:", e);
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
        player.play().catch((e) => console.warn("Error playing video:", e));
        hideMessage();
        // Assegura que el mode visual és vídeo
        if (frame) {
          frame.classList.add("hidden");
          frame.src = "about:blank";
        }
        player.classList.remove("hidden");
        currentMode = "webrtc";
      } catch (error) {
        console.error("Error handling track:", error);
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
      console.log("Connection state:", pc.connectionState);
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected" ||
        pc.connectionState === "closed"
      ) {
        cleanupPeer();
        showMessage("Connexió perduda. Esperant emissió...");
        setTimeout(queryAndRestoreState, 800);
      } else if (pc.connectionState === "connected") {
        hideMessage();
        isNegotiating = false;
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
    console.log("🎬 Iniciant visualització per sala:", roomName);
    scheduleHideCursor();
    socket.emit("viewer-join", { room: roomName });
    showMessage("Connectant a la sala...");
    // Intent ràpid de recuperar estat si la sessió ja era activa
    setTimeout(queryAndRestoreState, 350);
  }

  function setupSocketEvents() {
    console.log("🔌 Configurant events de socket...");

    socket.on("connect", () => {
      const first = !hasEverConnected;
      hasEverConnected = true;
      console.log("✅ Socket connectat!", first ? "(inicial)" : "(reconnexió)");
      console.log("  - Socket ID:", socket.id);
      console.log("  - Room Name:", roomName);
      // Amaga qualsevol missatge d'error antic
      hideMessage();
      // Si és una reconnexió, tornem a unir-nos a la sala
      if (!first) {
        if (roomName) {
          console.log("🔁 Reenviant viewer-join després de reconnexió");
          socket.emit("viewer-join", { room: roomName });
          showMessage("Reconnectat. Esperant emissió...");
          setTimeout(queryAndRestoreState, 400);
          // Si ja hi ha broadcaster, el servidor ens enviarà els events pertinents
        }
      }
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Error de connexió socket:", error);
      showMessage("Error de connexió: " + error.message);
    });

    socket.on("disconnect", (reason) => {
      console.log("🔌 Socket desconnectat:", reason);
      showMessage("Desconnectat. Reconnectant...");
      shouldRejoin = true;
    });

    socket.on("broadcaster-available", async () => {
      console.log("✅ Broadcaster disponible!");
      showMessage("Emissor disponible. Negociant...");
      isNegotiating = false; // reset
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
        console.log("📤 Enviant viewer-offer");
        socket.emit("viewer-offer", {
          room: roomName,
          sdp: peer.localDescription,
        });
        isNegotiating = true;

        // Timeout per amagar el missatge si la negociació es queda penjada
        setTimeout(() => {
          if (currentMode === "webrtc" && !mediaStream) {
            hideMessage();
            isNegotiating = false;
          }
        }, 5000); // 5 segons
        // Watchdog per desbloquejar si es queda en negociació sense resposta
        setTimeout(() => {
          if (isNegotiating && !mediaStream) {
            console.log("⏱️ (watchdog) Negociació estancada, reiniciant flux");
            isNegotiating = false;
            cleanupPeer();
            socket.emit("viewer-join", { room: roomName });
          }
        }, 6000);
      } catch (error) {
        console.error("Error en la negociació WebRTC:", error);
        hideMessage();
        showMessage("Error en la connexió. Esperant emissió...");
        isNegotiating = false;
      }
    });

    socket.on("broadcaster-answer", async ({ sdp }) => {
      console.log("📥 Rebut broadcaster-answer");
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        hideMessage();
      } catch (error) {
        console.error("Error setting remote description:", error);
        hideMessage();
        showMessage("Error en la connexió. Esperant emissió...");
      }
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      if (!pc || !candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("Error afegint ICE candidate", e);
      }
    });

    socket.on("broadcaster-ended", () => {
      console.log("🔚 Broadcaster ended");
      cleanupPeer();
      // Neteja iframe si estava actiu
      if (frame) {
        frame.classList.add("hidden");
        frame.src = "about:blank";
      }
      player.classList.remove("hidden");
      currentMode = null;
      showMessage("No hi ha emissió ara mateix. Esperant que torni...");
      setTimeout(queryAndRestoreState, 1200);
    });

    // Nou: suport per compartició de URL
    socket.on("url-broadcast-started", ({ url, interactive }) => {
      console.log("🌐 URL broadcast started:", { url, interactive });
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
      isNegotiating = false;
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
