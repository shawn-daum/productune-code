#!/usr/bin/env bash
# Claude Code statusLine — productune-aware single line.
# Receives a JSON event on stdin (workspace.current_dir, model.id, transcript_path, ...)
# and prints a single line with: git branch · active persona · ticket.
#
# Designed to be cheap (no network calls).
# Falls back gracefully when fields are missing.

set +e

INPUT="$(cat 2>/dev/null || true)"

json_get() {
  local path="$1"
  printf '%s' "$INPUT" | python3 -c "import json,sys
try:
    data=json.loads(sys.stdin.read())
    val=data
    for k in '$path'.split('.'):
        if isinstance(val,dict):
            val=val.get(k)
        else:
            val=None
        if val is None: break
    print(val if val is not None else '')
except Exception:
    print('')
" 2>/dev/null
}

CWD="$(json_get workspace.current_dir)"
[ -z "$CWD" ] && CWD="$PWD"

# Branch (cheap)
# Note: `git rev-parse --abbrev-ref HEAD` writes the literal string "HEAD"
# to stdout *and* errors to stderr in two cases:
#   - detached HEAD       (verifiable: git rev-parse --verify HEAD succeeds)
#   - unborn HEAD         (no commits yet — git rev-parse --verify HEAD fails)
# Distinguish them so a freshly `git init`-ed repo doesn't show a meaningless
# "[HEAD]" badge.
BRANCH=""
if [ -d "$CWD/.git" ] || git -C "$CWD" rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH="$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  if [ "$BRANCH" = "HEAD" ]; then
    if git -C "$CWD" rev-parse --verify --quiet HEAD >/dev/null 2>&1; then
      # Real detached HEAD — show short SHA instead of the literal "HEAD".
      BRANCH="@$(git -C "$CWD" rev-parse --short HEAD 2>/dev/null)"
    else
      # Unborn HEAD (no commits). Show the would-be initial branch name when
      # the user has init.defaultBranch set; otherwise indicate empty repo.
      INIT_BRANCH="$(git -C "$CWD" config --get init.defaultBranch 2>/dev/null)"
      BRANCH="${INIT_BRANCH:+$INIT_BRANCH:}empty"
    fi
  fi
fi

# po-state.json — last-acting persona + active ticket/slug
STATE="$CWD/.productune/po-state.json"
PERSONA=""
TICKET=""
if [ -f "$STATE" ] && command -v jq >/dev/null 2>&1; then
  TICKET=$(jq -r '.current_task.ticket_id // .current_task.slug // ""' "$STATE" 2>/dev/null)
  PERSONA=$(jq -r '(.recent_turns | last | .persona) // ""' "$STATE" 2>/dev/null)
fi

# Compose: [branch] persona · ticket
parts=()
[ -n "$BRANCH" ] && parts+=("[branch: $BRANCH]")

# Print single line; if nothing detected, print a hint.
if [ "${#parts[@]}" -eq 0 ]; then
  printf 'productune'
else
  printf '%s' "${parts[*]}"
fi
