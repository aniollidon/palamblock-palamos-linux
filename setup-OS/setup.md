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





# Instal·lació debian amb GNOME
S'ha seguit el setup en català...

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

### Politiques
+ Brave: /etc/brave/policies/managed
+ Firefox: /etc/firefox/policies

```bash
sudo mkdir -p /etc/brave/policies/managed
sudo mkdir -p /etc/firefox/policies

# Descarregar i copiar les polítiques
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-palamos-linux/refs/heads/master/setup-OS/policies/brave/palamblock_policies.json -O /etc/brave/policies/managed/palamblock_policies.json
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-palamos-linux/refs/heads/master/setup-OS/policies/firefox/policies.json -O /etc/firefox/policies/policies.json

# Per la plantilla examen (eliminiem anell de claus)
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-palamos-linux/refs/heads/master/setup-OS/policies/brave/examen_policies.json -O /etc/brave/policies/managed/examen_policies.json
```

## Restriccions de l'usuari alumne

Executa l'script `custom-os.sh` per aplicar polkit, dconf i permisos:

```bash
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-palamos-linux/refs/heads/master/setup-OS/custom-os.sh -O /tmp/custom-os.sh && sudo bash /tmp/custom-os.sh
```

Bloqueja a l'alumne:
+ Canvi de llengua
+ Canvi de data i hora
+ Canvi de fons d'escriptori
+ Obrir Configuració (GNOME Settings)

## Grub i fons de pantalla
Es posa un grub personalitzat

https://github.com/vinceliuice/grub2-themes
Amb el fons de pantalla wallaper/background.jpg

Es posa el fons de pantalla personalitzat


## Altres
+ S'ha configurat CONTROL+ALT+T o WIN+T per obrir terminal
+ Tema fosc