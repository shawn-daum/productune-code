#!/usr/bin/env bash
# prdt v1 uninstall — reverse of install.sh.
# Keeps the operator's own state unless --purge is passed — the KEEP-LIST:
#   overrides/ · wiki/ · register · prdt.env
# `register` (T-586) is the PO's conversational register (audience · form ·
# structure · address); without it on this list a reinstall silently reset the
# operator's tone to every default. §4 removes ONLY the mirrored trees named
# there, so anything not named is kept — add to the list AND to the message.
#
# T-645: this used to key "is this registration ours" on the SPELLED
# `$PRDT_HOME/hooks/` prefix while install.sh (since T-640) registers the
# RESOLVED one — so on a machine whose spelled $PRDT_HOME (or $HOME) differs
# from its resolved one (a dotfiles-symlinked ~/.prdt, a HOME with a
# symlinked component), §1's strip matched nothing, §1's verify passed
# vacuously (nothing it looked for was ever there to begin with), and §4 then
# deleted the mirror out from under every registration settings.json still
# held — command-not-found on every hook, every session, plus a dangling
# ~/.local/bin/prdt (§3 compared the resolved `readlink` target against the
# unresolved $PRDT_HOME the same way). Now: every path this script keys on is
# resolved physically before use (install.sh's own §0b fix), and "ours" is
# BASENAME membership in the manifest roster — the same predicate install.sh's
# strip and onboarding.ts's `isPrdtHook` use — so a registration is recognized
# regardless of which spelling wrote it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # packages/core
say() { printf '%s\n' "$*"; }
# T-485: abort loudly rather than delete the mirror out from under live
# registrations — a settings.json entry pointing at a removed script fails on
# EVERY prompt on that machine.
die() { printf 'prdt-uninstall: %s\n' "$*" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || die "jq is required"
command -v python3 >/dev/null 2>&1 || die "python3 is required"
MANIFEST="$ROOT/scripts/hook-manifest.json"
[ -f "$MANIFEST" ] || die "hook roster manifest not found: $MANIFEST — refusing to guess which registrations are ours"
jq -e '(.basenames | type) == "array" and (.basenames | length) > 0' "$MANIFEST" >/dev/null 2>&1 \
  || die "hook roster manifest has no non-empty \`basenames\` array: $MANIFEST"

# Physical resolution — same primitive install.sh §0b uses (symlinks, `..`,
# `//`, a trailing `/`, a relative path all collapse to one canonical string).
resolve_path() {
  python3 - "$1" <<'PYEOF'
import os, sys
print(os.path.realpath(sys.argv[1]))
PYEOF
}
PRDT_HOME_GIVEN="${PRDT_HOME:-$HOME/.prdt}"
CLAUDE_DIR_GIVEN="${CLAUDE_DIR:-$HOME/.claude}"
PRDT_HOME="$(resolve_path "$PRDT_HOME_GIVEN")"
CLAUDE_DIR="$(resolve_path "$CLAUDE_DIR_GIVEN")"
[ "$PRDT_HOME" = "$PRDT_HOME_GIVEN" ] \
  || say "0) PRDT_HOME=$PRDT_HOME_GIVEN resolves to $PRDT_HOME — the resolved path is what is matched"
[ "$CLAUDE_DIR" = "$CLAUDE_DIR_GIVEN" ] \
  || say "0) CLAUDE_DIR=$CLAUDE_DIR_GIVEN resolves to $CLAUDE_DIR — the resolved path is what is written"

TMP=""
cleanup() { [ -n "${TMP:-}" ] || return 0; rm -f "$TMP"; }
trap cleanup EXIT

# 1. hooks + statusline out of settings.json — BEFORE §4 removes the scripts.
#    T-485/S6: this used to strip four hardcoded event keys while the roster also
#    registers UserPromptSubmit, so `prdt-user-prompt.sh` survived uninstall as a
#    dangling registration. T-645: strip by BASENAME membership in the manifest
#    roster now, not by path prefix — other apps' and the user's own hooks
#    still never match (their basenames are not in the manifest).
SETTINGS="$CLAUDE_DIR/settings.json"
if [ -f "$SETTINGS" ]; then
  say "1) Removing prdt hooks/statusline from $SETTINGS"
  TMP="$(mktemp "$SETTINGS.XXXXXX")"
  jq --arg sl "$PRDT_HOME/bin/statusline-prdt.sh" --slurpfile manifest "$MANIFEST" '
    ($manifest[0].basenames) as $ours |
    def cmdBasename($cmd): ($cmd // "")
      | (if startswith("\"") then .[1:] else . end)
      | (if endswith("\"") then .[:-1] else . end)
      | split("/") | last;
    def isMine($cmd): ($ours | index(cmdBasename($cmd))) != null;
    def strip(arr): (arr // []) | map(
      .hooks = ((.hooks // []) | map(select(isMine(.command) | not)))
    ) | map(select((.hooks | length) > 0));
    (if (.hooks | type) == "object" then
       .hooks = (.hooks | with_entries(.value = strip(.value))
                        | with_entries(select((.value | length) > 0)))
     else . end) |
    (if ((.statusLine.command // "") | (. == $sl or . == ("\"" + $sl + "\""))) then del(.statusLine) else . end)
  ' "$SETTINGS" > "$TMP" || die "could not rewrite $SETTINGS (jq failed) — nothing removed"
  # verify the candidate before it lands: no command bearing one of OUR
  # basenames may still be present (T-645: basename, not the hooks dir §4 is
  # about to delete — a stale spelling would have passed the old prefix check
  # vacuously without ever being removed).
  jq -e --slurpfile manifest "$MANIFEST" '
    ($manifest[0].basenames) as $ours |
    def cmdBasename(cmd): (cmd // "")
      | (if startswith("\"") then .[1:] else . end)
      | (if endswith("\"") then .[:-1] else . end)
      | split("/") | last;
    [(.hooks // {}) | to_entries[] | (.value // [])[] | (.hooks // [])[] | (.command // "")]
    | all(cmdBasename(.) as $b | ($ours | index($b)) == null)
  ' "$TMP" >/dev/null \
    || die "prdt registrations still present after the strip — $SETTINGS left unchanged, nothing removed"
  mv "$TMP" "$SETTINGS"
  TMP=""
fi

# 2. agents
say "2) Removing prdt-* agents"
rm -f "$CLAUDE_DIR"/agents/prdt-po.md "$CLAUDE_DIR"/agents/prdt-designer.md \
      "$CLAUDE_DIR"/agents/prdt-developer.md "$CLAUDE_DIR"/agents/prdt-qa.md

# 3. PATH symlink (only if it points at our bin) — the link's own target is
#    resolved physically too (T-645): install.sh always writes the RESOLVED
#    $PRDT_HOME as the target, so comparing readlink's raw text against a
#    spelled $PRDT_HOME here missed it whenever the two spellings differed.
if [ -L "$HOME/.local/bin/prdt" ]; then
  LINK_TARGET="$(readlink "$HOME/.local/bin/prdt")"
  case "$LINK_TARGET" in
    /*) ;;
    *) LINK_TARGET="$HOME/.local/bin/$LINK_TARGET" ;;
  esac
  case "$(resolve_path "$LINK_TARGET")" in
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
