#!/bin/bash
# Run a Plasma desktop script (the same API as the layout file) in the VM's
# running session. Usage: ui/vm-js.sh user@vm < script.js
set -euo pipefail
VM="${1:?usage: ui/vm-js.sh user@vm < script.js}"
JS="$(cat)"
ssh "$VM" "export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/\$(id -u)/bus; qdbus-qt6 org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.evaluateScript $(printf '%q' "$JS")"
