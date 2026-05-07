# Persona delegation + Plan mode

## Invoke (non-interactive)

`post-delegate-state-write` hook (`scripts/hooks/post-delegate-state-write.sh`, `PostToolUse(Bash)`) handles every `claude --agent pdt-*` / `--resume`: captures `.session_id`, bumps `persona_session_meta.<persona>.turns`, appends `model_history`, merges `recent_turns`, unions `artifacts`. **Don't duplicate.**

## Artifact self-verify gate

Artifact task: maker self-check parse/render/build/lint/test. Report result. QA only for meaning/risk.

PO's remaining writes (hook can't infer):
- Open `current_task` with semantic `slug` + `request_summary` + `artifacts` *before* delegating (else hook auto-creates `auto-<ts>` slug + `pre-delegate-task-check` blocks). `jq`, not `python3`.
- Update `docs/tickets/<version>/T-NNN.md` lifecycle metadata when routing/closing: status, timestamps, duration, assignee/routing/model/effort/progress refs only. No body/request/acceptance/scope edits.
- Read SID from `current_task.persona_sessions.<persona>` (hook blocks unknown UUIDs via R4).
- Append `effort_history`, `complexity_level`, `confidence_history` after call.

UUIDs strict **8-4-4-4-12 lowercase hex**. Never prefix. Never self-generate. First call: omit `--session-id` (Claude returns). Resume: `--resume "$SID"`. Mixing rejected.

### Minimal template

TASK ships an inline `[ctx]` JSON line so personas skip `po-state.json` re-read. Persona doctrine reads `[ctx]` if present; falls back only when absent.

```bash
TARGET=$(pwd); STATE="$TARGET/.productune/po-state.json"
PERSONA=pdt-developer; USER_TEXT='<verbatim>'; SCOPE='<1-line English>'
MODEL="${MODEL:-sonnet}"; EFFORT="${EFFORT:-medium}"; COMPLEXITY="${COMPLEXITY:-L5}"
case "$EFFORT" in xhigh|max) [ "$MODEL" = opus ] || MODEL=opus ;; esac

NEXT_NUM=$(jq -r '([.past_tickets[]?.ticket_id // empty, .current_task.ticket_id // empty]
  | map(select(. != null) | sub("^T-"; "") | tonumber) | max // 0) + 1' "$STATE" 2>/dev/null || echo 1)
NEXT_TID=$(printf "T-%03d" "$NEXT_NUM")
CTX=$(jq -c --arg ntid "$NEXT_TID" '{slug:.current_task.slug, request_summary:.current_task.request_summary,
  artifacts:(.current_task.artifacts // []), version:(.current_task.version // .current_task.round // null),
  prd_path:(.current_task.prd_path // null), brief_path:(.current_task.input.brief_path // null),
  persona_sessions:(.current_task.persona_sessions // {}), next_ticket_id:$ntid}' "$STATE")

TASK="$USER_TEXT
(scope: $SCOPE)
(extended thinking budget: $EFFORT)
[ctx] $CTX"

echo "→ delegating to $PERSONA ($COMPLEXITY, $MODEL/$EFFORT — $REASON)"
SID=$(jq -r --arg p "$PERSONA" '.current_task.persona_sessions[$p] // ""' "$STATE")
OUT=$(mktemp); ERR=$(mktemp)
[ -z "$SID" ] && set -- claude --agent "$PERSONA" --model "$MODEL" --print --output-format json "$TASK" \
              || set -- claude --resume "$SID"        --model "$MODEL" --print --output-format json "$TASK"

# Transient 403 guard: Anthropic session-org cache occasionally returns
# "no longer a member of the organization" then auto-recovers in seconds.
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

# Append one row to ticket's ## Persona Activity (PO mechanical write).
# Skip silently if TICKET_FILE unset / missing.
if [ -n "${TICKET_FILE:-}" ] && [ -f "$TICKET_FILE" ]; then
  TURN=$(jq -r --arg p "$PERSONA" '.current_task.persona_session_meta[$p].turns // 1' "$STATE")
  printf "| %s | %s | %s/%s | %s | %s |\n" "$(date -u +%FT%TZ)" "$PERSONA" "$MODEL" "$EFFORT" "$TURN" "${RESULT_ONELINE:-}" >> "$TICKET_FILE"
fi
```

> python3 is used only because `claude --print` JSON `.result` may carry stray control chars; `json.loads` is forgiving. State writes use `jq`. `TICKET_FILE` = current ticket path. `## Persona Activity` has a comment marker so the append lands at the table.

After parse: inspect `CONFIDENCE` + `UNRESOLVED`. Low/non-empty → quality escalation (`escalation.md`).

## PRD delegation (Designer, clarity loop)

User has fresh idea → delegate Version 1 PRD directly (clarity loop subsumes discovery):

```bash
PERSONA=pdt-designer; SCOPE='draft Version 1 PRD with clarity loop A ≤ 0.05; emit tickets when ready'
MODEL=opus; EFFORT=max; COMPLEXITY=L7
BRIEF_PATH=$(jq -r '.current_task.input.brief_path // empty' "$STATE")
TASK="$USER_TEXT
(scope: $SCOPE)
(extended thinking budget: $EFFORT)
[ctx] $CTX
[brief] $BRIEF_PATH"
```

Designer returns one of:
```json
// needs-info — PO relays next_question to user
{"state":"needs-info","next_question":"Which device/platform is the primary target?","missing_slot":"scope_boundary","ambiguity_score":0.18,"iteration":2}
// ready — PRD + tickets shipped
{"state":"ready","prd_path":"docs/prd/<slug>.md","tickets":["docs/tickets/v1/T-001.md"],"ambiguity_score":0.04,"slot_clarity":{},"version_outcome":{...},"confidence":0.92,"unresolved":[]}
```

PO loop:
1. Read `data.state`.
2. `needs-info` → render `next_question` in user's lang. Append user reply to `$BRIEF_PATH` if used. Resume Designer.
3. `ready` → store `prd_path` in `current_task.prd_path`, push `tickets[]` into `artifacts`, mirror `version_outcome` into `versions[N].outcome`, route per `tickets.md`. PO sets initial lifecycle metadata; Designer remains content owner.

Hard cap: 5 `needs-info` iterations. 6th turn → resume body: `"finalize PRD with current state. Move unresolved into ## Open Questions."` Designer ships `ready` with `confidence < 0.7`.

## Plan mode (L4+ default)

L4+ goes **plan-first (dev opus/xhigh) → PO reviews → auto-accept impl (sonnet/high)**. PO is default reviewer. (Adapted from Boris Cherny's plan-review-1shot.)

**Trigger**: L≥4, multi-file/cross-cutting, risk flag (auth/payments/PII/migration/DS/public-API), or user asks. L1–L3 trivials skip → straight sonnet/medium impl.

**Flow**:
1. Plan call — dev PLAN ONLY, opus/xhigh. Body starts `PLAN MODE — DO NOT WRITE CODE` + Goal/Constraints/Acceptance. `changed_files` must be empty.
2. PO review — testability + acceptance + architecture + risk. sonnet/medium routine, opus/high risk. Verdict: `OK` or `revise:[...]`.
3. Plan revise — resume same dev session, plan only, re-review. **3+ iterations** → surface (proceed / re-PRD / strong-implement).
4. Impl — dev sonnet/high, plan as task first line, `acceptEdits`. Self-verify mandatory.
5. Failure regress — Self-verify / QA fail after Path 1 retry → back to plan (opus/xhigh) + PO re-review. `escalation_triggered=true`, bump `actual_complexity`.

Optional cross-review (high-stakes): pdt-qa testability, pdt-designer UX/DS/copy.

Trace (L4): `→ planning 'X' (L4 → plan)` · `→ delegating pdt-developer (PLAN ONLY, opus/xhigh)` · `✓ plan returned` · `→ PO reviewing` · `✓ OK` · `→ delegating pdt-developer (impl, sonnet/high)`.

**Why explicit**: `claude --print` doesn't auto-engage plan mode; task-body `PLAN MODE — DO NOT WRITE CODE` is the only non-interactive enforcement.
