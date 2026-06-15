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

# 3) indented status BLOCK (gap①) — Edit new_string with leading spaces
run "indented '  status: in_progress' (Edit) → BLOCK" 2 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Edit","tool_input":{
  "file_path":sys.argv[1],"new_string":"  status: in_progress\n"}}))
PY
)"

# 3b) indented canonical PASS
run "indented '  status: review' (Edit) → PASS" 0 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Edit","tool_input":{
  "file_path":sys.argv[1],"new_string":"  status: review\n"}}))
PY
)"

# 4) inline-# comment PASS (T-PATCH-136 parity)
run "status: done   # asset complete (Edit) → PASS" 0 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Edit","tool_input":{
  "file_path":sys.argv[1],"new_string":"status: done   # asset complete\n"}}))
PY
)"

# 4b) inline-# comment hiding a bad value still BLOCKs
run "status: in_progress  # note (Edit) → BLOCK" 2 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Edit","tool_input":{
  "file_path":sys.argv[1],"new_string":"status: in_progress  # note\n"}}))
PY
)"

# 5) quoted value PASS
run "status: \"review\" (quoted) → PASS" 0 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Edit","tool_input":{
  "file_path":sys.argv[1],"new_string":"status: \"review\"\n"}}))
PY
)"
run "status: 'done' (single-quoted) → PASS" 0 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Edit","tool_input":{
  "file_path":sys.argv[1],"new_string":"status: 'done'\n"}}))
PY
)"

# 5b) F1 regression — quoted value + trailing inline comment (the UNION) → PASS
run "status: \"review\"   # comment (quoted+comment) → PASS" 0 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Edit","tool_input":{
  "file_path":sys.argv[1],"new_string":"status: \"review\"   # ship it\n"}}))
PY
)"
run "status: 'done' # x (single-quoted+comment) → PASS" 0 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Edit","tool_input":{
  "file_path":sys.argv[1],"new_string":"status: 'done' # x\n"}}))
PY
)"
# 5c) inner-# inside quotes is DATA, not a comment → value 'a # b' is
#     non-canonical → BLOCK (correct, for the RIGHT reason — not a parse artifact).
run "status: \"a # b\" (inner-hash preserved) → BLOCK" 2 \
  "$(python3 - "$TICKET" <<'PY'
import json,sys
print(json.dumps({"tool_name":"Edit","tool_input":{
  "file_path":sys.argv[1],"new_string":"status: \"a # b\"\n"}}))
PY
)"

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

echo "─────────────────────────────────────"
printf 'TOTAL: %s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ] || exit 1
