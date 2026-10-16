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
#!/usr/bin/python3 -I
# Installs SIOS's own programs from /var/tmp/sios-dev into the /usr overlay (test VM only).
# Each file is opened without following links (O_NOFOLLOW), checked through that open
# handle (a plain file, owned by the user who ran sudo, one link, a sane size), read
# into memory and written to /usr/bin from there: nothing swapped in the folder after
# the check can change what is installed.
import os, stat, subprocess, sys, hashlib
NAMES = ["capd", "brain-d", "sios-agents", "sios-store", "sios-settings", "sios-ask", "sios-files", "sios-memory", "sios-monitor", "sios-approve"]
if subprocess.run(["findmnt", "-n", "-o", "FSTYPE", "/usr"], capture_output=True, text=True).stdout.strip() != "overlay":
    sys.exit("no /usr overlay: run bootc usr-overlay first")
uid = int(os.environ.get("SUDO_UID", "-1"))
try:
    d = os.open("/var/tmp/sios-dev", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
except OSError:
    sys.exit(0)
for name in NAMES:
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=d)
    except OSError:
        continue
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != uid or st.st_nlink != 1 or st.st_size > 512 << 20:
            print(f"skipped {name}: not a plain file of yours"); continue
        data = b""
        while chunk := os.read(fd, 1 << 20):
            data += chunk
    finally:
        os.close(fd)
    tmp = f"/usr/bin/.{name}.sios-dev"
    with open(tmp, "wb") as out:
        out.write(data)
    os.chmod(tmp, 0o755)
    os.chown(tmp, 0, 0)
    os.replace(tmp, f"/usr/bin/{name}")
    subprocess.run(["logger", "-t", "sios-dev", f"installed {name} {hashlib.sha256(data).hexdigest()[:16]}"])
    print(f"installed {name}")
HELPER
sudo chmod 755 /etc/sios-dev/install
echo "rohan ALL=(root) NOPASSWD: /usr/bin/bootc usr-overlay, /etc/sios-dev/install" | sudo tee /etc/sudoers.d/sios-dev >/dev/null
sudo chmod 440 /etc/sudoers.d/sios-dev
sudo visudo -cf /etc/sudoers.d/sios-dev
echo "vm-dev ready"
