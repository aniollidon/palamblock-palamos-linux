const http = require("http");
const { logger } = require("./logger");

let bridgeServer = null;
let currentCredentials = { server: "", alumne: "" };

/**
 * Inicia el servidor HTTP del pont local.
 * Només accepta connexions des de localhost.
 * @param {string} serverUrl - URL del servidor palamSRV
 * @param {string} username - Nom d'alumne autenticat
 * @param {number} port - Port (per defecte 9876)
 */
function startBridgeServer(serverUrl, username, port = 9876) {
  if (bridgeServer) return;

  currentCredentials.server = serverUrl;
  currentCredentials.alumne = username;

  bridgeServer = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");

    if (req.method === "GET" && req.url === "/credentials") {
      if (currentCredentials.alumne && currentCredentials.server) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            server: currentCredentials.server,
            alumne: currentCredentials.alumne,
          }),
        );
      } else {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "not_authenticated" }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  bridgeServer.listen(port, "127.0.0.1", () => {
    logger.info(`[Bridge] Servidor HTTP iniciat a localhost:${port}`);
  });

  bridgeServer.on("error", (err) => {
    logger.error(`[Bridge] Error del servidor: ${err.message}`);
    bridgeServer = null;
  });
}

/**
 * Atura el servidor HTTP.
 */
function stopBridgeServer() {
  if (bridgeServer) {
    bridgeServer.close();
    bridgeServer = null;
    logger.info("[Bridge] Servidor aturat");
  }
}

module.exports = { startBridgeServer, stopBridgeServer };
