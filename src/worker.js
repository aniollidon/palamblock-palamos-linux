const os = require('os');
const ip = require('ip');
const axios = require('axios');

let currentIP = null;
let username = 'unknown';

// Get version from package.json
const {version} = require('../package.json');
const fs = require("fs");
const path = require("path");
console.log("Starting PalamOS worker version " + version);

try {
    // Check login on hidden file
    username = fs.readFileSync(path.join(__dirname, 'login.txt'), 'utf8');
} catch (err) {
    // No login file, create one
    require('./login-launcher')
}

async function sendIP (ip, username){
    await axios.post(process.env.API_PALAMBLOCK + '/register/machine', {
        ip: ip,
        alumne: username
    }).then(async (res) => {})
    .catch((err) => {
        console.error("Server not found");
    });
}

setInterval(async () => {
    try{
        // Check IP
        if(currentIP !== ip.address() && username !== 'unknown') {
            currentIP = ip.address();
            console.log("IP changed to " + currentIP);
            // Send IP to server
            await sendIP(currentIP, username);
        }
    }
    catch (err) {
        console.log(err);
    }}, process.env.IP_CHECK_INTERVAL * 1000);
