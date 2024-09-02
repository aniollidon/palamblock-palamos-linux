const linux = {
    'suspendre': 'pm-suspend',
    'hibernar': 'pm-hibernate',
    'reiniciar': 'reboot',
    'apaga': 'poweroff',
    'apaga-rapid': 'halt',
    'apaga-tot': 'shutdown -h now',
    'pausa': 'xinput disable 12; xinput disable 13',
    'repren': 'xinput enable 12; xinput enable 13',
    'actualitza': 'cd /home/super/palamblock-palamos-linux; git pull; npm i; pm2 reload worker',
}

module.exports = linux;
