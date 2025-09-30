const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');
const { logger } = require('./logger');

function getUsername(){
    let username = 'unknown';
    const userfile = path.join(app.getPath('userData'), '.user');
    logger.info("Cercant user a " + userfile);
    try {
        // Check login on hidden file
        username = fs.readFileSync(userfile, 'utf8');
        // esborra salts de línia
        username = username.replace(/\n/g, '');
    } catch (err){
        logger.error("No login file found");
    }

    return username;
}

function getLinuxUsername() {
    // Agafem el nom de l'usuari del sistema
    return os.userInfo().username;
}


module.exports = {
    getUsername,
    getLinuxUsername
}