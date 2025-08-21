const os = require('os');
const ip = require('ip');
const axios = require('axios');
const io = require('socket.io-client');
const {exec} = require('child_process');
const fs = require("fs");
const path = require("path");
const commands = require('./commands');
require('dotenv').config();

// Get version from package.json
const {version} = require('../package.json');

console.log("Starting PalamOS worker version " + version);

function readUsername(){
    let username = 'unknown';
    try {
        // Check login on hidden file
        username = fs.readFileSync(path.join(__dirname, 'login.txt'), 'utf8');
    } catch (err){
        console.log("No login file found");
    }

    return username;
}

async function setup_x11(){
    // AIXÓ ES FA AMB SYSTEMBD
    /*exec("x11vnc -forever -passwd PASSWORD  -alwaysshared & ",  (error, stdout, stderr) => {
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
function get_ssid_wifi(){
    return ;
    /*
    // command iwgetid -r
    return new Promise((resolve, reject) => {
        exec("iwgetid -r", (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                reject(error);
            }

            if (stderr) {
                console.error(`Error: ${stderr}`);
                reject(stderr);
            }

            resolve(stdout);
        });
    });*/
}

function checkIPChanges(socket){
    let currentIP = null;
    let counter = 0;
    setInterval(async () => {
        try {
            // Check IP
            if (counter >= process.env.IP_SEND_ALWAYS_CHECK || currentIP !== ip.address()) {
                counter = 0;
                currentIP = ip.address();

                //get_ssid_wifi().then(async (ssid) => {
                    console.log("IP changed to " + currentIP);
                    // Send IP to server
                    socket.emit('updateOS', {
                        version: version,
                        os: os.platform(),
                        ip: currentIP,
                        ssid: 'unknown',
                        username: username});
                //});
            }
        }
        catch (err) {
            console.log(err);
        }}, process.env.IP_CHECK_INTERVAL * 1000);
}

async function sendIP_url (ip, username){
    await axios.post(process.env.API_PALAMBLOCK + '/register/machine', {
        currentIp: ip,
        alumne: username
    }).then(async (res) => {})
    .catch((err) => {
        console.error("Server not found");
    });
}


const username = readUsername();
console.log("Username: " + username);

if (username === 'unknown')
{
    require('./login-launcher')
    const waitToStart = setInterval(() => {
        const username = readUsername();
        if (username !== 'unknown'){
            clearInterval(waitToStart);
            start();
        }}, 1000);
}
else{
    start();
}

function start(){
    // Setup X11 and noVNC
    setup_x11();
    setup_novnc();

    // Connect to server
    const socket = io.connect(process.env.SERVER_PALAMBLOCK, {
        transports: ["websocket"],
        path: '/ws-os'});

    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('registerOS', {
            version: version,
            os: os.platform(),
            ip: ip.address(),
            ssid:"unknown",
            alumne: username});
        checkIPChanges(socket);
    });

    socket.on('execute', (data) => {
        console.log('Executing command: ' + data.command);

        if (!data.command ||  !commands.linux[data.command] && !commands.linux_sudo[data.command]) {
            console.error('Command ' + data.command +' not available');
            return;
        }

        // Execute command
        if(commands.linux[data.command]) {
            const args = data.message ? " " + data.message : "";
            console.log("Executing command: " + commands.linux[data.command] + args);
            exec(commands.linux[data.command] + args, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error: ${error.message}`);
                    return;
                }

                if (stderr) {
                    console.error(`Error: ${stderr}`);
                    return;
                }

                console.log(`stdout: ${stdout}`);
            });
        }
        else if(commands.linux_sudo[data.command]) {
            console.log("Executing command: " + commands.linux_sudo[data.command]);
            exec(`echo "${process.env.SUDO_PASSWORD}" | sudo -S ${commands.linux_sudo[data.command]}`,
                (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error: ${error.message}`);
                        return;
                    }

                    if (stderr) {
                        console.error(`Error: ${stderr}`);
                        return;
                    }

                    console.log(`stdout: ${stdout}`);
                });
        }});



    socket.on('connect_error', (error) => {
        console.error('Error', error.message);
        return false;
    });

    socket.on('ping', (data) => {
        socket.emit('pong', {version: version});
    });
}

