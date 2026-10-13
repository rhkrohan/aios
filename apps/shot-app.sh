#!/bin/bash
# Screenshot a SIOS app on a virtual screen (no VM needed):
#   apps/shot-app.sh sios-files out.png [app args...]
# Builds the app (same as build-app.sh), runs it under Xvfb at 1440x900 with
# the SIOS fonts and icons, waits a few seconds, and saves the screen.
set -euo pipefail
APP="${1:?usage: apps/shot-app.sh <app> <out.png> [args]}"; OUT="${2:?out.png}"; shift 2
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(dirname "$HERE")"
docker image inspect sios-appsdev >/dev/null 2>&1 || docker build -q --platform linux/arm64 -t sios-appsdev -f "$HERE/Containerfile.dev" "$HERE"
docker image inspect sios-appsshot >/dev/null 2>&1 || docker build -q --platform linux/arm64 -t sios-appsshot -f "$HERE/Containerfile.shot" "$HERE"
mkdir -p "$(dirname "$OUT")"
docker run --rm --platform linux/arm64 -v "$HERE/$APP":/src -v "sios-$APP-build":/build \
  -v "$ROOT/system_files/usr/share/fonts/sios":/usr/share/fonts/sios:ro \
  -v "$ROOT/system_files/usr/share/icons/hicolor/scalable/apps":/usr/share/icons/hicolor/scalable/apps-sios:ro \
  -v "$(cd "$(dirname "$OUT")" && pwd)":/out sios-appsshot bash -c "
    cmake -S /src -B /build -G Ninja -DCMAKE_BUILD_TYPE=Release -Wno-dev >/dev/null && cmake --build /build >/dev/null
    cp /usr/share/icons/hicolor/scalable/apps-sios/* /usr/share/icons/hicolor/scalable/apps/ 2>/dev/null; fc-cache -f >/dev/null
    mkdir -p /root/Documents /root/Pictures /root/Downloads /root/Projects; touch /root/Documents/Notes.txt /root/Documents/Budget.ods /root/Documents/Report.pdf /root/Documents/Plan.docx /root/Downloads/a.zip /root/Downloads/b.png /root/Downloads/c.pdf; mkdir -p /root/Projects/app
    Xvfb :1 -screen 0 1440x900x24 >/dev/null 2>&1 & sleep 1
    export DISPLAY=:1 QT_QPA_PLATFORM=xcb XDG_RUNTIME_DIR=/tmp/rt LIBGL_ALWAYS_SOFTWARE=1 QT_QUICK_BACKEND=software; mkdir -p -m 700 /tmp/rt
    dbus-run-session -- bash -c '/build/$APP $* > /tmp/log 2>&1 & sleep 6; import -window root /out/$(basename "$OUT")'
    grep -iE 'qml|error|warn' /tmp/log | grep -v 'propagateSizeHints' | head -15"
echo "saved $OUT"
