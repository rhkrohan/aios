#!/bin/bash
# Attack an agent desktop's sandbox on the test VM (D109): the checks run once outside
# (a control: most must be REACHED, so each check can really succeed) and once inside a
# process with exactly the desktop's sandbox (all must be blocked, internet allowed).
#   ui/desk-attack.sh [user@vm]
set -euo pipefail
VM="${1:-rohan@192.168.99.134}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ssh "$VM" 'mkdir -p /var/tmp/desk-attack'
scp -q "$HERE/desk-attack-checks.sh" "$VM:/var/tmp/desk-attack/checks.sh"
ssh "$VM" 'bash -s' <<'REMOTE'
set -e
export XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
T=/var/tmp/desk-attack; chmod +x $T/checks.sh; pgrep -x plasmashell > $T/plasma.pid || true
D=/run/user/$(id -u)/sios-desks/attack; mkdir -p -m 700 $(dirname $D) $D $(dirname $D)/decoy; rmdir $(dirname $D)/test 2>/dev/null || true
python3 -I -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 & HP=$!; sleep 0.5
echo "== outside (control)"; $T/checks.sh 2>/dev/null || true
echo "== inside an agent desktop sandbox"
R=$(ls /dev/dri/renderD* 2>/dev/null | sed "s/^/-p BindPaths=/" | tr "\n" " ")
systemd-run --user --quiet --collect --wait --pipe --slice=sios-agents.slice -p ProtectSystem=strict -p InaccessiblePaths=-/run/media -p InaccessiblePaths=-/media -p InaccessiblePaths=-/mnt -p InaccessiblePaths=-/var/mnt -p InaccessiblePaths=-/srv -p ProtectHome=tmpfs -p BindPaths=$T -p BindPaths=$D -p PrivateTmp=yes -p PrivateDevices=yes -p BindPaths=/dev/net/tun $R -p InaccessiblePaths=/run/dbus -p InaccessiblePaths=-/run/udev -p InaccessiblePaths=-/var/run/dbus -p ProtectProc=invisible -p ProcSubset=pid -p NoNewPrivileges=yes -E PATH=/usr/bin:/bin -- /usr/bin/pasta --config-net --quiet --foreground -t none -u none -T none -U none --no-map-gw -- $T/checks.sh 2>/dev/null || true
kill $HP; rmdir $D $(dirname $D)/decoy 2>/dev/null || true
REMOTE
