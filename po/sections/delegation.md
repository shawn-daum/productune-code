# Persona delegation + Plan mode

## How to invoke (non-interactive)

The `post-delegate-state-write` hook (`scripts/hooks/post-delegate-state-write.sh`, registered as `PostToolUse(Bash)`) does the mechanical work for you on every `claude --agent pdt-*` / `--resume` call: captures `.session_id`, bumps `persona_session_meta.<persona>.turns`, appends `model_history`, merges `recent_turns`, and unions `artifacts`. **Don't duplicate this in `python3`/`jq`.**

PO's remaining writes (the hook can't infer them):
- Open `current_task` with semantic `slug` + `request_summary` + `artifacts` *before* delegating (else hook auto-creates `auto-<ts>` and `pre-delegate-task-check` blocks). Use `jq`, not `python3`.
- Read SID for resume from `current_task.persona_sessions.<persona>` (hook also blocks unknown UUIDs via R4).
- Append `effort_history`, `complexity_level`, `confidence_history` after the call.

### Session-id format

UUIDs are strict **8-4-4-4-12 lowercase hex**. Never prefix (`pdt-dev-…`). Never self-generate. First call: omit `--session-id` (Claude returns it). Resume: `--resume "$SID"`. Mixing rejected by Claude Code.

### Minimal template

The TASK payload now ships with a `[ctx]` JSON line so personas don't have to
re-read `po-state.json`. Persona doctrine reads `[ctx]` if present; falls back
to a `jq` re-read only when absent (e.g. user-direct prompts).

```bash
TARGET=$(pwd); STATE="$TARGET/.productune/po-state.json"
PERSONA=pdt-developer
USER_TEXT='<verbatim user text>'
SCOPE='<1-line English scope. No ownership boilerplate — persona doctrine has it.>'

# Tier (routing.md): MODEL ∈ {haiku,sonnet,opus} · EFFORT ∈ {low,medium,high,xhigh,max} · COMPLEXITY=L<n>
MODEL="${MODEL:-sonnet}"; EFFORT="${EFFORT:-medium}"; COMPLEXITY="${COMPLEXITY:-L5}"
case "$EFFORT" in xhigh|max) [ "$MODEL" = opus ] || MODEL=opus ;; esac

# Build [ctx] slice — single line of JSON, slug + request_summary + artifacts +
# persona_sessions only. Keeps the cache breakpoint stable across turns.
CTX=$(jq -c '{
  slug: .current_task.slug,
  request_summary: .current_task.request_summary,
  artifacts: (.current_task.artifacts // []),
  round: (.current_task.round // null),
  prd_path: (.current_task.prd_path // null),
  persona_sessions: (.current_task.persona_sessions // {})
}' "$STATE")

TASK="$USER_TEXT
(scope: $SCOPE)
(extended thinking budget: $EFFORT)
[ctx] $CTX"

echo "→ delegating to $PERSONA ($COMPLEXITY, $MODEL/$EFFORT — $REASON)"

SID=$(jq -r --arg p "$PERSONA" '.current_task.persona_sessions[$p] // ""' "$STATE")
OUT=$(mktemp)
if [ -z "$SID" ]; then
  NO_COLOR=1 claude --agent "$PERSONA" --model "$MODEL" --print --output-format json "$TASK" > "$OUT"
else
  NO_COLOR=1 claude --resume "$SID" --model "$MODEL" --print --output-format json "$TASK" > "$OUT"
fi

# Hook already captured session_id, turns, model_history, recent_turns, artifacts.
# PO appends only the PO-specific meta (effort + complexity + confidence):
python3 - "$OUT" "$STATE" "$PERSONA" "$EFFORT" "$COMPLEXITY" <<'PY'
import json, sys, pathlib
out, state_p, persona, effort, complexity = sys.argv[1:6]
data = json.loads(pathlib.Path(out).read_text())
state = json.loads(pathlib.Path(state_p).read_text())
m = state.setdefault("current_task", {}).setdefault("persona_session_meta", {}).setdefault(persona, {})
m.setdefault("effort_history", []).append(effort)
m["complexity_level"] = complexity
if (c := data.get("confidence")): m.setdefault("confidence_history", []).append(c)
pathlib.Path(state_p).write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
print("CONFIDENCE=" + str(data.get("confidence")))
print("UNRESOLVED=" + json.dumps(data.get("unresolved", [])))
print(data.get("result", ""))
PY
rm -f "$OUT"
```

> Why python3 stays here only: `claude --print` JSON `.result` may carry stray control chars; `json.loads` is forgiving. State writes use `jq`.

After parse: inspect `CONFIDENCE` + `UNRESOLVED`. Low/non-empty → quality escalation (`escalation.md`).

---

## Plan mode (L4+ default)

L4+ goes **plan-first (dev opus/xhigh) → PO reviews → auto-accept impl (sonnet/high)**. PO is default reviewer. (Adapted from Boris Cherny's plan-review-1shot.)

**Trigger** (any): L≥4, multi-file/cross-cutting, risk flag (auth/payments/PII/migration/design-system/public-API), or user asks. L1–L3 trivials skip plan → straight sonnet/medium impl.

**Flow:**
1. Plan call — pdt-developer PLAN ONLY, opus/xhigh. Task body starts with `PLAN MODE — DO NOT WRITE CODE` + Goal/Constraints/Acceptance. `changed_files` must be empty.
2. PO review direct — testability + acceptance + architecture + risk. Mode: sonnet/medium routine, opus/high risk. Verdict: `OK` or `revise:[...]`.
3. Plan revise — resume same dev session, plan only, re-review. **3+ rounds** → surface to user (proceed / re-PRD / strong-implement).
4. Impl — pdt-developer sonnet/high, plan as task first line, `acceptEdits`. Self-verify mandatory.
5. Failure regress — Self-verify / QA fail after Path 1 retry → back to plan (opus/xhigh) + PO re-review. `escalation_triggered=true`, bump `actual_complexity`.

Optional cross-review (opt-in, high-stakes): pdt-qa testability, pdt-designer UX/DS/copy.

**Trace** (L4): `→ planning 'X' (L4 → plan)` · `→ delegating pdt-developer (PLAN ONLY, opus/xhigh)` · `✓ plan returned` · `→ PO reviewing` · `✓ OK` · `→ delegating pdt-developer (impl, sonnet/high)`.

**Why explicit**: `claude --print` doesn't auto-engage plan mode; task-body `PLAN MODE — DO NOT WRITE CODE` is the only non-interactive enforcement.
