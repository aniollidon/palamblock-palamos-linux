# Instal·lació debian amb GNOME
Setup en català...
## Particions
| # | Punt de muntatge | Mida   | Sistema de fitxers | Opcions               | Notes                          |
| - | ---------------- | ------ | ------------------ | --------------------- | ------------------------------ |
| 1 | `/boot/efi`      | 512 MB | FAT32              | default               | ⚠️ EFI System Partition (UEFI) |
| 2 | `/`              | 30 GB  | ext4               | default               | ❄️ sistema (es congelarà)      |
| 3 | `/home`          | 150 GB | ext4               | `noexec,nosuid,nodev` | ❄️ usuaris (es congelarà)      |
| 4 | `/var`           | 12 GB  | ext4               | default               | 💾 persistent sistema          |
| 5 | `/data`          | 50 GB  | ext4               | `nosuid,nodev`        | 💾 dades reals                 |
| 6 | swap             | 4 GB   | swap               | -                     | RAM extra                      |

##  Usuaris
+ super: (Al grup sudoers)
+ alumne: (no sudo)

## Forçar X11
```bash
sudo nano /etc/gdm3/daemon.conf
```

```INI
#WaylandEnable=false
```

Comprovar-ho
```bash
echo $XDG_SESSION_TYPE
```
Ha de sortir `x11`

## Autologin per alumne (plantilla examen)
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


No password:
``` bash
passwd -d alumne
```

Desactivar bloqueig

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
# Descarregar i copiar les polítiques
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-linux/master/setup-OS/policies/brave/examen_policies.json -O /etc/brave/policies/managed/examen_policies.json
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-linux/master/setup-OS/policies/brave/palamblock_policies.json -O /etc/brave/policies/managed/palamblock_policies.json
wget -q https://raw.githubusercontent.com/aniollidon/palamblock-linux/master/setup-OS/policies/firefox/policies.json -O /etc/firefox/policies/policies.json
```

## Altres
+ S'ha configurat CONTROL+ALT+T o WIN+T per obrir terminal
+ Tema fosc