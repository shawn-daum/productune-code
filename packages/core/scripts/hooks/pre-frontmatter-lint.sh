#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Write|Edit|Bash
# Validates ticket frontmatter `status:` + `qa_status:` + `type:` + `version:`
# against canonical enums/regex. Blocks (exit 2) on violation; passes (exit 0) on
# clean or non-ticket paths.
#
# CANONICAL SCOPE (T-PATCH-237): every field check runs ONLY over the LEADING
# `---`…`---` frontmatter block — never the whole text. The field anchor stays
# `^[[:space:]]*type:` (indent-tolerant for indented frontmatter, hook gap①); the
# frontmatter-SLICE is what bounds it, so indented BODY `type:` code lines are out
# of scope. (There is NO col-0 `^type:` self-check command in this hook to "fix" —
# the indent-tolerant anchor + frontmatter-slice is the canonical mechanism.)
#
# Channels:
#   Write — slice the proposed content's own line-1 `---`…`---` block; lint it.
#   Edit  — FM-DIFF GATE: read file_path from disk, apply old→new (UTF-8 python
#           str.replace), compare the leading-FM slice BEFORE vs AFTER. Body-only
#           edit (FM unchanged) → PASS without linting (so a closed ticket is
#           never blocked on legacy FM it doesn't touch). FM changed → lint the
#           post-edit FM slice → BLOCK on a bad value. Unreadable target /
#           old_string absent → PASS (cardinal: ambiguous → PASS).
#   Bash  — CONSERVATIVE static detection: block only when a command
#           UNAMBIGUOUSLY injects a non-canonical status/qa_status/version/type
#           into a docs/tickets/.../T-*.md. Ambiguous (variable-interpolated,
#           piped, computed) → PASS (PostToolUse verify is the safety net for
#           status/qa_status; type/version have no PostToolUse net, which is WHY
#           the Bash literal-injection block must be a real BLOCK, not a WARN).
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
# T-PATCH-234 — 2026-06-22 (Bash channel parity: + version regex BLOCK + type WARN,
#   mirroring the Write|Edit channel. Same conservative literal-only detection as
#   the existing Bash status/qa_status arm — shell-expansion around a token → PASS.
#   Write|Edit channel UNCHANGED. type stays WARN.)
# T-PATCH-233 — 2026-06-22 (migrated the legacy ticket corpus to the 9 canon and
#   FLIPPED type WARN→BLOCK on both channels — then REVERTED the flip the same day
#   (PO+user decision). The migration STANDS; the flip does NOT. Reason: this
#   guard's `^[[:space:]]*type:` matching is indent-tolerant, so it would
#   false-block indented BODY `type:` lines (e.g. TS `type === '…'` code examples
#   in 9 closed tickets) on targeted body edits — uncureable without a
#   frontmatter-scoped extractor. type remains WARN on both channels until a
#   follow-up ticket makes the guard frontmatter-scoped.)
# T-PATCH-237 — 2026-06-23 (frontmatter-scope extraction + type WARN→BLOCK flip).
#   CANONICAL CHECK = the LEADING `---`…`---` frontmatter block ONLY, never the
#   whole text. The `^[[:space:]]*type:` anchor is deliberately KEPT indent-
#   tolerant (it must still match indented frontmatter — hook gap①); what changed
#   is the TEXT we feed it: a frontmatter SLICE, not the raw content/snippet.
#     • Write — slice the first `---`…`---` block anchored at content line 1
#       (content[0:3]=='---'); lint only that slice; no leading `---` → PASS.
#     • Edit  — IGNORE the snippet's own `---` (a body markdown `---` rule must
#       NEVER be read as a frontmatter delimiter). Read the target file_path from
#       disk, apply old→new, and lint ONLY IF the leading frontmatter actually
#       CHANGES (FM-diff gate). Body-only edit → PASS (protects the 14 legacy
#       body code-lines AND closed v0.4 tickets carrying legacy qa_status the
#       edit doesn't touch — post-impl GRILL fix B). file_path unreadable / new
#       file mid-creation / old_string absent → PASS (cardinal: ambiguous→PASS).
#   With the slice in place, type is now a real BLOCK on both channels (Bash arm
#   keeps the shell-expansion `type: $X` bail → PASS). status/qa_status/version
#   behaviour is unchanged (they now also run over the slice on Write/Edit).

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

# ── Frontmatter slicer (T-PATCH-237) ─────────────────────────────────────────
# Echo ONLY the leading `---`…`---` frontmatter block of the given text. The
# opening `---` MUST be content line 1 (content[0:3]=='---' after an optional
# trailing \r); the slice runs up to (and excluding) the next line that is exactly
# `---`. No leading `---` on line 1 → echoes EMPTY (caller treats empty slice as
# PASS). A body markdown `---` rule on a later line can therefore never start a
# slice. CRLF tolerant. Decision (documented): a leading BLANK line before the
# line-1 `---` means there is NO frontmatter at line 1 → empty slice → PASS
# (matches YAML: frontmatter must be the very first line).
slice_frontmatter() {
  python3 -c '
import sys
t = sys.stdin.read()
lines = t.split("\n")
def norm(s): return s[:-1] if s.endswith("\r") else s
if not lines or norm(lines[0]) != "---":
    sys.exit(0)
out = ["---"]
for ln in lines[1:]:
    if norm(ln) == "---":
        out.append("---")
        break
    out.append(ln)
sys.stdout.write("\n".join(out))
' 2>/dev/null
}

# Read the on-disk leading frontmatter slice of a file (Edit channel). Empty if
# the file is unreadable/absent or has no line-1 `---` → caller treats as PASS.
slice_frontmatter_file() {
  local file="$1"
  [ -f "$file" ] || { printf ''; return 0; }
  slice_frontmatter < "$file"
}

# ── Edit FM-diff gate (T-PATCH-237 / GRILL fix B) ─────────────────────────────
# An Edit must only be linted if it actually CHANGES the leading frontmatter — a
# body-only edit to a closed ticket must never block on legacy frontmatter it
# does not touch (e.g. v0.4 legacy qa_status). Given the on-disk file, old_string
# and new_string, this echoes one of three tokens on the FIRST line:
#   PASS_NOOP     — FM unchanged by the edit → caller PASSes without linting.
#   PASS_AMBIG    — old_string absent / not-applicable → bias to PASS (noted).
#   LINT          — FM changed → caller lints the post-edit FM SLICE, which is
#                   emitted on the lines AFTER the token.
# UTF-8/Korean safe: pure python3 str.replace (NO awk/sed). Mirrors the Edit
# tool's semantics: replace_all=false → first occurrence only; replace_all=true →
# all occurrences. An empty old_string is treated as ambiguous → PASS.
edit_fm_gate() {
  local file="$1"
  python3 -c '
import sys
file, old, new, replace_all = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
try:
    with open(file, encoding="utf-8") as f:
        content = f.read()
except Exception:
    print("PASS_AMBIG"); sys.exit(0)

def slice_fm(t):
    lines = t.split("\n")
    def norm(s): return s[:-1] if s.endswith("\r") else s
    if not lines or norm(lines[0]) != "---":
        return ""
    out = ["---"]
    for ln in lines[1:]:
        if norm(ln) == "---":
            out.append("---"); break
        out.append(ln)
    return "\n".join(out)

if old == "" or old not in content:
    # absent / not-applicable: cannot reason about the post-edit state → PASS.
    print("PASS_AMBIG"); sys.exit(0)
if replace_all == "true":
    after = content.replace(old, new)
else:
    after = content.replace(old, new, 1)

fm_before = slice_fm(content)
fm_after  = slice_fm(after)
if fm_before == fm_after:
    print("PASS_NOOP"); sys.exit(0)
print("LINT")
sys.stdout.write(fm_after)
' "$file" "$2" "$3" "$4" 2>/dev/null
}

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

# ── type validate (BLOCKING — T-PATCH-237) ───────────────────────────────────
# T-PATCH-224/233 history: type was WARN-only because `extract_val type` matched
# `^[[:space:]]*type:` (any indent), which false-blocked INDENTED BODY code lines
# (TS `type: 'feature' | 'fix'` examples) when run over the whole text.
# T-PATCH-237 fixes the ROOT cause — callers now feed a frontmatter SLICE, so the
# anchor only ever sees real frontmatter lines. With that in place type is a real
# BLOCK (emit_block, return 2), parity with status/qa_status/version.
validate_type() {
  local text="$1" val
  val="$(extract_val type "$text")"
  [ -z "$val" ] && return 0
  if ! printf '%s' "$val" | grep -qE "^(${TYPE_ENUM})\$"; then
    VIOLATION_VAL="$val"
    return 2
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
  # version regex (BLOCKING) + type (BLOCKING — T-PATCH-237, was WARN).
  if ! validate_version "$text"; then
    printf '[frontmatter-lint] version: "%s" does not match the canonical version pattern.\n' "$VIOLATION_VAL" >&2
    printf '  required: vN(.N)?(-suffix)?  e.g. v0.5, v1, v2.3-beta  (ticket-schema.md §version)\n' >&2
    printf '  exception: archive ids with legacy: true, or a legacy/... id.\n' >&2
    return 2
  fi
  if ! validate_type "$text"; then
    emit_block "type" "$VIOLATION_VAL" "$TYPE_ENUM"
    return 2
  fi
  return 0
}

# ════════════════════════════════════════════════════════════════════════════
# Channel: Write / Edit
# ════════════════════════════════════════════════════════════════════════════
if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" ]]; then
  RAW_FILE_PATH="$(read_json file_path)"   # T-PATCH-237: keep verbatim for disk read
  FILE_PATH="$RAW_FILE_PATH"
  FILE_PATH="${FILE_PATH#./}"
  FILE_PATH="${FILE_PATH#/}"
  # Match BOTH relative (`docs/tickets/...`) and absolute (`Users/.../docs/tickets/...`)
  # paths. The Write tool ALWAYS passes an absolute path, so the bare
  # `docs/tickets/*` glob silently missed every Write/Edit and the guard never
  # fired on the primary write path (T-PATCH-208: pending/backlog drift). The
  # `*/docs/tickets/*` arm covers absolute paths after the leading `/` strip.
  [[ "$FILE_PATH" == docs/tickets/*/T-*.md || "$FILE_PATH" == */docs/tickets/*/T-*.md ]] || exit 0

  # T-PATCH-237: lint a FRONTMATTER SLICE, never the raw content/snippet.
  if [[ "$TOOL_NAME" == "Write" ]]; then
    # Write — slice the proposed content's own line-1 `---`…`---` block.
    RAW="$(read_json content)"
    SLICE="$(printf '%s' "$RAW" | slice_frontmatter)"
    # Empty slice (no line-1 frontmatter) → PASS.
    [ -z "$SLICE" ] && exit 0
    lint_text "$SLICE" || exit 2
    exit 0
  fi

  # Edit — FM-DIFF GATE (GRILL fix B). The snippet's own `---` is NEVER read as a
  # delimiter. We compute the on-disk frontmatter BEFORE and AFTER applying the
  # edit; only if the leading frontmatter actually CHANGES do we lint the result.
  # A body-only edit (FM unchanged) PASSes WITHOUT validation — so a closed ticket
  # carrying legacy frontmatter (e.g. v0.4 qa_status) is never blocked on fields
  # the edit doesn't touch. Editing a frontmatter type/qa_status/version to a bad
  # value still changes the FM → linted → BLOCK.
  OLD_STRING="$(read_json old_string)"
  NEW_STRING="$(read_json new_string)"
  REPLACE_ALL="$(read_json replace_all)"
  case "$REPLACE_ALL" in True|true|1) REPLACE_ALL="true" ;; *) REPLACE_ALL="false" ;; esac
  GATE="$(edit_fm_gate "$RAW_FILE_PATH" "$OLD_STRING" "$NEW_STRING" "$REPLACE_ALL")"
  TOKEN="$(printf '%s' "$GATE" | head -1)"
  case "$TOKEN" in
    PASS_NOOP|PASS_AMBIG|"")
      # FM unchanged, or old_string absent/unreadable target (cardinal: ambiguous
      # → PASS). PASS_AMBIG is the noted old_string-not-found / unreadable case.
      exit 0
      ;;
    LINT)
      # FM changed — lint the POST-EDIT frontmatter slice (everything after the
      # token line).
      SLICE="$(printf '%s' "$GATE" | tail -n +2)"
      [ -z "$SLICE" ] && exit 0
      lint_text "$SLICE" || exit 2
      exit 0
      ;;
    *)
      exit 0   # unknown token → cardinal PASS
      ;;
  esac
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
  # NOTE (T-PATCH-234): this arm no longer `exit 0`s when there are no status
  # candidates — it just skips its own loop. Control falls through to the
  # version/type checks below, which run independently (a command may write a
  # bad `version:` with no `status:` at all). Shell expansion around a status
  # token is still treated as ambiguous → status loop skipped (not a block).
  CANDIDATES="$(printf '%s' "$CMD" | grep -oE '(qa_)?status:[[:space:]]*[A-Za-z0-9_-]+' || true)"
  if [ -n "$CANDIDATES" ] && ! printf '%s' "$CMD" | grep -qE '(qa_)?status:[[:space:]]*(\$|`)'; then
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
  fi

  # ── T-PATCH-234: version regex BLOCK + type WARN (Write/Edit channel parity) ──
  # Same CONSERVATIVE literal-only philosophy as status/qa_status above: only
  # inspect PLAIN-LITERAL values; any shell expansion ($/`) around the token →
  # ambiguous → PASS (PostToolUse verify is the safety net). Cardinal rule:
  # over-blocking a valid write is a hard outage; when in doubt, PASS.

  # version (BLOCKING) — parity with Write/Edit `validate_version`.
  #
  # MF-1 FIX (T-PATCH-234 re-arm): the version candidate char-class must include
  # `.` and `/` (to accept `v0.5` / `legacy/old`), unlike the status arm's
  # `[A-Za-z0-9_-]`. That makes a RAW grep over the command poison-prone in sed
  # substitution syntax — `s/^version:.*/version: v0.5/` extracts the SEARCH-half
  # token `version:.` (value `.`), and a trailing delimiter is captured as
  # `version: v0.5/`. Both are sed SYNTAX artifacts, not real frontmatter values.
  #
  # Cardinal rule: a value sitting inside sed substitution syntax is AMBIGUOUS
  # (sed targets arbitrary lines, the token may interact with regex/backrefs) →
  # PASS (PostToolUse verify is the safety net). So we STRIP whole sed
  # substitution constructs — `s/.../.../flags` and `s|...|...|flags` — from the
  # command BEFORE scanning. This removes BOTH poison vectors (search-half +
  # trailing delimiter) while leaving heredoc/printf/echo BODY candidates — the
  # forms the true-positive tests rely on — fully intact for inspection.
  _CMD_SCAN="$(printf '%s' "$CMD" \
    | sed -E 's#s/[^/]*/[^/]*/[a-zA-Z0-9]*##g' \
    | sed -E 's#s\|[^|]*\|[^|]*\|[a-zA-Z0-9]*##g')"
  V_CANDIDATES="$(printf '%s' "$_CMD_SCAN" | grep -oE 'version:[[:space:]]*[A-Za-z0-9_./-]+' || true)"
  if [ -n "$V_CANDIDATES" ]; then
    # Bail (ambiguous) if a version token is immediately followed by $/backtick.
    if ! printf '%s' "$_CMD_SCAN" | grep -qE 'version:[[:space:]]*(\$|`)'; then
      # legacy exception parity: explicit `legacy: true` literal in the command
      # text, or a `legacy/...` version value → skip the regex.
      # legacy: true boundary — on the Bash channel the "text" is the command
      # STRING, where a frontmatter newline is often the escape `\n` (printf
      # body), so `true` may be followed by `\`, `"`, `'`, space, or EOL rather
      # than a real newline. Accept any non-word boundary after `true` (parity
      # intent with the Write/Edit `([[:space:]]|$)` anchor on real content).
      _legacy_line=0
      printf '%s' "$_CMD_SCAN" | grep -qE 'legacy:[[:space:]]*true([^[:alnum:]_]|$)' && _legacy_line=1
      while IFS= read -r vcand; do
        [ -z "$vcand" ] && continue
        vval="$(printf '%s' "$vcand" | sed -E 's/^version:[[:space:]]*//')"
        [ "$_legacy_line" = "1" ] && continue
        # legacy exception parity (Write/Edit `validate_version`): a `legacy/...`
        # version value skips the regex. (The blanket `*/*` skip was removed —
        # T-PATCH-234 F-1: it false-negatived genuinely-bad slash values like
        # `v99/x`/`foo/bar` that the Write/Edit channel correctly BLOCKs. The
        # `_CMD_SCAN` sed-substitution strip already removes the delimiter-residue
        # poison vectors, so the broad skip was redundant.)
        case "$vval" in legacy/*) continue ;; esac
        if ! printf '%s' "$vval" | grep -qE "$VERSION_REGEX"; then
          printf '[frontmatter-lint] Bash command would write version: "%s" (non-canonical) into a ticket file.\n' "$vval" >&2
          printf '  required: vN(.N)?(-suffix)?  e.g. v0.5, v1, v2.3-beta  (ticket-schema.md §version)\n' >&2
          printf '  exception: archive ids with legacy: true, or a legacy/... id.\n' >&2
          exit 2
        fi
      done <<< "$V_CANDIDATES"
    fi
  fi

  # type (BLOCKING — T-PATCH-237, was WARN) — parity with the Write/Edit
  # `validate_type` flip. Same CONSERVATIVE literal-only philosophy as the
  # status/version arms: only inspect PLAIN-LITERAL type values; any shell
  # expansion (`type: $X` / backtick) around the token → AMBIGUOUS → PASS
  # (PostToolUse verify is the safety net). The expansion bail is what keeps this
  # safe: a heredoc/sed writing a literal `type: bogus` BLOCKs, but a computed
  # `type: $X` passes. Cardinal rule: over-blocking a valid write is a hard
  # outage. Rationale for promoting to BLOCK: post-ticket-status-verify checks
  # ONLY status/qa_status (NOT type), so a WARN here leaves bad type values with
  # no real gate — the Bash channel must be a true BLOCK to match Write/Edit.
  T_CANDIDATES="$(printf '%s' "$CMD" | grep -oE '(^|[^_[:alnum:]])type:[[:space:]]*[A-Za-z0-9_-]+' | sed -E 's/^[^t]*type:/type:/' || true)"
  if [ -n "$T_CANDIDATES" ]; then
    if ! printf '%s' "$CMD" | grep -qE '(^|[^_[:alnum:]])type:[[:space:]]*(\$|`)'; then
      while IFS= read -r tcand; do
        [ -z "$tcand" ] && continue
        tval="$(printf '%s' "$tcand" | sed -E 's/^type:[[:space:]]*//')"
        if ! printf '%s' "$tval" | grep -qE "^(${TYPE_ENUM})\$"; then
          printf '[frontmatter-lint] Bash command would write type: "%s" (non-canonical) into a ticket file.\n' "$tval" >&2
          printf '  canonical: %s\n' "$(printf '%s' "$TYPE_ENUM" | tr '|' ' ' | sed 's/  */ | /g')" >&2
          printf '  Use a canonical ticket type. SoT: ticket-schema.md §"9 ticket types".\n' >&2
          exit 2
        fi
      done <<< "$T_CANDIDATES"
    fi
  fi

  exit 0
fi

exit 0
