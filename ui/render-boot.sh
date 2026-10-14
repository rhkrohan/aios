#!/bin/bash
# Re-render the boot screen (Plymouth) from the login splash's own QML, so the two
# look the same: ui/render-boot.sh. Runs in the arm64 Fedora build container with
# the SIOS fonts; writes into system_files/usr/share/plymouth/themes/sios/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/system_files/usr/share/plymouth/themes/sios"
docker image inspect sios-appsdev >/dev/null 2>&1 || docker build -q --platform linux/arm64 -t sios-appsdev -f "$ROOT/apps/Containerfile.dev" "$ROOT/apps"
rm -f "$OUT"/orb-*.png
docker run --rm --platform linux/arm64 \
  -v "$ROOT/apps/boot-render":/src -v "$ROOT/system_files/usr/share/plasma/look-and-feel/org.sios.desktop/contents/splash":/splash-src:ro \
  -v "$ROOT/system_files/usr/share/fonts/sios":/usr/share/fonts/sios -v "$OUT":/out sios-appsdev bash -c '
    set -e
    # a copy of the orb whose clock can be stopped, so frames are stepped exactly
    mkdir -p /splash && cp /splash-src/Orb.qml /splash/
    sed -i "s/readonly property bool still: false/property bool still: false/" /splash/Orb.qml
    cmake -S /src -B /tmp/b -G Ninja -Wno-dev >/dev/null && cmake --build /tmp/b >/dev/null
    echo "rendering..."
    QT_QPA_PLATFORM=offscreen /tmp/b/boot-render /splash /out /src/render.qml || { echo "render failed: $?"; exit 1; }'
ls "$OUT"/orb-*.png | wc -l | xargs echo "orb frames:"
