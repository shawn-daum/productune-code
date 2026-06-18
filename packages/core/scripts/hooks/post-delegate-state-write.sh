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

# ── T-PATCH-202: subagent token-cost capture via session transcript → turns.jsonl ─
# Dispatch is a text `-p` print (NO --output-format json), so STDOUT carries only
# the persona's own JSON — there is no cost/usage envelope here (the old envelope
# parse was always a no-op, the bug this patch fixes). Instead we use the SID we
# just captured to locate the sub-agent's Claude Code session transcript and sum
# the per-turn `usage` from its assistant rows.
#
#   transcript = ~/.claude/projects/**/<SID>.jsonl  (filename == session UUID).
#   The directory is non-deterministic (project-dir encoding + timestamp), so we
#   match by FILENAME via `find`, never by guessing the dir.
#
# Each `type:"assistant"` row carries `.message.usage{input_tokens, output_tokens,
# cache_creation_input_tokens, cache_read_input_tokens}` + `.message.model`. We sum
# usage across all assistant rows and take the last non-null model (handles a model
# switch mid-session). cost_usd is left null and DERIVED at aggregation time from
# the single price table (packages/core/config/model-prices.json) — the hook never
# duplicates pricing.
#
# resume accumulates the transcript, so the same SID must reflect the FINAL
# cumulative usage once: we upsert (rewrite any prior scope:subagent row for this
# session_id, then append) — same dedup philosophy as T-PATCH-201.
#
# version / ticket_id / task_slug come from po-state.json (same parsing the
# statusline reuses). turns.jsonl is a sibling of po-state.json (per-project local).
TURNS_FILE="$(dirname "$STATE")/turns.jsonl"

# Locate the transcript deterministically by filename (= session UUID).
TRANSCRIPT="$(find "$HOME/.claude/projects" -type f -name "$SID.jsonl" 2>/dev/null | head -1)"

if [ -n "$TRANSCRIPT" ] && [ -r "$TRANSCRIPT" ] && command -v jq >/dev/null 2>&1; then
  # Sum assistant-row usage + last model. `// 0` tolerates rows missing a field;
  # `add` over an empty list is null → `// 0` again. model = last non-null.
  AGG="$(jq -s '
    [ .[] | select(.type=="assistant") | .message ] as $msgs
    | {
        model: ( [ $msgs[]? | .model ] | map(select(. != null)) | last ),
        input_tokens: ( [ $msgs[]? | .usage.input_tokens // 0 ] | add // 0 ),
        output_tokens: ( [ $msgs[]? | .usage.output_tokens // 0 ] | add // 0 ),
        cache_creation_input_tokens: ( [ $msgs[]? | .usage.cache_creation_input_tokens // 0 ] | add // 0 ),
        cache_read_input_tokens: ( [ $msgs[]? | .usage.cache_read_input_tokens // 0 ] | add // 0 )
      }
  ' "$TRANSCRIPT" 2>/dev/null)"

  if [ -n "$AGG" ]; then
    # Build the turns.jsonl row + perform the per-session_id upsert in one python
    # pass (reads existing turns.jsonl, drops any prior scope:subagent row with the
    # same session_id, appends the fresh cumulative row).
    STATE_PATH="$STATE" PERSONA="$PERSONA" SID="$SID" TURNS_FILE="$TURNS_FILE" \
      python3 - "$AGG" <<'PYEOF' 2>/dev/null || true
import json, os, sys, datetime

try:
    agg = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)
if not isinstance(agg, dict):
    sys.exit(0)

def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None

usage = {
    'input_tokens': _int(agg.get('input_tokens')),
    'output_tokens': _int(agg.get('output_tokens')),
    'cache_creation_input_tokens': _int(agg.get('cache_creation_input_tokens')),
    'cache_read_input_tokens': _int(agg.get('cache_read_input_tokens')),
}
model = agg.get('model') if isinstance(agg.get('model'), str) else None

# No usable data at all → no-op (graceful: empty transcript / non-subscriber).
if model is None and not any(v for v in usage.values()):
    sys.exit(0)

# version / ticket_id / task_slug from po-state.json (same fields the statusline reads).
version = task_slug = ticket_id = None
try:
    with open(os.environ['STATE_PATH']) as f:
        st = json.load(f)
    cv = st.get('current_version', '')
    version = cv.get('id') if isinstance(cv, dict) else (cv or None)
    ct = st.get('current_task')
    if isinstance(ct, dict):
        task_slug = ct.get('slug')
        ticket_id = ct.get('ticket_id') or ct.get('ticket')
    elif isinstance(ct, str):
        task_slug = ct
except Exception:
    pass

sid = os.environ.get('SID') or None
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
    # cost_usd derived at aggregation time from the price table (never here).
    'cost_usd': None,
    'cost_basis': 'subagent_total',
    'session_id': sid,
    'promotion_outcome': None,
    'input_meta': {},
    'output_full': None,
}

turns_file = os.environ['TURNS_FILE']

# Upsert: keep every existing line EXCEPT a prior scope:subagent row with this
# same session_id (resume re-aggregates the cumulative total → replace, not stack).
kept = []
try:
    with open(turns_file) as f:
        for raw in f:
            s = raw.strip()
            if not s:
                continue
            try:
                rec = json.loads(s)
            except Exception:
                kept.append(s)  # preserve malformed/foreign lines verbatim
                continue
            if (isinstance(rec, dict)
                    and rec.get('scope') == 'subagent'
                    and sid is not None
                    and rec.get('session_id') == sid):
                continue  # drop the stale cumulative row for this session
            kept.append(s)
except FileNotFoundError:
    pass

kept.append(json.dumps(line, ensure_ascii=False))
tmp = turns_file + '.tmp'
with open(tmp, 'w') as f:
    f.write('\n'.join(kept) + '\n')
os.replace(tmp, turns_file)
PYEOF
  fi
fi

exit 0
