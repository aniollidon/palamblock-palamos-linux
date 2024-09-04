const linux_sudo = {
    'hibernar': 'systemctl suspend -i',
    'reiniciar': 'reboot',
    'apaga': 'poweroff',
    'apaga-rapid': 'halt',
    'apaga-tot': 'shutdown -h now',
    'pausa': '/home/super/palamblock-palamos-linux/scripts/pausa.sh',
    'repren': '/home/super/palamblock-palamos-linux/scripts/repren.sh',
}

const linux = {
    'actualitza': 'cd /home/super/palamblock-palamos-linux; git pull; npm i; pm2 reload worker'
}

module.exports = {linux, linux_sudo};
