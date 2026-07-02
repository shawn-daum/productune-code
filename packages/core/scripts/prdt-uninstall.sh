#!/usr/bin/env bash
# prdt v1 uninstall — reverse of prdt-install.sh. Old pdt-*/pdtl-* installs untouched.
# Keeps ~/.prdt/overrides/ (user content) unless --purge is passed.
set -euo pipefail

PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
say() { printf '%s\n' "$*"; }

# 1. hooks + statusline out of settings.json
SETTINGS="$CLAUDE_DIR/settings.json"
if [ -f "$SETTINGS" ] && command -v jq >/dev/null 2>&1; then
  say "1) Removing prdt hooks/statusline from $SETTINGS"
  TMP="$(mktemp)"
  jq --arg h "$PRDT_HOME/hooks/" --arg sl "$PRDT_HOME/bin/statusline-prdt.sh" '
    def strip(ev): (.hooks[ev] // []) | map(
      .hooks = ((.hooks // []) | map(select((.command // "") | startswith($h) | not)))
    ) | map(select((.hooks | length) > 0));
    (if .hooks then
       .hooks.SessionStart = strip("SessionStart") |
       .hooks.PostToolUse = strip("PostToolUse")
     else . end) |
    (if (.statusLine.command // "") == $sl then del(.statusLine) else . end)
  ' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS"
fi

# 2. agents
say "2) Removing prdt-* agents"
rm -f "$CLAUDE_DIR"/agents/prdt-po.md "$CLAUDE_DIR"/agents/prdt-designer.md \
      "$CLAUDE_DIR"/agents/prdt-developer.md "$CLAUDE_DIR"/agents/prdt-qa.md

# 3. PATH symlink (only if it points at our bin)
if [ -L "$HOME/.local/bin/prdt" ]; then
  case "$(readlink "$HOME/.local/bin/prdt")" in
    "$PRDT_HOME"/*) rm -f "$HOME/.local/bin/prdt"; say "3) Removed ~/.local/bin/prdt" ;;
  esac
fi

# 4. home dir
if [ "${1:-}" = "--purge" ]; then
  say "4) Purging $PRDT_HOME (including overrides/)"
  rm -rf "$PRDT_HOME"
else
  say "4) Removing $PRDT_HOME mirror (keeping overrides/ + prdt.env; --purge removes all)"
  rm -rf "$PRDT_HOME/discipline" "$PRDT_HOME/hooks" "$PRDT_HOME/bin" "$PRDT_HOME/doctrine.md"
fi

say "prdt uninstall done."
