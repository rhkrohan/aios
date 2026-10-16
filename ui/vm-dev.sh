#!/bin/bash
# Put a fresh build of SIOS's programs on the test VM in minutes, without a new image.
#
#   ui/vm-dev.sh [user@vm] [what...]      what: rust, sios-agents, sios-store, ... (default: rust + changed apps)
#
# Builds capd and brain-d and the chosen Qt apps for arm64 Fedora in the same
# containers as apps/build-rust.sh and apps/build-app.sh, copies them to the VM's
# /var/tmp/sios-dev, and has the VM put them into /usr/bin through a temporary
# overlay (bootc usr-overlay). The overlay is gone after the next reboot: the VM is
# back on its image. Test VM only; the OS itself never writes /usr at runtime.
#
# One-time setup on the VM (ui/vm-dev-setup.sh prints it): a root-owned helper that
# installs only SIOS's own program names from /var/tmp/sios-dev, and a sudo rule for
# that helper and for bootc usr-overlay, nothing else.
set -euo pipefail
VM="${1:-rohan@192.168.99.134}"; shift || true
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APPS_ALL="sios-agents sios-store sios-settings sios-ask sios-files sios-memory sios-monitor sios-approve"
want=("$@")
if [ ${#want[@]} -eq 0 ]; then
  # Rust always; apps whose sources changed since the last run
  want=(rust)
  stamp="$HERE/apps/.vm-dev-stamp"
  for a in $APPS_ALL; do
    if [ ! -f "$stamp" ] || [ -n "$(find "$HERE/apps/$a" -newer "$stamp" -type f -not -path '*/.bin' | head -1)" ]; then want+=("$a"); fi
  done
fi
echo "building: ${want[*]}"
out="$HERE/apps/.vm-dev"; rm -rf "$out"; mkdir -p "$out"
for w in "${want[@]}"; do
  if [ "$w" = rust ]; then
    "$HERE/apps/build-rust.sh" >/dev/null
    cp "$HERE/apps/.rust-bin/capd" "$HERE/apps/.rust-bin/brain-d" "$out/"
  else
    case " $APPS_ALL " in *" $w "*) ;; *) echo "unknown: $w"; exit 1;; esac
    docker image inspect sios-appsdev >/dev/null 2>&1 || docker build -q --platform linux/arm64 -t sios-appsdev -f "$HERE/apps/Containerfile.dev" "$HERE/apps"
    docker run --rm --platform linux/arm64 -v "$HERE/apps/$w":/src -v "sios-$w-build":/build -v "$out":/out sios-appsdev bash -c \
      "cmake -S /src -B /build -G Ninja -DCMAKE_BUILD_TYPE=Release -Wno-dev >/dev/null && cmake --build /build >/dev/null && cp /build/$w /out/"
  fi
done
echo "sending to $VM"
ssh "$VM" 'rm -rf /var/tmp/sios-dev && mkdir -m 700 /var/tmp/sios-dev'
scp -q "$out"/* "$VM:/var/tmp/sios-dev/"
ssh "$VM" 'bash -s' <<'REMOTE'
set -e
export XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
# a writable layer over /usr until the next reboot
findmnt -n -o FSTYPE /usr | grep -q overlay || sudo -n /usr/bin/bootc usr-overlay >/dev/null
sudo -n /etc/sios-dev/install
# the services and windows pick up the new programs
names=$(ls /var/tmp/sios-dev)
echo "$names" | grep -qx capd && systemctl --user restart sios-broker.service
echo "$names" | grep -qx brain-d && systemctl --user restart sios-brain.service
for n in $names; do case $n in sios-*) pkill -x "$n" || true;; esac; done
echo "installed on the VM: $(echo $names)"
REMOTE
touch "$HERE/apps/.vm-dev-stamp"
