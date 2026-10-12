#!/bin/bash
# Send the SIOS look to a test VM running our image and apply it, so a change
# can be seen in seconds instead of waiting for a full image build.
#
#   ui/sync-vm.sh user@vm-address [--reset]     (needs ssh key access)
#
# /usr is read-only on a bootc system, so the files go to the same places in the
# test user's home (~/.local/share/...), which KDE checks before /usr. Delete
# ~/.local/share/{plasma,wallpapers,icons} in the VM to go back to what the
# image ships. --reset rebuilds the panels and desktop widgets from the layout.

set -euo pipefail
VM="${1:?usage: ui/sync-vm.sh user@vm-address [--reset]}"
RESET="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
S="$ROOT/system_files/usr/share"

ssh "$VM" 'mkdir -p ~/.local/share/{plasma/plasmoids,plasma/look-and-feel,plasma/desktoptheme,wallpapers,icons,color-schemes,fonts}'
rsync -rlt --delete "$S/plasma/plasmoids/" "$VM:.local/share/plasma/plasmoids/"
rsync -rlt --delete "$S/plasma/look-and-feel/" "$VM:.local/share/plasma/look-and-feel/"
if [ -d "$S/plasma/desktoptheme" ]; then rsync -rlt --delete "$S/plasma/desktoptheme/" "$VM:.local/share/plasma/desktoptheme/"; fi
rsync -rlt "$S/wallpapers/" "$VM:.local/share/wallpapers/"
rsync -rlt "$S/icons/" "$VM:.local/share/icons/"
rsync -rlt "$S/color-schemes/" "$VM:.local/share/color-schemes/"
rsync -rlt "$S/fonts/sios" "$VM:.local/share/fonts/"

ssh "$VM" "RESET='$RESET' bash -s" <<'EOF'
set -e
export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus" XDG_RUNTIME_DIR="/run/user/$(id -u)" WAYLAND_DISPLAY=wayland-0
fc-cache -f ~/.local/share/fonts >/dev/null
if [ "$RESET" = "--reset" ]; then
  plasma-apply-lookandfeel --apply org.sios.desktop --resetLayout
else
  # pick up changed QML without touching the layout
  systemctl --user restart plasma-plasmashell
fi
echo "synced"
EOF
