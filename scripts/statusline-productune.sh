#!/usr/bin/env bash
# Claude Code statusLine — productune-aware single line.
# Receives a JSON event on stdin (workspace.current_dir, model.id, transcript_path, ...)
# and prints a single line with: git branch · active persona · ticket · wiki backend health.
#
# Designed to be cheap (no network calls except a 0.5s curl probe for graphiti).
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

# productune.env — wiki backend
ENV_FILE="$HOME/.productune/productune.env"
WIKI=""
if [ -f "$ENV_FILE" ]; then
  WIKI="$(grep -E '^WIKI_BACKEND=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '\r\n')"
fi

# Wiki health probe (very short timeout)
HEALTH=""
case "$WIKI" in
  graphiti)
    # Productune runs the Graphiti MCP server via stdio transport (spawned per
    # persona on demand) — there is no persistent HTTP listener on :8000.
    # The right liveness signal is FalkorDB's TCP port (6379), which is the
    # only piece that must be up at all times. /dev/tcp is a bash builtin —
    # no curl/nc dependency, and a local connect attempt returns immediately.
    if (exec 3<>/dev/tcp/localhost/6379) 2>/dev/null; then
      exec 3<&- 3>&-
      HEALTH="✓"
    else
      HEALTH="✗"
    fi
    ;;
  keeper)
    HEALTH="·"
    ;;
  fs)
    [ -d "$HOME/.productune/wiki" ] && HEALTH="✓" || HEALTH="-"
    ;;
esac

# Compose: [branch] persona · ticket · wiki(health)
parts=()
[ -n "$BRANCH" ] && parts+=("[$BRANCH]")
[ -n "$PERSONA" ] && parts+=("👤$PERSONA")
[ -n "$TICKET" ] && parts+=("🎫$TICKET")
if [ -n "$WIKI" ]; then
  parts+=("📚$WIKI$HEALTH")
fi

# Print single line; if nothing detected, print a hint.
if [ "${#parts[@]}" -eq 0 ]; then
  printf 'productune'
else
  printf '%s' "${parts[*]}"
fi
