# capd

The SIOS capability daemon: a proof of concept of the permission broker (decisions D4, D20).
Every action an AI takes on the sandbox folder goes through capd, which answers allow, ask or block.

## Run it

    ./start.sh

The first start builds capd and fills `~/SIOS-sandbox` with demo files (labels and the blocked
Taxes folder included). State lives in `~/.sios`: the signing key, the owner secret, file labels,
the decision log (`audit.jsonl`) and the outbox, where "sent" email lands instead of the internet.

Then in the SIOS preview: Settings, Brain, turn on **Live machine**, and ask something. Watch it in
Files, **Live sandbox**.

## Try it from the terminal

    ./target/release/capd help
    node harness/live-run.mjs        # real GPT on three everyday goals, report in runs/

## Tests

    cargo test

## What it is not yet

On a Mac, capd is an ordinary program: nothing stops another program from touching the sandbox
directly. On the SIOS image, capd runs as its own locked-down service and AI processes can only
reach files through it.
