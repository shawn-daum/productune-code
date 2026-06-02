#!/usr/bin/env bash
# scripts/ci/run-install-smoke.sh
#
# Non-interactive install smoke for T-021 (C1 fresh-install CI smoke), check (a).
#
# Runs packages/core/scripts/install.sh with stdin closed (`< /dev/null`) inside
# a throwaway $HOME so a fresh-machine install path is actually exercised — the
# exact gap the deferred_candidate `v0.5-fresh-install-ci-smoke` calls out
# ("본 머신에서만 굴려서 fresh path 안 탐").
#
# A clean CI runner has neither the `claude` CLI nor a logged-in session, and
# install.sh's preflight (ensure_claude_installed / ensure_claude_authed) would
# `die` on a non-interactive shell. To exercise the install BODY (agent
# symlinks, env seeding, doctrine mirror, settings.json hook merge) rather than
# only the preflight gate, this harness puts lightweight stubs for `claude` and
# `npm` at the front of PATH. The stubs report "installed + authed" so control
# flows past preflight into the real install logic.
#
# After install.sh returns 0, the harness asserts the fresh-install invariants:
#   - all four persona agent symlinks exist under $HOME/.claude/agents and are
#     RELATIVE-resolvable (point at this repo, not a dangling absolute path)
#   - ~/.productune/productune.env exists and carries the engine marker
#   - ~/.claude/settings.json is valid JSON with the strip-cost hook registered
#
# Exit 0 = clean non-interactive install. Exit 1 = install break or invariant
# violation.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
INSTALL="$REPO_ROOT/packages/core/scripts/install.sh"

[ -f "$INSTALL" ] || { printf 'FAIL: install.sh not found at %s\n' "$INSTALL" >&2; exit 1; }

# ── isolated $HOME ──────────────────────────────────────────────────────────
SMOKE_HOME="$(mktemp -d "${TMPDIR:-/tmp}/pdt-install-smoke.XXXXXX")"
cleanup() { rm -rf "$SMOKE_HOME"; }
trap cleanup EXIT

# ── stub bin dir (claude + npm) ─────────────────────────────────────────────
STUB_BIN="$SMOKE_HOME/.stub-bin"
mkdir -p "$STUB_BIN"

cat > "$STUB_BIN/claude" <<'STUB'
#!/usr/bin/env bash
# minimal claude stub for install smoke — satisfies install.sh preflight only.
case "$1" in
  --version) echo "claude 0.0.0-smoke-stub" ;;
  auth)
    case "${2:-}" in
      status) echo '{"loggedIn":true,"email":"smoke@ci.local","orgName":"ci"}' ;;
      login)  echo "stub login ok" ;;
      *) echo '{"loggedIn":true}' ;;
    esac
    ;;
  *) exit 0 ;;
esac
STUB
chmod +x "$STUB_BIN/claude"

# npm stub — install.sh only invokes `npm install -g ...` / `npm prefix -g`
# inside the auto-install branch, which the claude stub avoids; provide a no-op
# so any incidental call cannot reach the network.
cat > "$STUB_BIN/npm" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  prefix) echo "$HOME/.npm-global" ;;
  install) exit 0 ;;
  *) exit 0 ;;
esac
STUB
chmod +x "$STUB_BIN/npm"

printf '[run-install-smoke] isolated HOME: %s\n' "$SMOKE_HOME"

# ── run install non-interactively ───────────────────────────────────────────
set +e
HOME="$SMOKE_HOME" PATH="$STUB_BIN:$PATH" bash "$INSTALL" < /dev/null
rc=$?
set -e

if [ "$rc" -ne 0 ]; then
  printf 'FAIL: install.sh exited non-zero (%d) under non-interactive isolated HOME\n' "$rc" >&2
  exit 1
fi
printf '[run-install-smoke] install.sh non-interactive exit OK\n'

fail=0
bad() { printf 'FAIL: %s\n' "$*" >&2; fail=1; }

# ── invariant 1: persona agent symlinks present + resolvable ────────────────
for agent in pdt-po pdt-designer pdt-developer pdt-qa; do
  link="$SMOKE_HOME/.claude/agents/$agent.md"
  if [ ! -e "$link" ]; then
    bad "agent symlink missing: $link"
    continue
  fi
  # must resolve to an existing target (catches dangling absolute-path symlinks)
  if [ -L "$link" ] && [ ! -e "$(readlink "$link")" ] && [ ! -e "$link" ]; then
    bad "agent symlink dangling: $link -> $(readlink "$link")"
  fi
done
[ "$fail" -eq 0 ] && printf '[run-install-smoke] persona agent symlinks OK\n'

# ── invariant 2: productune.env seeded with engine marker ───────────────────
env_file="$SMOKE_HOME/.productune/productune.env"
if [ ! -f "$env_file" ]; then
  bad "productune.env not created at $env_file"
elif ! grep -qE '=claude' "$env_file"; then
  bad "productune.env missing engine=claude marker"
fi
[ -f "$env_file" ] && [ "$fail" -eq 0 ] && printf '[run-install-smoke] productune.env seeded OK\n'

# ── invariant 3: settings.json valid JSON + strip hook registered ───────────
settings="$SMOKE_HOME/.claude/settings.json"
if [ ! -f "$settings" ]; then
  bad "settings.json not created at $settings"
elif ! jq -e . "$settings" >/dev/null 2>&1; then
  bad "settings.json is not valid JSON"
elif ! jq -e '[.. | strings | select(endswith("post-bash-strip-cost.sh"))] | length > 0' "$settings" >/dev/null 2>&1; then
  bad "settings.json missing post-bash-strip-cost.sh hook registration"
fi
[ -f "$settings" ] && [ "$fail" -eq 0 ] && printf '[run-install-smoke] settings.json hooks OK\n'

if [ "$fail" -ne 0 ]; then
  printf '\n[run-install-smoke] FAIL — fresh-install invariant(s) violated.\n' >&2
  exit 1
fi

printf '[run-install-smoke] OK — non-interactive fresh install passed.\n'
exit 0
