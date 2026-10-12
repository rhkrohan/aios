#!/bin/bash
# Build a SIOS app in the Fedora 44 container and (optionally) send it to the
# test VM:  apps/build-app.sh sios-files [user@vm]
set -euo pipefail
APP="${1:?usage: apps/build-app.sh <app> [user@vm]}"
VM="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
docker image inspect sios-appsdev >/dev/null 2>&1 || docker build -q --platform linux/arm64 -t sios-appsdev -f "$HERE/Containerfile.dev" "$HERE"
docker run --rm --platform linux/arm64 -v "$HERE/$APP":/src -v "sios-$APP-build":/build sios-appsdev bash -c \
  "cmake -S /src -B /build -G Ninja -DCMAKE_BUILD_TYPE=Release -Wno-dev >/dev/null && cmake --build /build && cp /build/$APP /src/.bin"
if [ -n "$VM" ]; then
  # close the running copy; [.] keeps pkill from matching this very command
  ssh "$VM" "mkdir -p ~/.local/bin ~/.local/share/applications; pkill -f '[.]local/bin/$APP' || true; sleep 1"
  scp -q "$HERE/$APP/.bin" "$VM:.local/bin/$APP"
  [ -f "$HERE/$APP/org.sios.${APP#sios-}.desktop" ] && scp -q "$HERE/$APP/org.sios.${APP#sios-}.desktop" "$VM:.local/share/applications/"
fi
rm -f "$HERE/$APP/.bin"
echo "built $APP"
