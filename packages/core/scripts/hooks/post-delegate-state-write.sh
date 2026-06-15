#!/usr/bin/env bash
# Claude Code hook — PostToolUse, matcher: Bash
# Detects when PO (or any caller) invokes `claude --agent pdt-<x>` or
# `claude --resume <uuid>`, then deterministically writes the resulting
# session_id into <project>/.productune/po-state.json. Without this hook,
# PO sometimes skips the mechanical state writes that doctrine requires
# (~/.productune/doctrine/persona/po/habit.md §Mechanical write whitelist).
#
# Silent on no-match. Prints a one-liner on successful update so PO and
# the user see what changed.

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

# Fast path — only act on Bash calls that involve the claude CLI for personas
COMMAND="$(printf '%s' "$EVENT_JSON" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null)"

# Match the real portable dispatch, not an adjacency glob. The documented form
# interposes flags between `claude` and `--agent`
#   (NO_COLOR=1 claude --add-dir ~/.productune -p --agent pdt-<persona> …),
# so the old `*"claude --agent pdt-"*` glob required `claude` ADJACENT to
# `--agent` and silently never fired. Require `claude` AND the flag token
# separately — same approach as pre-delegate-ctx-lang.sh.
case "$COMMAND" in
  *"claude"*"--agent pdt-"*) ;;
  *"claude"*"--resume "*)    ;;
  *) exit 0 ;;
esac

# Extract tool_response stdout (Claude Code may name it stdout|output)
STDOUT="$(printf '%s' "$EVENT_JSON" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    r = d.get('tool_response', {})
    print(r.get('stdout') or r.get('output') or '')
except Exception:
    print('')
" 2>/dev/null)"

[ -z "$STDOUT" ] && exit 0

# Pull .session_id from the response JSON (line-based — claude --print --output-format json
# emits a single JSON envelope; tolerate stray prefix/suffix lines)
SID="$(printf '%s' "$STDOUT" | python3 -c "
import json, re, sys
text = sys.stdin.read()
m = re.search(r'\{.*\}', text, re.DOTALL)
if not m:
    sys.exit(0)
try:
    d = json.loads(m.group())
    sid = d.get('session_id') or ''
    print(sid)
except Exception:
    print('')
" 2>/dev/null)"

# UUID validation (8-4-4-4-12 hex)
case "$SID" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-*) ;;
  *) exit 0 ;;
esac

# Persona name — from `--agent pdt-<name>` if present, else infer via existing po-state
PERSONA=""
if printf '%s' "$COMMAND" | grep -qE -- '--agent pdt-[a-z-]+'; then
  PERSONA="$(printf '%s' "$COMMAND" | sed -nE 's/.*--agent (pdt-[a-z-]+).*/\1/p' | head -1)"
fi

# Find the project's .productune/po-state.json — prefer event cwd, fall back to PWD walk-up
EVENT_CWD="$(printf '%s' "$EVENT_JSON" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('cwd') or '')
except Exception:
    print('')
" 2>/dev/null)"

find_po_state() {
  local d="${1:-$PWD}"
  while [ "$d" != "/" ] && [ -n "$d" ]; do
    [ -f "$d/.productune/po-state.json" ] && { echo "$d/.productune/po-state.json"; return 0; }
    [ -f "$d/.codex/po-state.json" ]      && { echo "$d/.codex/po-state.json";      return 0; }
    d="$(dirname "$d")"
  done
  return 1
}

STATE="$(find_po_state "$EVENT_CWD" || find_po_state "$PWD" || true)"
[ -z "$STATE" ] && exit 0

# Resolve persona from --resume <uuid> by reverse-lookup in existing persona_sessions
if [ -z "$PERSONA" ]; then
  RESUME_UUID="$(printf '%s' "$COMMAND" | sed -nE 's/.*--resume "?([0-9a-f-]+)"?.*/\1/p' | head -1)"
  if [ -n "$RESUME_UUID" ]; then
    PERSONA="$(jq -r --arg u "$RESUME_UUID" '
      (.current_task // {}) | (.persona_sessions // {}) | to_entries[] | select(.value == $u) | .key
    ' "$STATE" 2>/dev/null | head -1)"
  fi
fi

[ -z "$PERSONA" ] && exit 0

# Pull --model from command (best-effort — defaults to persona's frontmatter fallback)
MODEL="$(printf '%s' "$COMMAND" | sed -nE 's/.*--model[= ]([a-z]+).*/\1/p' | head -1)"
[ -z "$MODEL" ] && MODEL="default"

# Pull changed_files from response JSON (developer/qa report this)
CHANGED_FILES="$(printf '%s' "$STDOUT" | python3 -c "
import json, re, sys
text = sys.stdin.read()
m = re.search(r'\{.*\}', text, re.DOTALL)
if not m: sys.exit(0)
try:
    d = json.loads(m.group())
    inner = d.get('result', '')
    # result is itself a string that may contain JSON — try second-level parse
    inner_m = re.search(r'\{.*\}', inner, re.DOTALL)
    if inner_m:
        try:
            inner_d = json.loads(inner_m.group())
            files = inner_d.get('changed_files', [])
            print(json.dumps(files))
            sys.exit(0)
        except Exception: pass
    print('[]')
except Exception:
    print('[]')
" 2>/dev/null)"
[ -z "$CHANGED_FILES" ] && CHANGED_FILES='[]'

# Mechanical state write — capture session_id, set last_seen, merge recent_turns + artifacts
NOW="$(date -u +%FT%TZ)"
TMP="$(mktemp)"
jq --arg persona "$PERSONA" --arg sid "$SID" --arg now "$NOW" --arg model "$MODEL" --argjson files "$CHANGED_FILES" '
  .current_task = (
    .current_task // {
      slug: ("auto-" + ($now | gsub("[^0-9]"; "") | .[:14])),
      started_at: $now,
      request_summary: "(auto-opened by post-delegate hook)",
      artifacts: [],
      persona_sessions: {},
      persona_session_meta: {}
    }
  )
  | .current_task.persona_sessions[$persona] = $sid
  | .current_task.persona_session_meta[$persona] = (
      (.current_task.persona_session_meta[$persona] // {})
      + {id: $sid, last_seen: $now}
    )
  | .current_task.artifacts = (((.current_task.artifacts // []) + ($files | map(tostring))) | unique)
  | .recent_turns = (
      ((.recent_turns // []) + [{
        ts: $now,
        persona: $persona,
        session_id: $sid,
        task_slug: (.current_task.slug // "unknown"),
        model: $model,
        source: "post-delegate-hook"
      }])[-10:]
    )
' "$STATE" > "$TMP" 2>/dev/null

if [ -s "$TMP" ]; then
  mv "$TMP" "$STATE"
  SHORT_SID="$(echo "$SID" | cut -c1-8)"
  echo "[productune] state-write: persona=$PERSONA session=$SHORT_SID → $STATE"
else
  rm -f "$TMP"
fi

# ── T-027 (a)+(b)+(d): subagent token-cost capture → turns.jsonl ────────────────
# This hook receives its OWN full tool_response stdin copy, independent of
# post-bash-strip-cost.sh (which only transforms the user-surfaced output). So we
# capture raw usage HERE, before/regardless of strip — ordering-independent.
#
# Authority for model id = response `modelUsage` keys (NOT the --model flag, which
# is often "default"). usage / total_cost_usd come from the same JSON envelope.
# Graceful: any missing field → null; no field present → no append (no-op).
#
# version / ticket_id / task_slug come from po-state.json (same parsing the
# statusline reuses). turns.jsonl is a sibling of po-state.json (per-project local).
TURNS_FILE="$(dirname "$STATE")/turns.jsonl"

# Pull the subagent envelope's cost/usage/modelUsage. STDOUT holds the
# `claude -p --output-format json` envelope (possibly with stray prefix/suffix).
# A single python pass emits a ready-to-append JSON line, or nothing on no-data.
TURN_LINE="$(STATE_PATH="$STATE" PERSONA="$PERSONA" SID="$SID" \
  python3 - "$STDOUT" <<'PYEOF' 2>/dev/null
import json, os, re, sys

text = sys.argv[1] if len(sys.argv) > 1 else ''
m = re.search(r'\{.*\}', text, re.DOTALL)
if not m:
    sys.exit(0)
try:
    env = json.loads(m.group())
except Exception:
    sys.exit(0)

cost = env.get('total_cost_usd')
usage_raw = env.get('usage') if isinstance(env.get('usage'), dict) else {}
model_usage = env.get('modelUsage') if isinstance(env.get('modelUsage'), dict) else {}

# Authoritative model id = first modelUsage key (per AC-2). Fallback null.
model = None
if model_usage:
    model = next(iter(model_usage.keys()), None)

# Normalize the four token fields, tolerating absence.
def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None

usage = {
    'input_tokens': _int(usage_raw.get('input_tokens')),
    'output_tokens': _int(usage_raw.get('output_tokens')),
    'cache_creation_input_tokens': _int(usage_raw.get('cache_creation_input_tokens')),
    'cache_read_input_tokens': _int(usage_raw.get('cache_read_input_tokens')),
}

# No usable data at all → no-op (AC-7/AC-8 graceful: non-subscriber / stripped).
if cost is None and model is None and not any(v is not None for v in usage.values()):
    sys.exit(0)

# version / ticket_id / task_slug from po-state.json (same fields the statusline reads).
version = None
task_slug = None
ticket_id = None
try:
    with open(os.environ['STATE_PATH']) as f:
        st = json.load(f)
    cv = st.get('current_version', '')
    version = cv.get('id') if isinstance(cv, dict) else (cv or None)
    ct = st.get('current_task')
    if isinstance(ct, dict):
        task_slug = ct.get('slug')
    elif isinstance(ct, str):
        task_slug = ct
    # ticket_id: best-effort from current_task dict if present.
    if isinstance(ct, dict):
        ticket_id = ct.get('ticket_id') or ct.get('ticket')
except Exception:
    pass

import datetime
line = {
    'ts': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'scope': 'subagent',
    'persona': os.environ.get('PERSONA') or None,
    'task_slug': task_slug,
    'ticket_id': ticket_id,
    'version': version,
    'turn_index': None,
    'model': model,
    'usage': usage,
    'cost_usd': cost,
    'cost_basis': 'subagent_total',
    'session_id': os.environ.get('SID') or None,
    'promotion_outcome': None,
    'input_meta': {},
    'output_full': None,
}
sys.stdout.write(json.dumps(line, ensure_ascii=False))
PYEOF
)"

if [ -n "$TURN_LINE" ]; then
  # Atomic single-line append via O_APPEND (printf in one write; lines are short).
  printf '%s\n' "$TURN_LINE" >> "$TURNS_FILE" 2>/dev/null || true
fi

exit 0
