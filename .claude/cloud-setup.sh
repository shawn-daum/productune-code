#!/usr/bin/env bash
# Claude Code cloud environment setup for `prdt test cloud` (T-1126).
# Called by packages/core/scripts/prdt-cloud-test.sh inside the cloud VM, from
# the runner commit; idempotent. Usage: cloud-setup.sh [test-user]
#
# Why (spike d-v114-t1120-spike1, 2026-10-13): the VM runs as root with no git
# identity — tests that commit fail without one, and tests that assert a
# permission denial pass as root. So the suite runs as a non-root user that
# has a git identity. Deps (pnpm install) are installed by the runner as that
# user, inside the checkout of the tested commit.
# Carries no secret: nothing from the Mac (~/.prdt/env, .env files) is used.
set -euo pipefail
U=${1:-prdt-test}

if [ "$(id -u)" = 0 ]; then
  id -u "$U" >/dev/null 2>&1 || useradd -m -s /bin/bash "$U"
  # A toolchain installed under /root (nvm, corepack) must be reachable by the
  # test user: open only the directories on the path to those binaries.
  for b in node pnpm python3 git; do
    p=$(command -v "$b" 2>/dev/null) || continue
    d=$(dirname "$(readlink -f "$p")")
    while [ "$d" != / ]; do
      case "$d" in /root|/root/*) chmod o+rx "$d" ;; esac
      d=$(dirname "$d")
    done
  done
  HOME_U=$(getent passwd "$U" | cut -d: -f6)
  run() { su -s /bin/bash "$U" -c "export PATH='$PATH' HOME='$HOME_U'; $1"; }
else
  run() { bash -c "$1"; }
fi

run "git config --global user.name 'prdt cloud test' \
  && git config --global user.email 'cloud-test@prdt.invalid' \
  && git config --global init.defaultBranch main \
  && git config --global --replace-all safe.directory '*'"
run "echo user=\$(id -un) uid=\$(id -u); node --version; pnpm --version; python3 --version; git --version; command -v jq tmux plutil || true"
