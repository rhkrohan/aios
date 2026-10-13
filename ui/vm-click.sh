#!/bin/bash
# Click on the test VM's screen (needs apps/vm-click installed there; see its
# main.cpp). Usage: ui/vm-click.sh user@vm X Y [left|right]
set -euo pipefail
ssh "$1" "export XDG_RUNTIME_DIR=/run/user/\$(id -u) WAYLAND_DISPLAY=wayland-0 QT_QPA_PLATFORM=wayland; \$(readlink -f ~)/.local/bin/vm-click $2 $3 ${4:-left}"
