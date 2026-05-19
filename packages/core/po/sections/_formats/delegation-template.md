# Delegation minimal template — bash heredoc

TASK ships inline `[ctx]` JSON line. Personas skip `po-state.json` re-read. Persona doctrine reads `[ctx]` if present; falls back only when absent.

```bash
TARGET=$(pwd); STATE="$TARGET/.productune/po-state.json"
PERSONA=pdt-developer; USER_TEXT='<verbatim>'; SCOPE='<1-line English>'
MODEL="${MODEL:-sonnet}"; EFFORT="${EFFORT:-medium}"; COMPLEXITY="${COMPLEXITY:-L5}"
case "$EFFORT" in xhigh|max) [ "$MODEL" = opus ] || MODEL=opus ;; esac

NEXT_NUM=$(node scripts/po/scan-tickets.mjs "$TARGET" 2>/dev/null \
  | jq -r '([.[].ticket_id // empty]
    | map(select(. != null) | sub("^T-(P[0-9]+-)?"; "") | tonumber? // 0) | max // 0) + 1' \
  2>/dev/null || echo 1)
NEXT_TID=$(printf "T-%03d" "$NEXT_NUM")

# user_knowledge_state snapshot (T-P4-120) — see _details/uks-field.md
UKS=$(jq -nc \
  --arg ref '~/.productune/po-memory.md#user-knowledge-state-engineering' \
  --arg asof "$(date -u +%F)" \
  --argjson axes "${UKS_AXES:-[]}" \
  '{memory_ref:$ref, axes_relevant:$axes, as_of:$asof}')

CTX=$(jq -c --arg ntid "$NEXT_TID" --argjson uks "$UKS" \
  '{slug:.current_task.slug, request_summary:.current_task.request_summary,
    artifacts:(.current_task.artifacts // []), version:(.current_task.version // .current_task.round // null),
    prd_path:(.current_task.prd_path // null), brief_path:(.current_task.input.brief_path // null),
    persona_sessions:(.current_task.persona_sessions // {}), next_ticket_id:$ntid,
    user_knowledge_state:$uks}' "$STATE")

TASK="$USER_TEXT
(scope: $SCOPE)
(extended thinking budget: $EFFORT)
[ctx] $CTX"

echo "→ delegating to $PERSONA ($COMPLEXITY, $MODEL/$EFFORT — $REASON)"
SID=$(jq -r --arg p "$PERSONA" '.current_task.persona_sessions[$p] // ""' "$STATE")
OUT=$(mktemp); ERR=$(mktemp)
[ -z "$SID" ] && set -- claude --agent "$PERSONA" --model "$MODEL" --print --output-format json "$TASK" \
              || set -- claude --resume "$SID"        --model "$MODEL" --print --output-format json "$TASK"

# Transient 403 guard — auto-recover Anthropic session-org cache hiccup.
NO_COLOR=1 "$@" > "$OUT" 2> "$ERR" || true
if grep -qF "no longer a member of the organization" "$OUT" "$ERR" 2>/dev/null; then
  echo "  ↻ transient 403 — retrying in 5s..." >&2; sleep 5
  NO_COLOR=1 "$@" > "$OUT" 2> "$ERR"
fi
rm -f "$ERR"

# Hook captured session_id, turns, model_history, recent_turns, artifacts.
# PO appends only PO-specific meta + reads confidence/unresolved.
python3 - "$OUT" "$STATE" "$PERSONA" "$EFFORT" "$COMPLEXITY" <<'PY'
import json, sys, pathlib
out, state_p, persona, effort, complexity = sys.argv[1:6]
data = json.loads(pathlib.Path(out).read_text())
state = json.loads(pathlib.Path(state_p).read_text())
m = state.setdefault("current_task", {}).setdefault("persona_session_meta", {}).setdefault(persona, {})
m.setdefault("effort_history", []).append(effort); m["complexity_level"] = complexity
if (c := data.get("confidence")): m.setdefault("confidence_history", []).append(c)
pathlib.Path(state_p).write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
raw = data.get("result", "") or ""
print("CONFIDENCE=" + str(data.get("confidence")))
print("UNRESOLVED=" + json.dumps(data.get("unresolved", [])))
print("RESULT_ONELINE=" + (next((l.strip() for l in raw.splitlines() if l.strip()), "")[:80]))
print(raw)
PY
rm -f "$OUT"

# Append 1 row to ticket ## Persona Activity (PO mechanical). Skip if TICKET_FILE unset.
if [ -n "${TICKET_FILE:-}" ] && [ -f "$TICKET_FILE" ]; then
  TURN=$(jq -r --arg p "$PERSONA" '.current_task.persona_session_meta[$p].turns // 1' "$STATE")
  printf "| %s | %s | %s/%s | %s | %s |\n" "$(date -u +%FT%TZ)" "$PERSONA" "$MODEL" "$EFFORT" "$TURN" "${RESULT_ONELINE:-}" >> "$TICKET_FILE"
fi
```

python3 only because `claude --print` JSON `.result` may carry stray control chars; `json.loads` is forgiving. State writes use `jq`. `TICKET_FILE` = current ticket path. `## Persona Activity` has comment marker → append lands at table.

After parse: inspect `CONFIDENCE` + `UNRESOLVED`. Low/non-empty → quality escalation (`escalation.md`).
