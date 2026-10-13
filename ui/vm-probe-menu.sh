#!/bin/bash
# Open apps/menu-probe on the VM, right-click in it, print the menu's top-left
# corner as text (# white, . other) and save a screenshot. Usage:
#   ui/vm-probe-menu.sh user@vm out.png
set -euo pipefail
VM="$1"; OUT="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"
ssh "$VM" 'export XDG_RUNTIME_DIR=/run/user/$(id -u) WAYLAND_DISPLAY=wayland-0 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus XDG_CURRENT_DESKTOP=KDE KDE_FULL_SESSION=true QT_QPA_PLATFORM=wayland; setsid /tmp/menu-probe >/tmp/probe.log 2>&1 < /dev/null &'
sleep 2.5
"$HERE/vm-click.sh" "$VM" 700 500 right; sleep 1.2
"$HERE/vm-shot.sh" "$VM" "$OUT"
"$HERE/vm-click.sh" "$VM" 1300 800 left
python3 - "$OUT" <<'PY'
from PIL import Image; import sys
im=Image.open(sys.argv[1]).convert("RGB")
for y in range(497,522): print(y,"".join("#" if sum(im.getpixel((x,y)))>745 else "." for x in range(694,740)))
PY
