const linux_sudo = {
  hibernar: "systemctl suspend -i",
  reiniciar: "reboot",
  apaga: "poweroff",
  "apaga-rapid": "halt",
  "apaga-tot": "shutdown -h now",
  pausa: "/data/palamos-dashboard/scripts/pausa.sh",
  repren: "/data/palamos-dashboard/scripts/repren.sh",
  actualitza: "/data/palamos-dashboard/run.sh",
};

const linux = {
  missatge: "/data/palamos-dashboard/scripts/missatge.sh",
};

module.exports = { linux, linux_sudo };
