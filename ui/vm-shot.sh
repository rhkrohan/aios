#!/bin/bash
# Screenshot the VM's desktop to a local file. Usage: ui/vm-shot.sh user@vm out.png
set -euo pipefail
ssh "$1" 'export XDG_RUNTIME_DIR=/run/user/$(id -u) WAYLAND_DISPLAY=wayland-0 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
rm -f /tmp/sios-shot.png
timeout 20 spectacle -b -n -f -o /tmp/sios-shot.png >/tmp/sios-shot.log 2>&1 || true
test -s /tmp/sios-shot.png || { echo "screenshot failed:"; tail -5 /tmp/sios-shot.log; exit 1; }'
scp -q "$1:/tmp/sios-shot.png" "$2"
