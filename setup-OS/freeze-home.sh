#!/usr/bin/env bash
# freeze-home.sh — Congela /home (overlay efímer sobre tmpfs)
# per a la plantilla Examen de PalamOS.
#
# El sistema (/) NO es congela: es manté persistent per permetre el
# manteniment remot (polítiques, serveis VNC, palam-dash...).
# /tmp ja és un tmpfs de sèrie a Debian 13: no cal tocar-lo.
#
# Ús:
#   sudo bash freeze-home.sh
#
# Què fa:
#   1. Desa /etc/fstab a /etc/fstab.pre-freeze (només la primera vegada)
#   2. Comenta l'entrada de /home a l'fstab
#   3. Crea i activa /etc/systemd/system/home-overlay.service
#      (s'executa després de local-fs.target i abans del display-manager)
#
# La congelació s'aplica en reiniciar. Per desfer-la: unfreeze-home.sh

set -euo pipefail

FSTAB="/etc/fstab"
FSTAB_BACKUP="/etc/fstab.pre-freeze"
UNIT="/etc/systemd/system/home-overlay.service"
LOWER_DIR="/mnt/home-lower"
RUN_DIR="/run/palam-home"

log() { echo "[freeze-home] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
    echo "ERROR: Executa aquest script amb sudo." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# 0. Comprovacions prèvies
# ---------------------------------------------------------------------------
if [[ -f "$UNIT" ]]; then
    log "La congelació ja està configurada ($UNIT existeix). No es fa res."
    exit 0
fi

if ! findmnt -rn /home > /dev/null; then
    echo "ERROR: /home no està muntat. Revisa l'fstab abans de continuar." >&2
    exit 1
fi

home_line="$(grep -E '^[[:space:]]*[^#[:space:]]+[[:space:]]+/home[[:space:]]' "$FSTAB" || true)"
if [[ -z "$home_line" ]]; then
    echo "ERROR: No s'ha trobat cap entrada activa de /home a $FSTAB." >&2
    exit 1
fi

home_dev="$(awk '{print $1}' <<< "$home_line")"
home_opts="$(awk '{print $4}' <<< "$home_line")"
[[ "$home_opts" == "defaults" ]] && home_opts=""

log "Entrada de /home detectada: dispositiu=$home_dev opcions=${home_opts:-cap}"

# ---------------------------------------------------------------------------
# 1. Còpia de seguretat de l'fstab (només la primera vegada)
# ---------------------------------------------------------------------------
if [[ ! -f "$FSTAB_BACKUP" ]]; then
    cp "$FSTAB" "$FSTAB_BACKUP"
    log "Còpia de seguretat creada: $FSTAB_BACKUP"
else
    log "Ja existeix $FSTAB_BACKUP (es conserva l'original)."
fi

# ---------------------------------------------------------------------------
# 2. Comentar l'entrada de /home a l'fstab
# ---------------------------------------------------------------------------
sed -i -E "s|^([[:space:]]*[^#[:space:]]+[[:space:]]+/home[[:space:]].*)$|# palam-freeze: \1|" "$FSTAB"
log "Entrada de /home comentada a l'fstab."

# ---------------------------------------------------------------------------
# 3. Servei systemd que munta l'overlay a cada arrencada
# ---------------------------------------------------------------------------
lower_opts="${home_opts:+$home_opts,}ro"

cat > "$UNIT" <<EOF
[Unit]
# S'executa DESPRÉS de local-fs.target (disc ja muntat + fsck fet) i
# ABANS del display-manager (GDM), perquè /home estigui a punt abans de la sessió.
Description=Overlay efímer de /home (PalamOS plantilla Examen)
DefaultDependencies=no
After=local-fs.target
Before=display-manager.service
Before=umount.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/mkdir -p $LOWER_DIR $RUN_DIR
ExecStart=/usr/bin/mount -t tmpfs -o size=50%%,mode=755 tmpfs $RUN_DIR
ExecStart=/usr/bin/mkdir -p $RUN_DIR/upper $RUN_DIR/work
ExecStart=/usr/bin/mount -o $lower_opts $home_dev $LOWER_DIR
ExecStart=/usr/bin/mount -t overlay overlay -o lowerdir=$LOWER_DIR,upperdir=$RUN_DIR/upper,workdir=$RUN_DIR/work /home
ExecStop=/usr/bin/umount /home
ExecStop=/usr/bin/umount $LOWER_DIR
ExecStop=/usr/bin/umount $RUN_DIR

[Install]
WantedBy=multi-user.target
EOF

log "Servei creat: $UNIT"

# ---------------------------------------------------------------------------
# 4. Activació
# ---------------------------------------------------------------------------
systemctl daemon-reload
systemctl enable home-overlay.service

log "Servei home-overlay.service activat."

cat <<MSG

Congelació configurada. Encara NO està aplicada: cal reiniciar.

Abans de reiniciar, assegura't que:
  1. La plantilla està configurada i comprovada.
  2. Has executat clean-before-freeze.sh.

Després de reiniciar, verifica:
  findmnt /home            # tipus overlay
  findmnt $LOWER_DIR  # ro (només lectura)
  findmnt /tmp             # tmpfs
  findmnt /                # rw (el sistema no es congela)

Per desfer la congelació: unfreeze-home.sh
MSG
