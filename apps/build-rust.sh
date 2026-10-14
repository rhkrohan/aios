#!/bin/bash
# Test and build capd and brain-d for arm64 Fedora 44 (like the image does),
# and (optionally) send them to the test VM:  apps/build-rust.sh [user@vm]
# On the VM they land in ~/.local/bin, since /usr is read-only there.
set -euo pipefail
VM="${1:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
OUT="$HERE/.rust-bin"
docker image inspect sios-rustdev >/dev/null 2>&1 || docker build -q --platform linux/arm64 -t sios-rustdev -f "$HERE/Containerfile.rustdev" "$HERE"
mkdir -p "$OUT"
# separate target folders in volumes, so the Mac's own builds aren't touched
docker run --rm --platform linux/arm64 \
  -v "$ROOT/capd":/src/capd -v "$ROOT/brain-d":/src/brain-d -v "$OUT":/out \
  -v sios-rust-registry:/root/.cargo/registry -v sios-rust-target:/target \
  sios-rustdev bash -c '
    set -e
    for c in capd brain-d; do
      CARGO_TARGET_DIR=/target/$c cargo test --release --locked --quiet --manifest-path /src/$c/Cargo.toml
      CARGO_TARGET_DIR=/target/$c cargo build --release --locked --quiet --manifest-path /src/$c/Cargo.toml
      cp /target/$c/release/$c /out/
    done'
if [ -n "$VM" ]; then
  # copy beside, then rename over: replacing a running program's file in place fails ("text file busy")
  ssh "$VM" "mkdir -p ~/.local/bin"
  scp -q "$OUT/capd" "$VM:.local/bin/capd.new"
  scp -q "$OUT/brain-d" "$VM:.local/bin/brain-d.new"
  ssh "$VM" "mv -f ~/.local/bin/capd.new ~/.local/bin/capd && mv -f ~/.local/bin/brain-d.new ~/.local/bin/brain-d"
fi
echo "built capd and brain-d (arm64) in $OUT"
