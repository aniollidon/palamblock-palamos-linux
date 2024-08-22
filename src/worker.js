const os = require('os');
const ip = require('ip');
const axios = require('axios');
const io = require('socket.io-client');

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

// Connect to server
const socket = io.connect(process.env.SERVER_PALAMBLOCK, {
    transports: ["websocket"],
    path: '/ws-os'});

socket.on('connect', function () {
    console.log('Connected to server');
    socket.emit('registerOS', {version: version, os: os.platform(), username: username});

    setInterval(async () => {
        try{
            // Check IP
            if(currentIP !== ip.address() && username !== 'unknown') {
                currentIP = ip.address();
                console.log("IP changed to " + currentIP);
                // Send IP to server
                socket.emit('newIP', {ip: currentIP, username: username});
            }
        }
        catch (err) {
            console.log(err);
        }}, process.env.IP_CHECK_INTERVAL * 1000);

});

socket.on('connect_error', (error) => {
    console.log('Error', error.message);
    return false;
});

async function sendIP_url (ip, username){
    await axios.post(process.env.API_PALAMBLOCK + '/register/machine', {
        ip: ip,
        alumne: username
    }).then(async (res) => {})
    .catch((err) => {
        console.error("Server not found");
    });
}
