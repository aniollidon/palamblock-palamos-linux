const os = require('os');
const { logger } = require('./logger');

/**
 * Obté un identificador estable de la màquina basat en l'adreça MAC.
 * Filtra interfícies internes (loopback) i adreces buides.
 * @returns {string} MAC address normalitzada (ex: "aa-bb-cc-dd-ee-ff") o hostname com a fallback.
 */
function getMachineId() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        const normalized = net.mac.replace(/:/g, '-').toLowerCase();
        logger.debug(`[machineId] MAC trobada a "${name}": ${normalized}`);
        return normalized;
      }
    }
  }

  // Fallback: usa el hostname si no es troba cap MAC vàlida
  const fallback = os.hostname();
  logger.warn(`[machineId] Cap MAC vàlida trobada, usant hostname: ${fallback}`);
  return fallback;
}

module.exports = { getMachineId };
