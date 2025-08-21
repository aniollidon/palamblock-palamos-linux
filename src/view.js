const { ipcRenderer } = require('electron');

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

	// Inicialització
	try {
		const serverUrl = await ipcRenderer.invoke('get-server-url');
		roomName = await ipcRenderer.invoke('get-username');

		console.log('🔧 CONFIGURACIÓ INICIAL:');
		console.log('  - Server URL:', serverUrl);
		console.log('  - Room Name (username):', roomName);

		if (!serverUrl) {
			console.error('❌ Error: servidor no configurat (.env)');
			showMessage('Error: servidor no configurat (.env)');
			return;
		}
		if (!roomName) {
			console.error('❌ Error: no s\'ha pogut obtenir el nom d\'usuari');
			showMessage('Error: no s\'ha pogut obtenir el nom d\'usuari');
			return;
		}

		// Connexió al servidor
		socket = io(serverUrl, { path: '/ws-cast' });
		console.log('✅ Socket creat, connectant...');
		
		// Configurar events de socket
		setupSocketEvents();
		
		// Iniciar visualització
		startViewing();

	} catch (e) {
		console.error('❌ Error inicialitzant:', e);
		showMessage('Error inicialitzant: ' + (e && e.message ? e.message : 'desconegut'));
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

	["mousemove", "mousedown", "keydown", "touchstart", "wheel"].forEach((evt) => {
		window.addEventListener(evt, scheduleHideCursor, { passive: true });
	});

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
		console.log('🎬 Iniciant visualització per sala:', roomName);
		scheduleHideCursor();
		socket.emit("viewer-join", { room: roomName });
		showMessage("Connectant a la sala...");
	}

	function setupSocketEvents() {
		console.log('🔌 Configurant events de socket...');
		
		socket.on("connect", () => {
			console.log('✅ Socket connectat!');
			console.log('  - Socket ID:', socket.id);
			console.log('  - Room Name:', roomName);
		});

		socket.on("connect_error", (error) => {
			console.error('❌ Error de connexió socket:', error);
			showMessage('Error de connexió: ' + error.message);
		});

		socket.on("disconnect", (reason) => {
			console.log('🔌 Socket desconnectat:', reason);
			showMessage('Desconnectat del servidor');
		});

		socket.on("broadcaster-available", async () => {
			console.log('✅ Broadcaster disponible!');
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
				console.log('📤 Enviant viewer-offer');
				socket.emit("viewer-offer", { room: roomName, sdp: peer.localDescription });

				// Timeout per amagar el missatge si la negociació es queda penjada
				setTimeout(() => {
					if (currentMode === "webrtc" && !mediaStream) {
						hideMessage();
					}
				}, 5000); // 5 segons
			} catch (error) {
				console.error("Error en la negociació WebRTC:", error);
				hideMessage();
				showMessage("Error en la connexió. Esperant emissió...");
			}
		});

		socket.on("broadcaster-answer", async ({ sdp }) => {
			console.log('📥 Rebut broadcaster-answer');
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
			console.log('🔚 Broadcaster ended');
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
			console.log('🌐 URL broadcast started:', { url, interactive });
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
  