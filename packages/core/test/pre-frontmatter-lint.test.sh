#!/usr/bin/env bash
# Regression test for pre-frontmatter-lint.sh (T-PATCH-138).
# Injects fixture PreToolUse/Bash JSON events on stdin and asserts exit codes.
#   exit 2 = BLOCK, exit 0 = PASS.
#
# Run: bash packages/core/test/pre-frontmatter-lint.test.sh
#
# Note: enum is loaded from ~/.productune/config/ticket-status-enum.json if
# present, else the in-hook fallback. Both are kept in parity, so results match.

set -u
HOOK="$(cd "$(dirname "$0")/../scripts/hooks" && pwd)/pre-frontmatter-lint.sh"
PASS=0; FAIL=0

# event_status <tool> <field-json> ... helper builds JSON and runs the hook.
run() {
  # $1 = description, $2 = expected exit (0|2), $3 = JSON event
  local desc="$1" expect="$2" json="$3" got
  printf '%s' "$json" | bash "$HOOK" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$expect" ]; then
    printf 'PASS  [exit %s] %s\n' "$got" "$desc"
    PASS=$((PASS+1))
  else
    printf 'FAIL  [exit %s, want %s] %s\n' "$got" "$expect" "$desc"
    FAIL=$((FAIL+1))
  fi
}

# JSON-encode an arbitrary string via python for fixture bodies.
j() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }

TICKET="docs/tickets/v0.5/T-999.md"

# 1) canonical PASS — Write full file with status: in-progress
run "canonical status: in-progress (Write) → PASS" 0 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Write","tool_input":{
  "file_path":sys.argv[1],
  "content":"---\nticket_id: T-999\nstatus: in-progress\nqa_status: pending\n---\n# body\n"}}))
PY
)"

# 2) in_progress (snake) BLOCK — Write
run "status: in_progress (Write) → BLOCK" 2 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Write","tool_input":{
  "file_path":sys.argv[1],"content":"---\nstatus: in_progress\n---\n"}}))
PY
)"

# 2b) qa-as-status BLOCK — Write
run "status: qa (Write) → BLOCK" 2 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Write","tool_input":{
  "file_path":sys.argv[1],"content":"---\nstatus: qa\n---\n"}}))
PY
)"

# NOTE (T-PATCH-237 + GRILL fix B): the Edit channel uses an FM-DIFF GATE. It
# reads the target file from disk, applies old_string→new_string, and lints ONLY
# IF the leading frontmatter slice CHANGES. A body-only edit (FM unchanged) PASSes
# without validation — so a closed ticket carrying legacy FM is never blocked on
# fields the edit doesn't touch. The parser (indent / inline-# / quotes) is still
# exercised here, but now by an edit that WRITES the value into the FM. (Write &
# Bash channels keep exercising the same parser directly.)
#
# Fixture helpers — write a frontmatter+body file and emit an Edit event for it.
FIXDIR="$(mktemp -d)"
trap 'rm -rf "$FIXDIR"' EXIT
mkfix() {
  # $1 = subpath under docs/tickets/, $2 = full file content → echoes abs path
  local p="$FIXDIR/docs/tickets/$1"
  mkdir -p "$(dirname "$p")"
  printf '%s' "$2" > "$p"
  printf '%s' "$p"
}
edit_event() {
  # $1 = abs file_path, $2 = old_string, $3 = new_string → echoes JSON Edit event
  python3 -c 'import json,sys; print(json.dumps({"tool_name":"Edit","tool_input":{"file_path":sys.argv[1],"old_string":sys.argv[2],"new_string":sys.argv[3]}}))' "$1" "$2" "$3"
}

# All fixtures below start with a CANON status line in FM; the Edit rewrites that
# FM line to the value under test → FM changes → the gate lints the result.

# 3) Edit rewrites FM status → indented bad status → BLOCK
F3="$(mkfix v0.5/T-fix3.md "$(printf -- '---\nstatus: todo\n---\n# body\n')")"
run "Edit→FM indented status: in_progress → BLOCK" 2 \
  "$(edit_event "$F3" "status: todo" "  status: in_progress")"

# 3b) Edit rewrites FM status → indented canonical → PASS
F3b="$(mkfix v0.5/T-fix3b.md "$(printf -- '---\nstatus: todo\n---\n# body\n')")"
run "Edit→FM indented status: review → PASS" 0 \
  "$(edit_event "$F3b" "status: todo" "  status: review")"

# 4) Edit rewrites FM status → inline-# comment after a canonical value → PASS
F4="$(mkfix v0.5/T-fix4.md "$(printf -- '---\nstatus: todo\n---\n')")"
run "Edit→FM status: done  # comment → PASS" 0 \
  "$(edit_event "$F4" "status: todo" "status: done   # asset complete")"

# 4b) Edit rewrites FM status → inline-# hiding a bad value still BLOCKs
F4b="$(mkfix v0.5/T-fix4b.md "$(printf -- '---\nstatus: todo\n---\n')")"
run "Edit→FM status: in_progress # note → BLOCK" 2 \
  "$(edit_event "$F4b" "status: todo" "status: in_progress  # note")"

# 5) Edit rewrites FM status → quoted values → PASS
F5="$(mkfix v0.5/T-fix5.md "$(printf -- '---\nstatus: todo\n---\n')")"
run "Edit→FM status: \"review\" (quoted) → PASS" 0 "$(edit_event "$F5" "status: todo" 'status: "review"')"
F5s="$(mkfix v0.5/T-fix5s.md "$(printf -- '---\nstatus: todo\n---\n')")"
run "Edit→FM status: 'done' (single-quoted) → PASS" 0 "$(edit_event "$F5s" "status: todo" "status: 'done'")"

# 5b) Edit rewrites FM status → quoted value + trailing inline comment → PASS
F5b="$(mkfix v0.5/T-fix5b.md "$(printf -- '---\nstatus: todo\n---\n')")"
run "Edit→FM status: \"review\"  # comment → PASS" 0 "$(edit_event "$F5b" "status: todo" 'status: "review"   # ship it')"

# 5c) Edit rewrites FM status → inner-# inside quotes is DATA → non-canonical → BLOCK
F5c="$(mkfix v0.5/T-fix5c.md "$(printf -- '---\nstatus: todo\n---\n')")"
run "Edit→FM status: \"a # b\" (inner-hash) → BLOCK" 2 "$(edit_event "$F5c" "status: todo" 'status: "a # b"')"

# 6) Bash sed injecting non-canonical → BLOCK
run "Bash sed -i status: in_progress → BLOCK" 2 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Bash","tool_input":{
  "command":"sed -i '' 's/status: todo/status: in_progress/' "+sys.argv[1]}}))
PY
)"

# 6b) Bash sed injecting canonical → PASS
run "Bash sed -i status: in-progress → PASS" 0 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Bash","tool_input":{
  "command":"sed -i '' 's/status: todo/status: in-progress/' "+sys.argv[1]}}))
PY
)"

# 6c) Bash heredoc writing non-canonical → BLOCK
run "Bash heredoc status: qa → BLOCK" 2 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Bash","tool_input":{
  "command":"cat > "+sys.argv[1]+" <<EOF\nstatus: qa\nEOF"}}))
PY
)"

# 7) Bash AMBIGUOUS (variable-interpolated value) → PASS (no over-block)
run "Bash status: \$NEW (variable) → PASS" 0 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Bash","tool_input":{
  "command":"sed -i '' \"s/status: todo/status: $NEW/\" "+sys.argv[1]}}))
PY
)"

# 7b) Bash referencing a ticket but not writing status → PASS
run "Bash cat ticket (read-only) → PASS" 0 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Bash","tool_input":{
  "command":"cat "+sys.argv[1]}}))
PY
)"

# 8) non-ticket path PASS across channels
run "Write non-ticket .md with status: in_progress → PASS" 0 \
  "$(python3 <<'PY'
import json
print(json.dumps({"tool_name":"Write","tool_input":{
  "file_path":"docs/notes/scratch.md","content":"status: in_progress\n"}}))
PY
)"
run "Bash sed on non-ticket file status: in_progress → PASS" 0 \
  "$(python3 <<'PY'
import json
print(json.dumps({"tool_name":"Bash","tool_input":{
  "command":"sed -i '' 's/x/status: in_progress/' README.md"}}))
PY
)"

# 9) qa_status enum still enforced
run "qa_status: bogus (Write) → BLOCK" 2 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Write","tool_input":{
  "file_path":sys.argv[1],"content":"---\nstatus: done\nqa_status: bogus\n---\n"}}))
PY
)"

# ════════════════════════════════════════════════════════════════════════════
# T-PATCH-237 — frontmatter-scope extraction + type WARN→BLOCK flip
# ════════════════════════════════════════════════════════════════════════════
echo "── T-PATCH-237 frontmatter-scope + type-BLOCK ──"
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"   # repo root for real-corpus refs

write_event() {
  # $1 = file_path, $2 = content → JSON Write event
  python3 -c 'import json,sys; print(json.dumps({"tool_name":"Write","tool_input":{"file_path":sys.argv[1],"content":sys.argv[2]}}))' "$1" "$2"
}
bash_event() {
  python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$1"
}

# ── AXIS-1 TRAP (the case that decides the Edit rule) ─────────────────────────
# Edit new_string = a BODY `---` markdown horizontal rule followed by
# `type: feature` code. The edit touches BODY only, so FM is unchanged → the
# FM-diff gate PASSes (the snippet `---`/`type:` must NEVER be read as FM).
FTRAP="$(mkfix v0.5/T-trap.md "$(printf -- '---\ntype: impl\nstatus: in-progress\nqa_status: pending\n---\n# body\nORIGINAL\n')")"
run "AXIS-1: Edit body '---' + 'type: feature' code → PASS" 0 \
  "$(edit_event "$FTRAP" "ORIGINAL" "$(printf -- 'some prose\n---\ntype: feature\nmore prose')")"

# ── GRILL fix B regression-closer: body no-op Edit on EVERY v0.4 legacy file ──
# A body-only edit (FM unchanged) to a closed ticket carrying legacy qa_status
# MUST be rc0 — it must NOT block on FM it doesn't touch. We exercise the real
# v0.4 corpus: for each file we craft a body edit (old_string = a real body
# substring AFTER the frontmatter close, new_string = same+marker) so the FM is
# provably unchanged, and assert rc0. This is the count that must equal HEAD
# (HEAD blocked 0 on Edit). The 9 enumerated body-code-line tickets are a subset.
declare -a BODYLINES=(
  "v0.4/T-P4-020.md" "v0.4/T-P4-044.md" "v0.4/T-P4-116.md" "v0.4/T-P4-046.md"
  "v0.4/T-P4-023.md" "v0.4/T-P4-119.md" "v0.4/T-P4-112.md"
  "v0.5/T-PATCH-166.md" "v0.5/T-PATCH-086.md"
)
# body_noop_event: find a real body substring (first non-empty line after the FM
# close) and emit an Edit that rewrites it to itself+marker (FM provably intact).
body_noop_event() {
  python3 -c '
import json,sys
f=sys.argv[1]
t=open(f,encoding="utf-8").read()
lines=t.split("\n")
def norm(s): return s[:-1] if s.endswith("\r") else s
# locate end of leading frontmatter
i=0; body_start=0
if lines and norm(lines[0])=="---":
    for j in range(1,len(lines)):
        if norm(lines[j])=="---":
            body_start=j+1; break
old=None
for ln in lines[body_start:]:
    if ln.strip():
        old=ln; break
if old is None:
    old=""   # no body → ambiguous (old absent) → still PASS by gate
print(json.dumps({"tool_name":"Edit","tool_input":{
  "file_path":f,"old_string":old,"new_string":old+"  <!--noop-->"}}))
' "$1"
}
for rel in "${BODYLINES[@]}"; do
  tgt="$REPO/docs/tickets/$rel"
  if [ -f "$tgt" ]; then
    run "BODY-NOOP: Edit body of $rel (FM untouched) → PASS" 0 \
      "$(body_noop_event "$tgt")"
  else
    printf 'SKIP  (missing fixture) %s\n' "$rel"
  fi
done

# ── Write: full ticket frontmatter, type enum BLOCKING ───────────────────────
run "Write: type: feature (non-canon) → BLOCK" 2 \
  "$(write_event "$TICKET" "$(printf -- '---\nticket_id: T-999\ntype: feature\nstatus: in-progress\nqa_status: pending\n---\n# body\n')")"
run "Write: type: impl (canon) → PASS" 0 \
  "$(write_event "$TICKET" "$(printf -- '---\nticket_id: T-999\ntype: impl\nstatus: in-progress\nqa_status: pending\n---\n# body\n')")"

# ── Write: body type: code AFTER frontmatter must NOT trigger (slice stops at close) ─
run "Write: canon fm + body 'type: feature' code → PASS" 0 \
  "$(write_event "$TICKET" "$(printf -- '---\ntype: impl\nstatus: done\nqa_status: pass\n---\n# body\ntype: feature // code example\n')")"

# ── Edit that CHANGES FM type: legacy→bad → BLOCK; →canon → PASS ─────────────
FET="$(mkfix v0.5/T-et.md "$(printf -- '---\ntype: impl\nstatus: done\nqa_status: pass\n---\n# b\n')")"
run "Edit→FM type: impl→feature (bad) → BLOCK" 2 \
  "$(edit_event "$FET" "type: impl" "type: feature")"
FETc="$(mkfix v0.5/T-etc.md "$(printf -- '---\ntype: impl\nstatus: done\nqa_status: pass\n---\n# b\n')")"
run "Edit→FM type: impl→refactor (canon) → PASS" 0 \
  "$(edit_event "$FETc" "type: impl" "type: refactor")"

# ── Edit that CHANGES FM qa_status: →bad → BLOCK; body edit leaving legacy
#    qa_status untouched → PASS (the core GRILL-B distinction) ────────────────
FQ="$(mkfix v0.5/T-q.md "$(printf -- '---\ntype: impl\nstatus: done\nqa_status: pass\n---\n# b\n')")"
run "Edit→FM qa_status: pass→bogus → BLOCK" 2 \
  "$(edit_event "$FQ" "qa_status: pass" "qa_status: bogus")"
# legacy qa_status on disk, edit touches BODY only → PASS (no block on legacy FM)
FQL="$(mkfix v0.5/T-ql.md "$(printf -- '---\ntype: impl\nstatus: done\nqa_status: ready\n---\n# body line\n')")"
run "Edit: body edit, legacy qa_status untouched → PASS" 0 \
  "$(edit_event "$FQL" "# body line" "# body line edited")"

# ── Edit changing FM canon→canon → PASS ──────────────────────────────────────
FCC="$(mkfix v0.5/T-cc.md "$(printf -- '---\ntype: impl\nstatus: todo\nqa_status: pending\n---\n# b\n')")"
run "Edit→FM status: todo→done (canon→canon) → PASS" 0 \
  "$(edit_event "$FCC" "status: todo" "status: done")"

# ── Edit: old_string NOT FOUND in on-disk content → PASS (noted, biased) ─────
FNF="$(mkfix v0.5/T-nf.md "$(printf -- '---\ntype: impl\nstatus: todo\nqa_status: pending\n---\n# b\n')")"
run "Edit: old_string not found → PASS (ambiguous)" 0 \
  "$(edit_event "$FNF" "status: NONEXISTENT" "status: in_progress")"

# ── Edit: file_path unreadable (new file mid-creation) → PASS (cardinal) ─────
run "Edit: nonexistent target file → PASS" 0 \
  "$(edit_event "$FIXDIR/docs/tickets/v0.5/T-nope.md" "old" "  type: feature")"

# ── Bash: heredoc / sed writing literal bad type → BLOCK; expanded → PASS ─────
run "Bash heredoc type: bogus → BLOCK" 2 \
  "$(bash_event "cat > $TICKET <<EOF
type: bogus
EOF")"
run "Bash sed type: feature literal → BLOCK" 2 \
  "$(bash_event "sed -i '' 's/type: impl/type: feature/' $TICKET")"
run "Bash type: \$X (shell-expansion) → PASS" 0 \
  "$(bash_event "printf 'type: %s\\n' \"\$X\" > $TICKET")"
run "Bash heredoc type: impl (canon) → PASS" 0 \
  "$(bash_event "cat > $TICKET <<EOF
type: impl
EOF")"

# ── EDGE: CRLF line endings (Write) — bad type still BLOCKs ───────────────────
run "Write: CRLF frontmatter bad type → BLOCK" 2 \
  "$(write_event "$TICKET" "$(printf -- '---\r\ntype: feature\r\nstatus: done\r\nqa_status: pass\r\n---\r\n')")"
run "Write: CRLF frontmatter canon → PASS" 0 \
  "$(write_event "$TICKET" "$(printf -- '---\r\ntype: impl\r\nstatus: done\r\nqa_status: pass\r\n---\r\n')")"

# ── EDGE: leading blank line before line-1 '---' → NO frontmatter → PASS ──────
# (documented decision: frontmatter must be the very first line; a leading blank
#  means there is no line-1 block, so the slice is empty and we PASS.)
run "Write: leading blank line then bad type → PASS (no fm at line 1)" 0 \
  "$(write_event "$TICKET" "$(printf -- '\n---\ntype: feature\nstatus: done\n---\n')")"

# ── EDGE: multi-doc / body '---' after frontmatter — only first block sliced ──
run "Write: fm close then second '---type:bad' block → PASS (only first sliced)" 0 \
  "$(write_event "$TICKET" "$(printf -- '---\ntype: impl\nstatus: done\nqa_status: pass\n---\n# body\n---\ntype: feature\n---\n')")"

# ── EDGE: no frontmatter at all (Write) → PASS ───────────────────────────────
run "Write: no '---' block at all → PASS" 0 \
  "$(write_event "$TICKET" "$(printf -- '# just a body\ntype: feature\n')")"

echo "─────────────────────────────────────"
printf 'TOTAL: %s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ] || exit 1
