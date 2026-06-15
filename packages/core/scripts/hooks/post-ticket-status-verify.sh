#!/usr/bin/env bash
# Claude Code hook — PostToolUse, matcher: Bash
# Safety net for the Bash channel of pre-frontmatter-lint.sh.
#
# PreToolUse Bash detection is intentionally conservative (it only blocks
# UNAMBIGUOUS literal injections — variable/computed status values pass). This
# hook runs AFTER a Bash command and re-reads the ACTUAL on-disk frontmatter of
# any docs/tickets/.../T-*.md the command referenced, catching dynamically
# assembled non-canonical status:/qa_status: values.
#
# NON-BLOCKING by design: it cannot exit 2 (the file is already written, and
# PostToolUse blocking is the wrong UX here). It SURFACES a corrective message
# on stderr so the model self-corrects in the same turn. Over-surfacing is
# harmless; over-blocking would be an outage — so we never block.
#
# T-PATCH-138 — 2026-06-15

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

TOOL_NAME="$(python3 -c "
import json, sys
try:
    print(json.loads(sys.stdin.read()).get('tool_name', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON")"
[[ "$TOOL_NAME" == "Bash" ]] || exit 0

CMD="$(python3 -c "
import json, sys
try:
    print(json.loads(sys.stdin.read()).get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON")"
[ -z "$CMD" ] && exit 0

# Collect literal ticket md paths the command referenced.
PATHS="$(printf '%s' "$CMD" | grep -oE '[^[:space:]"'"'"']*docs/tickets/[^[:space:]"'"'"']*/T-[^[:space:]"'"'"']*\.md' || true)"
[ -z "$PATHS" ] && exit 0

# ── Enum (config mirror; hardcoded fallback) ─────────────────────────────────
STATUS_ENUM="todo|in-progress|review|user-verify|done|blocked|abandoned"
QA_STATUS_ENUM="pending|pass|fail"
ENUM_CONFIG="$HOME/.productune/config/ticket-status-enum.json"
if [ -f "$ENUM_CONFIG" ]; then
  _loaded="$(python3 -c "
import json
try:
    d = json.load(open('$ENUM_CONFIG'))
    s = '|'.join(d.get('status', [])); q = '|'.join(d.get('qa_status', []))
    if s and q:
        print(s); print(q)
except Exception:
    pass
" 2>/dev/null)"
  if [ -n "$_loaded" ]; then
    STATUS_ENUM="$(printf '%s' "$_loaded" | sed -n '1p')"
    QA_STATUS_ENUM="$(printf '%s' "$_loaded" | sed -n '2p')"
  fi
fi

extract_val() {
  # $1=key $2=file → echoes normalised value (inline-# stripped, quotes off)
  local key="$1" file="$2" raw val first
  raw="$(grep -E "^[[:space:]]*${key}:" "$file" 2>/dev/null | head -1)"
  [ -z "$raw" ] && return 0
  val="$(printf '%s' "$raw" | sed -E "s/^[[:space:]]*${key}:[[:space:]]*//")"
  first="${val:0:1}"
  if [ "$first" = '"' ]; then
    # Double-quoted scalar: keep the "…" payload, drop any trailing comment.
    val="$(printf '%s' "$val" | sed -E 's/^("[^"]*").*$/\1/; s/^"//; s/"$//')"
  elif [ "$first" = "'" ]; then
    # Single-quoted scalar: keep the '…' payload, drop any trailing comment.
    val="$(printf '%s' "$val" | sed -E "s/^('[^']*').*\$/\1/; s/^'//; s/'\$//")"
  else
    # Unquoted: drop from the first ` #` (whitespace + hash) onward.
    val="$(printf '%s' "$val" | sed -E 's/[[:space:]]+#.*$//')"
  fi
  val="$(printf '%s' "$val" | sed -E "s/^[[:space:]]+//; s/[[:space:]]+\$//")"
  printf '%s' "$val"
}

while IFS= read -r f; do
  [ -z "$f" ] && continue
  rel="${f#./}"; rel="${rel#/}"
  case "$rel" in *docs/tickets/*/T-*.md) ;; *) continue ;; esac
  [ -f "$f" ] || continue
  sv="$(extract_val status "$f")"
  if [ -n "$sv" ] && ! printf '%s' "$sv" | grep -qE "^(${STATUS_ENUM})\$"; then
    printf '[frontmatter-verify] %s now has non-canonical status: "%s" on disk.\n' "$f" "$sv" >&2
    printf '  allowed: %s — fix it (canonical kebab-case; status is not a type like qa).\n' "$(printf '%s' "$STATUS_ENUM" | tr '|' ' ' | sed 's/  */ | /g')" >&2
  fi
  qv="$(extract_val qa_status "$f")"
  if [ -n "$qv" ] && ! printf '%s' "$qv" | grep -qE "^(${QA_STATUS_ENUM})\$"; then
    printf '[frontmatter-verify] %s now has non-canonical qa_status: "%s" on disk.\n' "$f" "$qv" >&2
    printf '  allowed: %s — fix it.\n' "$(printf '%s' "$QA_STATUS_ENUM" | tr '|' ' ' | sed 's/  */ | /g')" >&2
  fi
done <<< "$PATHS"

exit 0
