#!/bin/bash
# The one-time setup ui/vm-dev.sh needs on the TEST VM, run there with your password:
#   ssh -t rohan@192.168.99.134 'bash -s' < ui/vm-dev-setup.sh
# It adds a root-owned helper that copies only SIOS's own program names from
# /var/tmp/sios-dev into /usr/bin (no other files, no links, no arguments), and a
# sudo rule for that helper and for bootc usr-overlay. Undo: sudo rm -r /etc/sios-dev /etc/sudoers.d/sios-dev
#
# Know the limit: anything running as you on this VM could stage a program there and
# have it installed until the next reboot (SIOS trusts its own programs in /usr/bin).
# So this is for the test VM only, never a computer with real data; each install is
# logged (journalctl -t sios-dev), and a reboot puts the image's programs back.
set -euo pipefail
sudo install -d -m 755 -o root -g root /etc/sios-dev
sudo tee /etc/sios-dev/install >/dev/null <<'HELPER'
#!/bin/bash
# installs SIOS's own programs from /var/tmp/sios-dev into the /usr overlay (test VM only)
set -euo pipefail
src=/var/tmp/sios-dev
findmnt -n -o FSTYPE /usr | grep -q overlay || { echo "no /usr overlay: run bootc usr-overlay first"; exit 1; }
[ -d "$src" ] && [ ! -L "$src" ] || exit 0
# first move the whole folder somewhere only root can reach (one rename on the same disk),
# so nothing can swap a file for a link between the check and the copy
work=$(mktemp -d /var/roothome/sios-dev.XXXXXX)
mv -T "$src" "$work/in"
chown -R -h root:root "$work/in"
for f in capd brain-d sios-agents sios-store sios-settings sios-ask sios-files sios-memory sios-monitor sios-approve; do
  p="$work/in/$f"
  [ -f "$p" ] && [ ! -L "$p" ] || continue
  install -m 755 -o root -g root "$p" "/usr/bin/$f"
  echo "installed $f $(sha256sum "$p" | cut -c1-16)" | logger -t sios-dev
done
rm -rf "$work"
HELPER
sudo chmod 755 /etc/sios-dev/install
echo "rohan ALL=(root) NOPASSWD: /usr/bin/bootc usr-overlay, /etc/sios-dev/install" | sudo tee /etc/sudoers.d/sios-dev >/dev/null
sudo chmod 440 /etc/sudoers.d/sios-dev
sudo visudo -cf /etc/sudoers.d/sios-dev
echo "vm-dev ready"
