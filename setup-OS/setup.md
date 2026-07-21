Passos seguits per crear les màquines preparades per PalamOS.

Hi ha dues plantilles:
+ Plantilla FPB. (Escriptoris persistents - oridnador assignat a l'alumne)
+ Plantilla Examen (Escriptoris congelats - cada sessió s'espera un nou usuari)

| Caracteristica | Plantilla FPB | Plantilla Examen|
--|--|--|
| Administrador  | super | super |
| Usuari sense permisos | alumne | alumne
| Contrasenya alumne | SÍ | NO |
| Autologin | NO | SÍ |
| Directives de brave | palamblock_policies.json | palamblock_policies.json + examen_policies.json
| Usuari palamblock |  usuari [nom-alumne] | examen[XX]





# Passos seguits durant l'instal·lació
Primerament fem l'instal·lació debian amb GNOME, setup en català...

## Particions
| # | Punt de muntatge | Mida   | Sistema de fitxers | Opcions               | Notes                          |
| - | ---------------- | ------ | ------------------ | --------------------- | ------------------------------ |
| 1 | `/boot/efi`      | 512 MB | FAT32              | default               | EFI System Partition (UEFI) |
| 2 | `/`              | 30 GB  | ext4               | default               | sistema (es congelarà p.examen)      |
| 3 | `/home`          | 150 GB | ext4               | `noexec,nosuid,nodev` | usuaris (es congelarà p.examen)      |
| 4 | `/var`           | 12 GB  | ext4               | default               | persistent sistema          |
| 5 | `/data`          | 50 GB  | ext4               | `nosuid,nodev`        | dades reals                 |
| 6 | swap             | 4 GB   | swap               | -                     | RAM extra                      |

##  Usuaris
+ super: (Al grup sudoers)
+ alumne: (no sudo)

## Forçar X11
Per poder visualitzar les pantalles, hem d'anar amb x11 i no wayland. Anem a forçar x11:
```bash
sudo nano /etc/gdm3/daemon.conf
```

```INI
#WaylandEnable=false
```
(caldrà treure el comentari)

Comprovar-ho
```bash
echo $XDG_SESSION_TYPE
```
Ha de sortir `x11`

## Autologin user alumne (Només plantilla examen)
L'ordinador s'obre sense guardar contrasenya
```bash
sudo nano /etc/gdm3/daemon.conf
```
```INI
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=alumne

...

TimedLoginEnable=false
```


Eliminiem password:
``` bash
passwd -d alumne
```

Desactivar bloqueig de pantalla (no gaire important)

```bash
gsettings set org.gnome.desktop.screensaver lock-enabled false
```

## Programes
+ Es desintal·len programes no desitjats: contactes, mapes..
+ S'instal·la Brave
+ S'instal·la code
+ S'instal·la eclipse (plantilla examen)
+ S'instal·la mysql-workbench (plantilla examen)
+ S'instal·la mongodb-compass (plantilla examen)
+ visor Spice (plantilla examen)


```bash
sudo apt update
sudo apt install snapd
sudo snap install code --classic

# PLANTILLA EXAMEN
sudo snap install eclipse --classic
sudo snap install mysql-workbench-community

wget https://downloads.mongodb.com/compass/mongodb-compass_1.47.1_amd64.deb
sudo dpkg -i mongodb-compass_1.47.1_amd64.deb
sudo apt --fix-broken install   # si falten dependències

sudo apt install virt-viewer
```

### Politiques
+ Brave: /etc/brave/policies/managed
+ Firefox: /etc/firefox/policies
+ VScode: /etc/vscode/
+ Mongodb-compass: /etc/mongodb-compass.conf

```bash
sudo mkdir -p /etc/brave/policies/managed
sudo mkdir -p /etc/firefox/policies
sudo mkdir -p /etc/vscode/

# Descarregar i copiar les polítiques
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-palamos-linux/refs/heads/master/setup-OS/policies/brave/palamblock_policies.json -O /etc/brave/policies/managed/palamblock_policies.json
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-palamos-linux/refs/heads/master/setup-OS/policies/firefox/policies.json -O /etc/firefox/policies/policies.json
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-palamos-linux/refs/heads/master/setup-OS/policies/vscode/policy.json -O /etc/vscode/policy.json

# Per la plantilla examen (desactiva el gestor de contrasenyes intern)
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-palamos-linux/refs/heads/master/setup-OS/policies/brave/examen_policies.json -O /etc/brave/policies/managed/examen_policies.json

# Per la plantilla examen 
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-palamos-linux/refs/heads/master/setup-OS/policies/mongodb-compass/mongodb-compass.conf -O /etc/mongodb-compass.conf
```

### Anell de claus (keyring) – Plantilla examen

Amb autologin + sense contrasenya, el keyring de GNOME no es desbloqueja i Brave/Firefox mostren un diàleg cada cop que s'obren.

**Solució:** configurar PAM perquè desbloquegi el keyring amb la contrasenya d'inici de sessió (buida) i esborrar el keyring existent.

```bash
# 3. Esborrar el keyring antic (es regenerarà amb contrasenya buida)
sudo rm -rf /home/alumne/.local/share/keyrings/
```

**Revertir** (tornar al comportament normal amb contrasenya):

```bash
# 2. Posar contrasenya a l'usuari
sudo passwd alumne

# 3. Esborrar el keyring (es regenerarà amb la contrasenya nova)
sudo rm -rf /home/alumne/.local/share/keyrings/
```

## Restriccions de l'usuari alumne i fons de pantalla

Descarrega i copia el fons de pantalla:

```bash
sudo mkdir -p /usr/share/wallpapers
sudo wget -q https://raw.githubusercontent.com/aniollidon/palamblock-palamos-linux/refs/heads/master/setup-OS/background-pb.png -O /usr/share/wallpapers/background-pb.png
```

Executa l'script `custom-os.sh` per aplicar polkit, dconf i permisos:

```bash
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-palamos-linux/refs/heads/master/setup-OS/custom-rules.sh -O /tmp/custom-rules.sh && sudo bash /tmp/custom-rules.sh
```

Bloqueja a l'alumne:
+ Canvi de llengua
+ Canvi de data i hora
+ Canvi de fons d'escriptori
+ Obrir Configuració (GNOME Settings)

## Grub
GRUB: Seguir [instal·lació](grub/readme.md)

## Altres
+ S'ha configurat CONTROL+ALT+T o WIN+T per obrir terminal
+ Tema fosc

## Instal·lar x11vnc + noVNC (control remot de pantalla)

Aquests serveis permeten veure i controlar remotament la pantalla de l'alumne:

- **x11vnc**: captura el display X11 de l'alumne i el serveix per VNC (port 5900)
- **noVNC**: proxy WebSocket que tradueix VNC a HTML5 (port 6080)

### Detectar el display X

Abans d'instal·lar, l'usuari `alumne` ha d'haver iniciat sessió gràfica. El display X pot variar segons la configuració de GDM:

- **Amb GDM + autologin** (plantilla examen): normalment el display és **`:0`**
- **Amb GDM sense autologin** (plantilla FPB): normalment el display és **`:1`** (GDM ocupa `:0`)

Per saber quin display X fa servir l'usuari `alumne`:

```bash
# Com a super
w -h alumne
# Exemple de sortida: alumne  tty2   :1    09:30   3:20  ...
#                                         ^^
# El display és el valor després de ttyX (:0, :1, etc.)
```

Si `w` no mostra el display (apareix un guió `-`), busca els sockets X11 actius:

```bash
ls /tmp/.X11-unix/
# Mostrarà X0, X1, etc. El número correspon al display (:0, :1...).
# Si només hi ha un socket, aquell és el display de l'usuari.
```

També pots comprovar-ho directament des de la sessió de l'alumne:

```bash
echo $DISPLAY
```

### Executar l'instal·lador

L'script `install-novnc-services.sh` fa tota la instal·lació. **L'executa l'usuari `super` amb `sudo`:**

```bash
# Des de la carpeta setup-OS del repositori clonat:
sudo ./install-novnc-services.sh --password CONTRASENYA_VNC
```

Paràmetres disponibles:

| Paràmetre | Default | Descripció |
|---|---|---|
| `--password PWD` | *(obligatori)* | Contrasenya per connectar-se via VNC |
| `--user USER` | `alumne` | Usuari de la sessió X a capturar |
| `--display :N` | autodetectar | Display X a capturar (ex: `:1`) |
| `--novnc-user USER` | `super` | Usuari que executa el proxy noVNC |
| `--novnc-dir DIR` | `$HOME/noVNC` | Directori on instal·lar noVNC |

**Exemples:**

```bash
# Instal·lació bàsica (autodetectar display)
sudo ./install-novnc-services.sh --password patata123

# Especificar display manualment
sudo ./install-novnc-services.sh --password patata123 --display :0
```

### Què fa l'script

1. Instal·la `x11vnc` via `apt`
2. Crea el fitxer de contrasenya `/etc/x11vnc.pwd`
3. Crea i activa `x11vnc.service` (corre com a `alumne`, captura el display)
4. Clona `noVNC` de GitHub a `~super/noVNC`
5. Instal·la dependències `npm`
6. Copia el fitxer `vnc_iframe.html` personalitzat (suporta `?view=true`)
7. Crea i activa `novnc-proxy.service` (corre com a `super`, port 6080)

### Verificar la instal·lació

```bash
# Comprovar serveis
sudo systemctl status x11vnc.service
sudo systemctl status novnc-proxy.service

# Comprovar ports
ss -tlnp | grep -E '5900|6080'

# Provar al navegador (des d'una altra màquina)
echo "http://$(hostname -I | awk '{print $1}'):6080/vnc_iframe.html"
```

# Instal·lant palamDash
```
git clone --depth 1 https://github.com/aniollidon/palamblock-palamos-linux.git /tmp/palamblock
cd /tmp/palamblock/palam-dash 
sudo apt install make 
sudo make install user=alumne display=:0
```
