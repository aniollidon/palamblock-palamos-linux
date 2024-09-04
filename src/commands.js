const linux_sudo = {
    'hibernar': 'systemctl suspend -i',
    'reiniciar': 'reboot',
    'apaga': 'poweroff',
    'apaga-rapid': 'halt',
    'apaga-tot': 'shutdown -h now',
    'pausa': ' DISPLAY=:1 xinput disable 12; xinput disable 13',
    'repren': 'xinput enable 12; xinput enable 13'
}

const linux = {
    'actualitza': 'cd /home/super/palamblock-palamos-linux; git pull; npm i; pm2 reload worker'
}

module.exports = {linux, linux_sudo};
