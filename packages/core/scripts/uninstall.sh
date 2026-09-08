#!/usr/bin/env bash
# prdt v1 uninstall — reverse of install.sh.
# Keeps the operator's own state unless --purge is passed — the KEEP-LIST:
#   overrides/ · wiki/ · register · prdt.env
# `register` (T-586) is the PO's conversational register (audience · form ·
# structure · address); without it on this list a reinstall silently reset the
# operator's tone to every default. §4 removes ONLY the mirrored trees named
# there, so anything not named is kept — add to the list AND to the message.
set -euo pipefail

PRDT_HOME="${PRDT_HOME:-$HOME/.prdt}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
say() { printf '%s\n' "$*"; }
# T-485: abort loudly rather than delete the mirror out from under live
# registrations — a settings.json entry pointing at a removed script fails on
# EVERY prompt on that machine.
die() { printf 'prdt-uninstall: %s\n' "$*" >&2; exit 1; }
TMP=""
cleanup() { [ -n "${TMP:-}" ] || return 0; rm -f "$TMP"; }
trap cleanup EXIT

# 1. hooks + statusline out of settings.json — BEFORE §4 removes the scripts.
#    T-485/S6: this used to strip four hardcoded event keys while the roster also
#    registers UserPromptSubmit, so `prdt-user-prompt.sh` survived uninstall as a
#    dangling registration. Strip by the $PRDT_HOME/hooks/ path prefix across
#    EVERY event key instead — other apps' and the user's own hooks never match.
SETTINGS="$CLAUDE_DIR/settings.json"
if [ -f "$SETTINGS" ]; then
  command -v jq >/dev/null 2>&1 \
    || die "jq is required to remove the prdt registrations from $SETTINGS — refusing to remove $PRDT_HOME while they point into it"
  say "1) Removing prdt hooks/statusline from $SETTINGS"
  TMP="$(mktemp "$SETTINGS.XXXXXX")"
  jq --arg h "$PRDT_HOME/hooks/" --arg sl "$PRDT_HOME/bin/statusline-prdt.sh" '
    def isMine(cmd): (cmd // "") | (startswith($h) or startswith("\"" + $h));
    def strip(arr): (arr // []) | map(
      .hooks = ((.hooks // []) | map(select(isMine(.command) | not)))
    ) | map(select((.hooks | length) > 0));
    (if (.hooks | type) == "object" then
       .hooks = (.hooks | with_entries(.value = strip(.value))
                        | with_entries(select((.value | length) > 0)))
     else . end) |
    (if ((.statusLine.command // "") | (. == $sl or . == ("\"" + $sl + "\""))) then del(.statusLine) else . end)
  ' "$SETTINGS" > "$TMP" || die "could not rewrite $SETTINGS (jq failed) — nothing removed"
  # verify the candidate before it lands: no command may still point into the
  # hooks dir §4 is about to delete.
  jq -e --arg h "$PRDT_HOME/hooks/" '
    [(.hooks // {}) | to_entries[] | (.value // [])[] | (.hooks // [])[] | (.command // "")]
    | all((startswith($h) or startswith("\"" + $h)) | not)
  ' "$TMP" >/dev/null \
    || die "prdt registrations still present after the strip — $SETTINGS left unchanged, nothing removed"
  mv "$TMP" "$SETTINGS"
  TMP=""
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
  say "4) Removing $PRDT_HOME mirror (keeping overrides/ + wiki/ + register + prdt.env; --purge removes all)"
  rm -rf "$PRDT_HOME/discipline" "$PRDT_HOME/hooks" "$PRDT_HOME/bin" "$PRDT_HOME/doctrine.md"
fi

say "prdt uninstall done."
