const os = require('os');
const ip = require('ip');
const axios = require('axios');
const {exec} = require('child_process');

require('dotenv').config();


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
    await axios.post(process.env.API_PALAMBLOCK + '/info/machine', {
        currentIp: ip,
        alumne: username
    }).then(async (res) => {})
    .catch((err) => {
        console.error("Server not found");
        console.error(err);
    });
}

async function setup_x11(){
    // AIXÓ ES FA AMB SYSTEMBD
    /*exec("x11vnc -forever -passwd patata123  -alwaysshared & ",  (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            return undefined;

        }
    
        if (stderr) {
            console.error(`Error: ${stderr}`);
            return undefined;
        }
    });*/
}


async function setup_novnc(){
    exec("/home/super/noVNC/utils/novnc_proxy --vnc localhost:5900 & ",  (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            return undefined;
        }
    
        if (stderr) {
            console.error(`Error: ${stderr}`);
            return undefined;
        }
    });
}


setup_x11();
setup_novnc();

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
