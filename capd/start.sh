#!/bin/sh
# Start the live machine: build capd if needed, set up the sandbox the first
# time, then run the daemon. Keep this terminal open; Ctrl+C stops it.
set -e
cd "$(dirname "$0")"
CARGO="${CARGO:-$HOME/.cargo/bin/cargo}"
"$CARGO" build --release --quiet
SANDBOX="${SIOS_ROOT:-$HOME/SIOS-sandbox}"
if [ ! -d "$SANDBOX" ]; then
  ./target/release/capd seed
fi
exec ./target/release/capd serve
