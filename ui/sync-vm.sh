#!/bin/bash
# Send the SIOS look to a Fedora KDE test VM and apply it, so a change can be
# seen in seconds instead of waiting for a full image build.
#
#   ui/sync-vm.sh user@vm-address        (needs ssh access and sudo in the VM)
#
# It copies the same files the image gets (system_files/usr) into the VM's /usr,
# refreshes fonts and icons, and re-applies the SIOS theme with a fresh layout.
# Only for a throwaway test VM: the real image never writes /usr at runtime.

set -euo pipefail
VM="${1:?usage: ui/sync-vm.sh user@vm-address}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for theme in org.sios.desktop org.sios.desktop.dark; do
  rsync -rlt --delete --rsync-path="sudo rsync" "$ROOT/system_files/usr/share/plasma/look-and-feel/$theme/" "$VM:/usr/share/plasma/look-and-feel/$theme/"
done
rsync -rlt --rsync-path="sudo rsync" "$ROOT/system_files/usr/share/plasma/plasmoids/" "$VM:/usr/share/plasma/plasmoids/"
rsync -rlt --rsync-path="sudo rsync" "$ROOT/system_files/usr/share/color-schemes/" "$VM:/usr/share/color-schemes/"
rsync -rlt --rsync-path="sudo rsync" "$ROOT/system_files/usr/share/wallpapers/SIOS-Tunnel" "$VM:/usr/share/wallpapers/"
rsync -rlt --rsync-path="sudo rsync" "$ROOT/system_files/usr/share/fonts/sios" "$VM:/usr/share/fonts/"
rsync -rlt --rsync-path="sudo rsync" "$ROOT/system_files/usr/share/icons/hicolor/" "$VM:/usr/share/icons/hicolor/"
rsync -rlt --rsync-path="sudo rsync" "$ROOT/system_files/usr/share/pixmaps/" "$VM:/usr/share/pixmaps/"
rsync -rlt --rsync-path="sudo rsync" "$ROOT/system_files/usr/share/kde-settings/" "$VM:/usr/share/kde-settings/"

# apply it in the logged-in desktop session
ssh "$VM" 'set -e
  sudo fc-cache -f /usr/share/fonts/sios >/dev/null
  sudo gtk-update-icon-cache -q /usr/share/icons/hicolor 2>/dev/null || true
  export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  plasma-apply-lookandfeel --apply org.sios.desktop --resetLayout
  echo "SIOS look applied. Log out and back in to see the splash screen."'
