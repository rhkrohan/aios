#!/bin/bash
# Right-click the VM's desktop, screenshot the menu, close it.
# Usage: ui/vm-menu-shot.sh user@vm out.png [x y]   (retries while the shell starts)
set -euo pipefail
VM="$1"; OUT="$2"; X="${3:-700}"; Y="${4:-700}"
HERE="$(cd "$(dirname "$0")" && pwd)"
for try in 1 2 3 4; do
  "$HERE/vm-click.sh" "$VM" "$X" "$Y" right
  sleep 1.5
  "$HERE/vm-shot.sh" "$VM" "$OUT"
  "$HERE/vm-click.sh" "$VM" 1100 1000 left
  python3 -c "
from PIL import Image; import sys
im=Image.open('$OUT').convert('RGB')
sys.exit(0 if sum(1 for x in range($X+20,$X+200,4) if sum(im.getpixel((x,$Y+40)))>720) > 20 else 1)" && exit 0
  sleep 2
done
echo "no menu seen"; exit 1
