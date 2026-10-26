#!/bin/bash
# Runs inside the image at build time (never on a user's machine).

set -ouex pipefail

# Copy the contents of system_files/ of the git repo to /
cp -avf "/ctx/system_files"/. /
# The SIOS native apps, built in the Containerfile's "apps" stage
cp -avf "/ctx/apps_out"/. /
# The broker and the assistant, built in the Containerfile's "rust" stage
cp -avf "/ctx/rust_out"/. /
test -x /usr/bin/capd
test -x /usr/bin/brain-d
# both start with every desktop session (sios-brain needs sios-broker)
test -f /usr/lib/systemd/user/sios-broker.service
test -f /usr/lib/systemd/user/sios-brain.service
systemctl --global enable sios-broker.service sios-brain.service
test -f /usr/lib/sysctl.d/60-sios.conf
# owner actions are confirmed with the owner's password (D39)
python3 -c "import xml.dom.minidom,sys; xml.dom.minidom.parse(sys.argv[1])" /usr/share/polkit-1/actions/org.sios.policy

### SIOS look and layout (docs/plan/15-build-blueprint.md, Stage A)
# Our fonts (Instrument Sans, Jost, JetBrains Mono; all SIL Open Font License)
fc-cache -f /usr/share/fonts/sios
gtk-update-icon-cache -q -f /usr/share/icons/SIOS 2>/dev/null || true
gtk-update-icon-cache -q -f /usr/share/icons/SIOS-Dark 2>/dev/null || true

# Fail the build loudly if a theme package or one of our widgets is broken,
# instead of shipping a desktop that silently falls back to stock KDE.
WIDGETS="org.sios.wordmark org.sios.menus org.sios.dock org.sios.hero org.sios.discs org.sios.today org.sios.buddy org.sios.control org.sios.logo"
for f in /usr/share/plasma/look-and-feel/org.sios.desktop/metadata.json \
         /usr/share/plasma/look-and-feel/org.sios.desktop.dark/metadata.json \
         /usr/share/wallpapers/SIOS-Dusk/metadata.json \
         /usr/share/wallpapers/SIOS-Lake/metadata.json \
         /usr/share/wallpapers/SIOS-Tunnel/metadata.json; do
    if command -v python3 > /dev/null; then python3 -m json.tool "$f" > /dev/null; else test -s "$f"; fi
done
for w in $WIDGETS; do
    if command -v python3 > /dev/null; then python3 -m json.tool "/usr/share/plasma/plasmoids/$w/metadata.json" > /dev/null; fi
    test -s "/usr/share/plasma/plasmoids/$w/contents/ui/main.qml"
done
test -f /usr/share/color-schemes/SIOSLight.colors
test -f /usr/share/color-schemes/SIOSDark.colors
test -f /usr/share/icons/SIOS/index.theme
# the SIOS Plasma style (popups, notifications, dock): ui/make-plasma-style.py
for f in dialogs/background widgets/panel-background widgets/tooltip; do gzip -t "/usr/share/plasma/desktoptheme/sios/$f.svgz"; done
if command -v kpackagetool6 > /dev/null; then
    kpackagetool6 --type Plasma/LookAndFeel --list --global | grep -q "org.sios.desktop"
    for w in $WIDGETS; do kpackagetool6 --type Plasma/Applet --list --global | grep -q "$w"; done
fi

### SIOS Files: the preview's Files app, the default for folders (D29)
test -x /usr/bin/sios-files
test -f /usr/share/applications/org.sios.files.desktop
# folders open in SIOS Files everywhere (desktop discs, "open folder" in apps);
# Dolphin stays installed for anyone who wants it
mkdir -p /usr/share/applications
grep -q "^\[Default Applications\]" /usr/share/applications/mimeapps.list 2>/dev/null || printf '[Default Applications]\n' >> /usr/share/applications/mimeapps.list
sed -i '/^inode\/directory=/d' /usr/share/applications/mimeapps.list
sed -i 's/^\[Default Applications\]$/[Default Applications]\ninode\/directory=org.sios.files.desktop;org.kde.dolphin.desktop;/' /usr/share/applications/mimeapps.list
# KDE reads its own defaults list first
kwriteconfig6 --file "/usr/share/kde-settings/kde-profile/default/xdg/kde-mimeapps.list" --group "Default Applications" --key "inode/directory" "org.sios.files.desktop;org.kde.dolphin.desktop;"

### SIOS Store: the preview's Store over Flatpak and Flathub (D9, D29)
test -x /usr/bin/sios-store
test -f /usr/share/applications/org.sios.store.desktop
# Flathub as a system app source (Aurora has it already; Kinoite doesn't)
test -s /etc/flatpak/remotes.d/flathub.flatpakrepo

### SIOS Monitor: health and (with the assistant) goals
test -x /usr/bin/sios-monitor
test -f /usr/share/applications/org.sios.monitor.desktop

### SIOS Settings: look, Wi-Fi, updates, about; the assistant's sections later
test -x /usr/bin/sios-settings
test -f /usr/share/applications/org.sios.settings.desktop

### Approvals: the window that asks before an AI acts (D37), started by the broker (S1)
test -x /usr/bin/sios-approve
test -f /usr/lib/sysctl.d/60-sios-ptrace.conf
# the broker starts the approval window itself (S1); never the session bus
test ! -e /usr/share/dbus-1/services/org.sios.Approve1.service
# Stop all AI: Ctrl+Shift+Esc, no password (D41)
test -f /usr/share/applications/org.sios.stop.desktop
test -f /usr/share/polkit-1/actions/org.sios.policy && grep -q org.sios.owner.resume /usr/share/polkit-1/actions/org.sios.policy

### The Ask bar: the orb and Meta+Space (apps, files, settings now)
test -x /usr/bin/sios-ask

### Memory: what SIOS remembers about you (A2), a broker-started window (D59)
test -x /usr/bin/sios-memory
test -f /usr/share/applications/org.sios.memory.desktop

### Agents: the pet team (A4), a broker-started window (D59)
test -x /usr/bin/sios-agents
test -f /usr/share/applications/org.sios.agents.desktop
test -f /usr/share/kglobalaccel/org.sios.ask.desktop
test -f /etc/xdg/autostart/org.sios.ask.desktop

### Apps menu: only SIOS's apps and the few others people use (owner, 2026-10-15)
# KDE's own programs that SIOS replaces (Dolphin: Files, Discover: Store, System
# Monitor: Monitor, System Settings: Settings) and the admin and helper tools are
# hidden, not removed: other programs and Settings' "More" pages still use them.
# Firefox, Terminal, Text Editor, Archives and Screenshot stay.
for id in org.kde.dolphin org.kde.discover org.kde.plasma-systemmonitor systemsettings kdesystemsettings \
          org.kde.plasma-welcome org.kde.kdeconnect.app org.kde.kdeconnect.nonplasma org.kde.kdeconnect.sms \
          org.kde.krfb org.kde.kwalletmanager org.kde.kmenuedit org.kde.kdebugsettings kvantummanager \
          org.kde.drkonqi.coredump.gui org.kde.kjournaldbrowser org.kde.kinfocenter org.kde.khelpcenter \
          org.kde.kcharselect org.kde.kfind firewall-config org.kde.partitionmanager org.kde.filelight \
          org.kde.plasma.emojier; do
    f="/usr/share/applications/$id.desktop"
    [ -f "$f" ] || continue
    sed -i '/^NoDisplay=/d' "$f"
    sed -i '0,/^\[Desktop Entry\]$/s//[Desktop Entry]\nNoDisplay=true/' "$f"
    grep -q "^NoDisplay=true" "$f"
done
# plain names for the ones that stay
for pair in "org.kde.konsole:Terminal" "org.kde.kwrite:Text Editor" "org.kde.ark:Archives" "org.kde.spectacle:Screenshot"; do
    f="/usr/share/applications/${pair%%:*}.desktop"
    [ -f "$f" ] || continue
    sed -i "0,/^Name=.*/s//Name=${pair#*:}/" "$f"
    sed -i '/^Name\[/d' "$f"
done

### Terminal: Konsole in SIOS's look (owner, 2026-10-15)
# Daylight colours that follow light and dark, JetBrains Mono, room around the
# text, no toolbars (Konsole's own UI files without them, version raised so
# they win). Profiles in /usr/share/konsole, defaults in the kde-profile konsolerc.
test -s "/usr/share/konsole/SIOS Light.profile"
test -s "/usr/share/konsole/SIOS Dark.profile"
test -s /usr/share/konsole/SIOSLight.colorscheme
test -s /usr/share/konsole/SIOSDark.colorscheme
for f in konsoleui.rc sessionui.rc; do
    python3 -c "import xml.dom.minidom,sys; xml.dom.minidom.parse(sys.argv[1])" "/usr/share/kxmlgui5/konsole/$f"
    ! grep -q "<ToolBar" "/usr/share/kxmlgui5/konsole/$f"
done

### Coding agents' brains (D100): Node.js for Gemini CLI
# Codex and Cursor bring their own runtimes; Gemini CLI is a Node program the owner
# installs into ~/.local (npm --prefix), run by this node inside the agent's sandbox.
rpm -q nodejs > /dev/null || dnf5 -y install nodejs npm
test -x /usr/bin/node && test -x /usr/bin/npm

### The Workspace's view of an agent's desktop (D109) reads it with libvncclient
rpm -q libvncserver > /dev/null || dnf5 -y install libvncserver
test -e /usr/lib64/libvncclient.so.1

### Terminal commands for AIs (D89): the command catalog
# Every program on the image, typed, with its risk class (build_files/cmdcat).
# Made here, inside the image, so it describes exactly what ships; capd reads it.
# --help for programs without a man page runs in a bwrap sandbox when the build
# allows one, and is skipped otherwise.
mkdir -p /usr/share/sios/commands
python3 /ctx/cmdcat/cmdcat.py --rules /ctx/cmdcat/rules.toml --out /usr/share/sios/commands/catalog.json
python3 -c "import json,sys; d=json.load(open('/usr/share/sios/commands/catalog.json')); n=len(d['commands']); print('command catalog:', n, d['counts']); sys.exit(0 if n > 1500 and d['commands']['sudo']['class'] == 'block' and d['commands']['ls']['class'] == 'R' else 1)"

### Files (Dolphin) like the preview's Files app
# Toolbar: back, forward, path, search, sort, grid, list, new folder, details
# (/usr/share/kxmlgui5/dolphin/dolphinui.rc); defaults in dolphinrc; the
# sidebar list is written per person at first login (/usr/libexec/sios-files-setup).
test -s /usr/share/kxmlgui5/dolphin/dolphinui.rc
python3 -c "import xml.dom.minidom,sys; xml.dom.minidom.parse(sys.argv[1])" /usr/share/kxmlgui5/dolphin/dolphinui.rc
python3 -m py_compile /usr/libexec/sios-files-setup
chmod 0755 /usr/libexec/sios-files-setup

### Windows: title bars like the preview's (Window.tsx)
# 44px light title bar with the app icon and title on the left, minimize,
# maximize and close on the right, a hairline under it, no side borders, and
# a big soft shadow. Stock Breeze decoration, just configured. Keys are added
# to the base image's defaults rather than replacing its files.
XDG=/usr/share/kde-settings/kde-profile/default/xdg
mkdir -p "$XDG"
kw() { kwriteconfig6 --file "$XDG/$1" --group "$2" --key "$3" "$4"; }
kw kwinrc org.kde.kdecoration2 library org.kde.breeze
kw kwinrc org.kde.kdecoration2 theme Breeze
kw kwinrc org.kde.kdecoration2 ButtonsOnLeft M
kw kwinrc org.kde.kdecoration2 ButtonsOnRight IAX
kw kwinrc org.kde.kdecoration2 BorderSize None
kw kwinrc org.kde.kdecoration2 BorderSizeAuto false
kw breezerc Windeco TitleAlignment AlignLeft
kw breezerc Windeco ButtonSize ButtonVeryLarge
kw breezerc Windeco DrawTitleBarSeparator true
kw breezerc Windeco DrawBackgroundGradient false
kw breezerc Windeco DrawBorderOnMaximizedWindows false
kw breezerc Common ShadowSize ShadowLarge
kw breezerc Common ShadowStrength 90
kw breezerc Common OutlineIntensity OutlineOff
# the Meta key alone opens All apps in the Ask bar (KDE opens its own launcher there)
kw kwinrc ModifierOnlyShortcuts Meta "org.sios.Ask,/Ask,org.sios.Ask,showApps"
grep -q "ButtonsOnRight=IAX" "$XDG/kwinrc"

### Apps: the SIOS app style (D27)
# Kvantum draws every Qt app from an SVG theme, so Files, Settings and the
# rest get the preview's soft selections and surfaces. Theme made from
# Kvantum's KvGnome (ui/make-kvantum.py, menus by ui/kvantum-menus.py);
# chosen for everyone in /etc/xdg.
rpm -q kvantum > /dev/null || dnf5 -y install kvantum
test -s /usr/share/Kvantum/SIOS/SIOS.svg
test -s /usr/share/Kvantum/SIOS/SIOS.kvconfig
test -s /usr/share/Kvantum/SIOSDark/SIOSDark.svg

### Make sure our defaults win
# KDE reads /etc/xdg before the kde-profile defaults folder, so if the base
# image (Aurora) ships its own file there, write our keys into it as well.
merge_defaults() {
    local src="$1" dst="$2" group="" line key value
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
            ''|'#'*) ;;
            '['*) group="$line" ;;
            *=*)
                key="${line%%=*}"; value="${line#*=}"
                # "[A][B]" -> --group A --group B
                local args=() g="${group#[}"; g="${g%]}"
                IFS=']' read -ra parts <<< "${g//\]\[/]}"
                for part in "${parts[@]}"; do [ -n "$part" ] && args+=(--group "${part#[}"); done
                kwriteconfig6 --file "$dst" "${args[@]}" --key "$key" "$value" ;;
        esac
    done < "$src"
}
for f in "$XDG"/*; do
    name="$(basename "$f")"
    if [ -f "/etc/xdg/$name" ]; then
        echo "base image has /etc/xdg/$name; merging SIOS defaults into it"
        merge_defaults "$f" "/etc/xdg/$name"
    fi
done
kreadconfig6 --file kdeglobals --group KDE --key LookAndFeelPackage

### The login screen: SDDM with our theme
# Fedora 44's own login manager (Plasma Login Manager) can't be themed beyond
# its wallpaper, so we use SDDM, KDE's long-standing login manager, which
# loads a QML theme. If our theme ever fails to load, SDDM falls back to its
# built-in one, so people can still log in.
rpm -q sddm sddm-wayland-plasma > /dev/null || dnf5 -y install sddm sddm-wayland-plasma
systemctl disable plasmalogin.service 2> /dev/null || true
systemctl enable sddm.service
test -s /usr/share/sddm/themes/sios/Main.qml
grep -q "QtVersion=6" /usr/share/sddm/themes/sios/metadata.desktop

### The name: SIOS instead of Fedora (boot menu, About, login)
# ID stays "fedora" so tools that check for Fedora keep working; only the
# names people see change. The boot menu entries take PRETTY_NAME.
FEDORA_VERSION="$(. /usr/lib/os-release && echo "$VERSION_ID")"
sed -i \
    -e 's/^NAME=.*/NAME="SIOS"/' \
    -e "s/^PRETTY_NAME=.*/PRETTY_NAME=\"SIOS (Fedora ${FEDORA_VERSION} base)\"/" \
    -e 's/^VARIANT=.*/VARIANT="SIOS"/' \
    -e 's/^VARIANT_ID=.*/VARIANT_ID=sios/' \
    -e 's/^LOGO=.*/LOGO=sios-logo/' \
    -e 's/^DEFAULT_HOSTNAME=.*/DEFAULT_HOSTNAME="sios"/' \
    /usr/lib/os-release
grep -q '^VARIANT_ID=' /usr/lib/os-release || echo 'VARIANT_ID=sios' >> /usr/lib/os-release
grep -q '^LOGO=' /usr/lib/os-release || echo 'LOGO=sios-logo' >> /usr/lib/os-release

### The boot screen: the preview's (the string orb, SIOS, a progress bar)
# A Plymouth script theme (/usr/share/plymouth/themes/sios); its pictures are
# drawn from the preview's code by ui/render-plymouth.mjs.
test -s /usr/share/plymouth/themes/sios/sios.script
test -s /usr/share/plymouth/themes/sios/orb-79.png
rpm -q plymouth-plugin-script > /dev/null || dnf5 -y install plymouth-plugin-script
plymouth-set-default-theme sios
# The boot screen runs before the disk is mounted, from the initramfs, so
# rebuild it with our theme inside. Same command Universal Blue images use.
KVER="$(ls /usr/lib/modules | head -n 1)"
export DRACUT_NO_XATTR=1
dracut --no-hostonly --kver "$KVER" --reproducible --zstd -v --add ostree -f "/usr/lib/modules/$KVER/initramfs.img"
chmod 0600 "/usr/lib/modules/$KVER/initramfs.img"
lsinitrd "/usr/lib/modules/$KVER/initramfs.img" > /tmp/initramfs-files.txt
grep -q "plymouth/themes/sios/orb-79.png" /tmp/initramfs-files.txt
grep -q "plymouth/script.so" /tmp/initramfs-files.txt
