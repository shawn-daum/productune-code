#!/usr/bin/env bash
# DEPRECATED forwarder (T-293): the installer's canonical name is install.sh.
# Kept only so `prdt update` on machines whose installed prdt copy predates the
# rename still works (that copy execs scripts/prdt-install.sh after pulling).
# Safe to remove once every flipped machine has run `prdt update` ≥ once.
exec "$(cd "$(dirname "$0")" && pwd)/install.sh" "$@"
