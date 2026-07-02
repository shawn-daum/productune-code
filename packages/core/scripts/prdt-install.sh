#!/usr/bin/env bash
# prdt v1 install — mirror discipline to ~/.prdt (1-way), register agents + hook 3종.
# COEXISTS with pdt-*/pdtl-*: nothing of the old installs is touched (§2 옵트인 전환).
# Statusline is NOT auto-registered (would clobber the user's current one) —
# pass --statusline to opt in. Renamed prdt-install.sh until flip (old install.sh untouched).
#
# Usage: prdt-install.sh [--statusline]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # packages/core
PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
say() { printf '%s\n' "$*"; }

command -v jq >/dev/null 2>&1 || { echo "prdt-install: jq is required" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "prdt-install: python3 is required" >&2; exit 1; }

# 1. mirror (1-way: repo → home; user files live in overrides/, never in the mirror)
say "1) Mirroring discipline → $PRDT_HOME"
mkdir -p "$PRDT_HOME/overrides" "$PRDT_HOME/hooks" "$PRDT_HOME/bin"
rm -rf "$PRDT_HOME/discipline"
cp -R "$ROOT/discipline" "$PRDT_HOME/discipline"
cp "$ROOT/doctrine.md" "$PRDT_HOME/doctrine.md"
cp "$ROOT/scripts/hooks/prdt-session-start.sh" "$ROOT/scripts/hooks/prdt-post-compact.sh" \
   "$ROOT/scripts/hooks/prdt-post-dispatch.sh" "$PRDT_HOME/hooks/"
cp "$ROOT/scripts/prdt" "$PRDT_HOME/bin/prdt"
cp "$ROOT/scripts/statusline-prdt.sh" "$PRDT_HOME/bin/statusline-prdt.sh"
chmod +x "$PRDT_HOME/hooks/"*.sh "$PRDT_HOME/bin/prdt" "$PRDT_HOME/bin/statusline-prdt.sh"

# menus are derived — regenerate against the installed mirror
PRDT_DISCIPLINE="$PRDT_HOME/discipline" "$PRDT_HOME/bin/prdt" menus >/dev/null
say "   mirrored (discipline + doctrine + hooks + bin, menus regenerated)"

# 2. prdt.env (잠정 확정 — 열린 항목 ①: 미니멀 계승)
ENV_FILE="$PRDT_HOME/prdt.env"
if [ ! -f "$ENV_FILE" ]; then
  say "2) Writing $ENV_FILE"
  {
    printf 'PRDT_REPO=%s\n' "$ROOT"
    printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'PRDT_HOOKS_INSTALLED=true\n'
    printf 'PRDT_STATUSLINE_INSTALLED=false\n'
    printf 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1\n'
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  say "2) $ENV_FILE exists — updating PRDT_REPO only"
  python3 - "$ENV_FILE" "$ROOT" <<'PYEOF'
import sys
path, repo = sys.argv[1], sys.argv[2]
lines = [l for l in open(path).read().splitlines() if not l.startswith("PRDT_REPO=")]
lines.insert(0, f"PRDT_REPO={repo}")
open(path, "w").write("\n".join(lines) + "\n")
PYEOF
fi

# 3. agents (copy — additive; pdt-*/pdtl-* untouched)
say "3) Installing agents → $CLAUDE_DIR/agents"
mkdir -p "$CLAUDE_DIR/agents"
cp "$ROOT"/agents/prdt-*.md "$CLAUDE_DIR/agents/"

# 4. hooks merge into ~/.claude/settings.json (idempotent: prdt entries replaced, others preserved)
say "4) Registering hook 3종 in $CLAUDE_DIR/settings.json"
SETTINGS="$CLAUDE_DIR/settings.json"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
TMP="$(mktemp)"
jq --arg h "$PRDT_HOME/hooks/" '
  def strip(ev): (.hooks[ev] // []) | map(
    .hooks = ((.hooks // []) | map(select((.command // "") | startswith($h) | not)))
  ) | map(select((.hooks | length) > 0));
  .hooks = (.hooks // {}) |
  .hooks.SessionStart = (strip("SessionStart") + [
    {matcher: "startup|resume|clear",
     hooks: [{type: "command", command: ($h + "prdt-session-start.sh")}]},
    {matcher: "compact",
     hooks: [{type: "command", command: ($h + "prdt-post-compact.sh")}]}
  ]) |
  .hooks.PostToolUse = (strip("PostToolUse") + [
    {matcher: "Agent",
     hooks: [{type: "command", command: ($h + "prdt-post-dispatch.sh")}]}
  ])
' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS"

# 5. PATH symlink
if [ -d "$HOME/.local/bin" ] || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
  ln -sf "$PRDT_HOME/bin/prdt" "$HOME/.local/bin/prdt"
  say "5) Symlinked ~/.local/bin/prdt (ensure ~/.local/bin is on PATH)"
fi

# 6. statusline — opt-in only
if [ "${1:-}" = "--statusline" ]; then
  say "6) Registering statusline"
  TMP="$(mktemp)"
  jq --arg cmd "$PRDT_HOME/bin/statusline-prdt.sh" \
     '.statusLine = {type: "command", command: $cmd}' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS"
  python3 - "$ENV_FILE" <<'PYEOF'
import sys
path = sys.argv[1]
s = open(path).read().replace("PRDT_STATUSLINE_INSTALLED=false", "PRDT_STATUSLINE_INSTALLED=true")
open(path, "w").write(s)
PYEOF
else
  say "6) Statusline NOT registered (current one preserved) — opt in: prdt-install.sh --statusline"
fi

say "prdt install done. pdt-*/pdtl-* remain untouched (coexistence until flip)."
