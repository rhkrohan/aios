# Phase 1: Brain core
Status: Not started

## Goal
A working brain service: answers from the command bar locally, and routes hard requests to the cloud with consent.

## Tasks
- [ ] brain-d skeleton in Rust as a systemd user service, with health check and logs
- [ ] D-Bus interface for brain-d (submit request, stream reply, status)
- [ ] llama.cpp server as a system service; model stored in /var; pick Premium and Lite models
- [ ] Provider interface (trait) + local provider + one cloud provider (Claude)
- [ ] Router v1: rules-based local vs cloud, consent prompt, offline fallback
- [ ] Reflex v1: cached state, typed questions, option probabilities, policy file thresholds
- [ ] Constrained output: model can only emit valid tool names and schemas
- [ ] Command bar (Super + Space) as a KDE component talking to brain-d
- [ ] Hardware check: detect Premium vs Lite; store edition
- [ ] Brain status pill in the top bar

## Gate
- [ ] Networking off: command bar answers using the local model
- [ ] A hard request prompts for consent and goes to cloud when approved
- [ ] Reflex returns correct area for a set of 20 sample requests

## Learned
