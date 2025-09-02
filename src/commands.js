const linux_sudo = {
  hibernar: "systemctl suspend -i",
  reiniciar: "reboot",
  apaga: "poweroff",
  "apaga-rapid": "halt",
  "apaga-tot": "shutdown -h now",
  pausa: "/opt/palamos-dashboard/scripts/pausa.sh",
  repren: "/opt/palamos-dashboard/scripts/repren.sh",
  actualitza: "/opt/palamos-dashboard/run.sh",
};

const linux = {
  missatge: "/opt/palamos-dashboard/scripts/missatge.sh",
};

module.exports = { linux, linux_sudo };
