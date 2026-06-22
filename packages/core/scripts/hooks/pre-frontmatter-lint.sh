#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Write|Edit|Bash
# Validates ticket frontmatter `status:` + `qa_status:` against canonical enums.
# Blocks (exit 2) on violation; passes (exit 0) on clean or non-ticket paths.
#
# Channels:
#   Write/Edit — lint the proposed content/new_string.
#   Bash       — CONSERVATIVE static detection: block only when a command
#                UNAMBIGUOUSLY injects a non-canonical `status:`/`qa_status:`
#                into a docs/tickets/.../T-*.md. Ambiguous (variable-interpolated,
#                piped, computed) → PASS (PostToolUse verify is the safety net).
#
# Cardinal rule: OVER-BLOCKING a valid write is a hard outage; under-blocking is
# recoverable. When in doubt, PASS.
#
# T-P4-136 — 2026-05-19  (initial Write|Edit guard)
# T-PATCH-138 — 2026-06-15 (anchor relax + inline-# parity + Bash channel + enum SoT)
# T-PATCH-224 — 2026-06-22 (Write|Edit: + version regex BLOCK + type WARN non-block.
#   status/qa_status/version are 100% clean across the 249 v0.5 tickets → safe to
#   block. type has 187 legacy values (build/bug/patch/…) → warn-only to avoid an
#   AC-6 false-block outage. Bash channel left as status/qa_status-only.)

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

# ── Extract a tool_input field ────────────────────────────────────────────────
read_json() {
  python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    ti = d.get('tool_input', {})
    print(ti.get('$1', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON"
}

TOOL_NAME="$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('tool_name', ''))
except Exception:
    print('')
" 2>/dev/null <<< "$EVENT_JSON")"

# ── Enum definitions (single-source via config mirror; hardcoded fallback) ────
# SoT: packages/core/config/ticket-status-enum.json → mirrored to
# ~/.productune/config/ticket-status-enum.json by install.sh. AC-6: no new
# hardcoded enum copy — these literals are the fallback ONLY (kept in parity).
STATUS_ENUM="todo|in-progress|review|user-verify|done|blocked|abandoned"
QA_STATUS_ENUM="pending|pass|fail|skipped"
# T-PATCH-224 part D: type enum + version regex. SoT = ticket-schema.md
# (§"9 ticket types" + §"version: regex"). type is NOT in ticket-status-enum.json,
# so it is hardcoded here against the schema's 9 canonical types.
TYPE_ENUM="design|impl|refactor|test|qa|deploy|close|docs|doctrine"
# version regex (ticket-schema.md §version): vN(.N)?(-suffix)? — anchored.
VERSION_REGEX='^v[0-9]+(\.[0-9]+)?(-[A-Za-z0-9_-]+)?$'

ENUM_CONFIG="$HOME/.productune/config/ticket-status-enum.json"
if [ -f "$ENUM_CONFIG" ]; then
  _loaded="$(python3 -c "
import json, sys
try:
    with open('$ENUM_CONFIG') as f:
        d = json.load(f)
    s = '|'.join(d.get('status', []))
    q = '|'.join(d.get('qa_status', []))
    if s and q:
        print(s)
        print(q)
except Exception:
    pass
" 2>/dev/null)"
  if [ -n "$_loaded" ]; then
    STATUS_ENUM="$(printf '%s' "$_loaded" | sed -n '1p')"
    QA_STATUS_ENUM="$(printf '%s' "$_loaded" | sed -n '2p')"
  fi
fi

# ── Value validator (shared) ──────────────────────────────────────────────────
# Given a key name + the text to scan, extract the first `<indent>key: value`
# line, strip a trailing inline ` #` comment (space+hash; quoted-value # is kept),
# strip surrounding quotes/whitespace, and check against the enum.
# Returns: 0 = clean/absent, 2 = violation (sets VIOLATION_VAL).
VIOLATION_VAL=""
validate_key() {
  local key="$1" text="$2" enum="$3"
  # Anchor relaxed: allow leading whitespace (gap① indented frontmatter line).
  printf '%s' "$text" | grep -qE "^[[:space:]]*${key}:" || return 0
  local raw val
  raw="$(printf '%s' "$text" | grep -E "^[[:space:]]*${key}:" | head -1)"
  # Strip the `<indent>key:` prefix and leading spaces from the value.
  val="$(printf '%s' "$raw" | sed -E "s/^[[:space:]]*${key}:[[:space:]]*//")"
  # Inline-# comment strip (T-PATCH-136 parity), quote-aware.
  # A `#` INSIDE quotes is data, not a comment — preserve it. A trailing
  # ` #…` comment AFTER the value (quoted or not) is dropped.
  local first="${val:0:1}"
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
  # Strip residual surrounding whitespace.
  val="$(printf '%s' "$val" | sed -E "s/^[[:space:]]+//; s/[[:space:]]+\$//")"
  [ -z "$val" ] && return 0
  if ! printf '%s' "$val" | grep -qE "^(${enum})\$"; then
    VIOLATION_VAL="$val"
    return 2
  fi
  return 0
}

emit_block() {
  local key="$1" val="$2" enum="$3"
  printf '[frontmatter-lint] %s: "%s" not in canonical enum.\n' "$key" "$val" >&2
  printf '  allowed: %s\n' "$(printf '%s' "$enum" | tr '|' ' ' | sed 's/  */ | /g')" >&2
  printf '  Fix the value and retry.\n' >&2
}

# ── Raw value extractor (shared by version/type — same strip logic as validate_key) ──
# Echoes the cleaned scalar value for `key` in `text`, or empty if absent.
extract_val() {
  local key="$1" text="$2" raw val first
  printf '%s' "$text" | grep -qE "^[[:space:]]*${key}:" || { printf ''; return 0; }
  raw="$(printf '%s' "$text" | grep -E "^[[:space:]]*${key}:" | head -1)"
  val="$(printf '%s' "$raw" | sed -E "s/^[[:space:]]*${key}:[[:space:]]*//")"
  first="${val:0:1}"
  if [ "$first" = '"' ]; then
    val="$(printf '%s' "$val" | sed -E 's/^("[^"]*").*$/\1/; s/^"//; s/"$//')"
  elif [ "$first" = "'" ]; then
    val="$(printf '%s' "$val" | sed -E "s/^('[^']*').*\$/\1/; s/^'//; s/'\$//")"
  else
    val="$(printf '%s' "$val" | sed -E 's/[[:space:]]+#.*$//')"
  fi
  val="$(printf '%s' "$val" | sed -E "s/^[[:space:]]+//; s/[[:space:]]+\$//")"
  printf '%s' "$val"
}

# ── version regex validator (BLOCKING) ────────────────────────────────────────
# ticket-schema.md §version. Exception: archive ids with `legacy: true` (a
# `legacy:` truthy line present in the same frontmatter text) OR a `legacy/...`
# version value — these skip the regex. All current v0.5 tickets pass (version: v0.5).
# Returns 0 = clean/absent/exempt, 2 = violation (sets VIOLATION_VAL).
validate_version() {
  local text="$1" val
  val="$(extract_val version "$text")"
  [ -z "$val" ] && return 0
  # legacy exception: explicit `legacy: true` frontmatter line, or a legacy/ id.
  if printf '%s' "$text" | grep -qE '^[[:space:]]*legacy:[[:space:]]*true([[:space:]]|$)'; then
    return 0
  fi
  case "$val" in legacy/*) return 0 ;; esac
  if ! printf '%s' "$val" | grep -qE "$VERSION_REGEX"; then
    VIOLATION_VAL="$val"
    return 2
  fi
  return 0
}

# ── type warn (NON-BLOCKING) ──────────────────────────────────────────────────
# T-PATCH-224 part D: ticket-schema.md canonicalises 9 types, but 187 of 249
# existing v0.5 tickets carry LEGACY type values (build / bug / patch / feature /
# code / fix / chore / feat …). Hard-blocking type would false-block every legit
# edit to those historical tickets (AC-6 outage). So type drift is SURFACED
# (stderr, non-blocking) — it nudges new tickets toward the canon without
# breaking edits to the legacy corpus. (Migrating the 187 legacy types to the
# canon is a separate cleanup ticket; until then type cannot be a hard gate.)
warn_type() {
  local text="$1" val
  val="$(extract_val type "$text")"
  [ -z "$val" ] && return 0
  if ! printf '%s' "$val" | grep -qE "^(${TYPE_ENUM})\$"; then
    printf '[frontmatter-lint] type: "%s" is not a canonical ticket type (non-blocking warning).\n' "$val" >&2
    printf '  canonical: %s\n' "$(printf '%s' "$TYPE_ENUM" | tr '|' ' ' | sed 's/  */ | /g')" >&2
    printf '  (legacy types are grandfathered — new tickets should use a canonical value. SoT: ticket-schema.md §"9 ticket types".)\n' >&2
  fi
  return 0
}

lint_text() {
  local text="$1"
  [ -z "$text" ] && return 0
  if ! validate_key "status" "$text" "$STATUS_ENUM"; then
    emit_block "status" "$VIOLATION_VAL" "$STATUS_ENUM"
    return 2
  fi
  if ! validate_key "qa_status" "$text" "$QA_STATUS_ENUM"; then
    emit_block "qa_status" "$VIOLATION_VAL" "$QA_STATUS_ENUM"
    return 2
  fi
  # T-PATCH-224 part D: version regex (BLOCKING) + type warn (NON-BLOCKING).
  if ! validate_version "$text"; then
    printf '[frontmatter-lint] version: "%s" does not match the canonical version pattern.\n' "$VIOLATION_VAL" >&2
    printf '  required: vN(.N)?(-suffix)?  e.g. v0.5, v1, v2.3-beta  (ticket-schema.md §version)\n' >&2
    printf '  exception: archive ids with legacy: true, or a legacy/... id.\n' >&2
    return 2
  fi
  warn_type "$text"   # non-blocking surface only — never changes the return code
  return 0
}

# ════════════════════════════════════════════════════════════════════════════
# Channel: Write / Edit
# ════════════════════════════════════════════════════════════════════════════
if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" ]]; then
  FILE_PATH="$(read_json file_path)"
  FILE_PATH="${FILE_PATH#./}"
  FILE_PATH="${FILE_PATH#/}"
  # Match BOTH relative (`docs/tickets/...`) and absolute (`Users/.../docs/tickets/...`)
  # paths. The Write tool ALWAYS passes an absolute path, so the bare
  # `docs/tickets/*` glob silently missed every Write/Edit and the guard never
  # fired on the primary write path (T-PATCH-208: pending/backlog drift). The
  # `*/docs/tickets/*` arm covers absolute paths after the leading `/` strip.
  [[ "$FILE_PATH" == docs/tickets/*/T-*.md || "$FILE_PATH" == */docs/tickets/*/T-*.md ]] || exit 0

  if [[ "$TOOL_NAME" == "Write" ]]; then
    LINT_TEXT="$(read_json content)"
  else
    LINT_TEXT="$(read_json new_string)"
  fi
  lint_text "$LINT_TEXT" || exit 2
  exit 0
fi

# ════════════════════════════════════════════════════════════════════════════
# Channel: Bash — CONSERVATIVE detection only.
# Block iff the command unambiguously writes a non-canonical status:/qa_status:
# literal into a docs/tickets/.../T-*.md. Anything with variable interpolation,
# command substitution, or a status value that is itself a variable → PASS.
# ════════════════════════════════════════════════════════════════════════════
if [[ "$TOOL_NAME" == "Bash" ]]; then
  CMD="$(read_json command)"
  [ -z "$CMD" ] && exit 0

  # Gate 1 — the command must reference a ticket md path literally.
  printf '%s' "$CMD" | grep -qE 'docs/tickets/[^[:space:]]*/T-[^[:space:]]*\.md' || exit 0

  # Gate 2 — extract literal `status:`/`qa_status:` values the command would
  # write. Conservative: we only inspect values that are PLAIN LITERALS
  # (letters/digits/underscore/hyphen). Any value containing $, `, or other
  # shell-expansion metachars is treated as ambiguous → not flagged here.
  #
  # Patterns recognised (literal status assignment forms):
  #   sed  's/.../status: VALUE/'            (and s|...| variants)
  #   echo/printf '... status: VALUE ...'    (heredoc / redirection bodies)
  #   any occurrence of `status: VALUE` or `qa_status: VALUE` in the command
  #
  # We scan for `(qa_)?status:` followed by a plain-literal token and check it.
  CANDIDATES="$(printf '%s' "$CMD" | grep -oE '(qa_)?status:[[:space:]]*[A-Za-z0-9_-]+' || true)"
  [ -z "$CANDIDATES" ] && exit 0

  # If the command contains shell expansion right around a status token we play
  # safe and bail (ambiguous). Detect `status:` immediately followed (after
  # optional spaces) by $ or backtick.
  if printf '%s' "$CMD" | grep -qE '(qa_)?status:[[:space:]]*(\$|`)'; then
    exit 0
  fi

  while IFS= read -r cand; do
    [ -z "$cand" ] && continue
    if printf '%s' "$cand" | grep -qE '^qa_status:'; then
      key="qa_status"; enum="$QA_STATUS_ENUM"
    else
      key="status"; enum="$STATUS_ENUM"
    fi
    val="$(printf '%s' "$cand" | sed -E 's/^(qa_)?status:[[:space:]]*//')"
    if ! printf '%s' "$val" | grep -qE "^(${enum})\$"; then
      printf '[frontmatter-lint] Bash command would write %s: "%s" (non-canonical) into a ticket file.\n' "$key" "$val" >&2
      printf '  allowed: %s\n' "$(printf '%s' "$enum" | tr '|' ' ' | sed 's/  */ | /g')" >&2
      printf '  Use the canonical kebab-case value (e.g. in-progress, not in_progress; status is not qa).\n' >&2
      exit 2
    fi
  done <<< "$CANDIDATES"

  exit 0
fi

exit 0
