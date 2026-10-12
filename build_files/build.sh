#!/bin/bash
# Runs inside the image at build time (never on a user's machine).

set -ouex pipefail

# Copy the contents of system_files/ of the git repo to /
cp -avf "/ctx/system_files"/. /

### SIOS look and layout (docs/plan/15-build-blueprint.md, Stage A)
# Our fonts (Instrument Sans, Jost, JetBrains Mono; all SIL Open Font License)
fc-cache -f /usr/share/fonts/sios

# Fail the build loudly if a theme package or the wordmark widget is broken,
# instead of shipping a desktop that silently falls back to stock KDE.
for f in /usr/share/plasma/look-and-feel/org.sios.desktop/metadata.json \
         /usr/share/plasma/look-and-feel/org.sios.desktop.dark/metadata.json \
         /usr/share/plasma/plasmoids/org.sios.wordmark/metadata.json \
         /usr/share/wallpapers/SIOS-Tunnel/metadata.json; do
    if command -v python3 > /dev/null; then python3 -m json.tool "$f" > /dev/null; else test -s "$f"; fi
done
test -f /usr/share/color-schemes/SIOSLight.colors
test -f /usr/share/color-schemes/SIOSDark.colors
if command -v kpackagetool6 > /dev/null; then
    kpackagetool6 --type Plasma/LookAndFeel --list --global | grep -q "org.sios.desktop"
    kpackagetool6 --type Plasma/Applet --list --global | grep -q "org.sios.wordmark"
fi
