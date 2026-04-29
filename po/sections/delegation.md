# Persona delegation + Plan mode

## How to invoke a persona (non-interactive)

State writes are auto-handled by the **`post-delegate-state-write` hook** (`scripts/hooks/post-delegate-state-write.sh`, registered as `PostToolUse(Bash)` in `~/.claude/settings.json`). The hook detects every `claude --agent pdt-*` / `claude --resume` call, captures `.session_id`, bumps `persona_session_meta.<persona>.turns`, and appends a `recent_turns` entry. PO does not need to do these manually.

PO's remaining responsibilities (the hook can't infer these):
- Open `current_task` with a meaningful slug + `request_summary` + `artifacts` *before* delegating (otherwise the hook auto-creates `auto-<timestamp>`).
- Read SID for resumes from `current_task.persona_sessions.<persona>`.
- Append `model_history` / `effort_history` / `complexity_level` (the hook doesn't know these).
- Final calibration log line on task close (`sections/calibration.md`).

### Session-id format (still matters — wrong format crashes the call)

UUIDs are strictly **8-4-4-4-12 lowercase hex**. Never prefix (`pdt-dev-…`, `po-…`). Never self-generate. First call: omit `--session-id` (Claude returns it). Subsequent: `--resume "$SID"` only. Mixing `--session-id` and `--resume` is rejected by Claude Code.

> **Why the template below uses Python instead of pure jq for response parsing**: `claude --print --output-format json` writes a JSON envelope where `.result` may contain raw control characters (terminal escapes, embedded newlines). `NO_COLOR=1` suppresses most; `json.loads` is more lenient than `jq` for the rest. State-file edits use `jq` since we control the input.

### Minimal template (relying on hook for state)

```bash
TARGET=$(pwd)
STATE="$TARGET/.productune/po-state.json"

PERSONA=pdt-developer
TASK='<task string — PRD path, design doc, prior artifacts, user feedback, [PROMOTION-APPROVED] marker if applicable>'

# Tier resolution (see routing.md)
MODEL="${MODEL:-sonnet}"        # haiku|sonnet|opus
EFFORT="${EFFORT:-medium}"      # low|medium|high|xhigh|max
COMPLEXITY="${COMPLEXITY:-L5}"

# xhigh/max → opus auto-promote
case "$EFFORT" in xhigh|max)
  [ "$MODEL" != "opus" ] && { echo "[PO] $EFFORT requires opus — promoting"; MODEL=opus; }
esac

echo "→ delegating to $PERSONA ($COMPLEXITY, model=$MODEL, effort=$EFFORT — $REASON)"

SID=$(jq -r --arg p "$PERSONA" '.current_task.persona_sessions[$p] // ""' "$STATE")
EFFORT_NOTE="(extended thinking budget: $EFFORT)"

OUT=$(mktemp)
if [ -z "$SID" ]; then
  NO_COLOR=1 claude --agent "$PERSONA" --model "$MODEL" --print --output-format json "$TASK $EFFORT_NOTE" > "$OUT"
else
  NO_COLOR=1 claude --resume "$SID" --model "$MODEL" --print --output-format json "$TASK $EFFORT_NOTE" > "$OUT"
fi

# Hook already captured session_id / turns / recent_turns. PO appends model/effort/complexity + extracts confidence:
python3 - "$OUT" "$STATE" "$PERSONA" "$MODEL" "$EFFORT" "$COMPLEXITY" <<'PY'
import json, sys, pathlib
out_path, state_path, persona, model, effort, complexity = sys.argv[1:7]
data = json.loads(pathlib.Path(out_path).read_text())
state = json.loads(pathlib.Path(state_path).read_text())
m = state.setdefault("current_task", {}).setdefault("persona_session_meta", {}).setdefault(persona, {})
m.setdefault("model_history", []).append(model)
m.setdefault("effort_history", []).append(effort)
m["complexity_level"] = complexity
conf = data.get("confidence")
if conf: m.setdefault("confidence_history", []).append(conf)
pathlib.Path(state_path).write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
print("CONFIDENCE=" + str(conf))
print("UNRESOLVED=" + json.dumps(data.get("unresolved", [])))
print(data.get("result", ""))
PY
rm -f "$OUT"
```

After parse: PO inspects `CONFIDENCE` + `UNRESOLVED`. If `CONFIDENCE=low` or `UNRESOLVED` non-empty → trigger Quality-based escalation (see `escalation.md`).

---

## Plan mode enforcement (L4+ default)

L4+ tasks go **plan-first (dev opus/xhigh) → PO reviews → auto-accept impl (sonnet/high)**. PO is the default reviewer (same actor that owns PRD/ticket). Adapted from Boris Cherny's plan-review-1shot pattern.

**Trigger** (any one): complexity ≥L4, multi-file/cross-cutting, risk-area flag (auth/payments/PII/migration/design-system/public-API), user explicitly asks. L1–L3 trivials skip plan, dev goes straight to sonnet/medium impl.

**Flow:**
1. Plan call — pdt-developer PLAN ONLY at opus/xhigh. Task body: `PLAN MODE — DO NOT WRITE CODE` + Goal/Constraints/Acceptance. Output `changed_files` must be empty.
2. PO reviews directly — testability + acceptance + architecture + risk. PO mode: sonnet/medium routine, opus/high risk-flagged. Verdict: `OK` or `revise:[...]`.
3. Plan revise — resume same dev session, plan only, re-review. **3+ rounds** → surface to user (proceed / re-PRD / strong-implement).
4. Auto-accept impl — pdt-developer sonnet/high, plan as task first line, `acceptEdits`. Self-verify mandatory.
5. Failure regress — Self-verify / pdt-qa fail after Path 1 retry → back to plan (opus/xhigh) + PO re-review. Mark `escalation_triggered=true`, bump `actual_complexity`.

**Optional cross-reviewers** (opt-in for high-stakes): pdt-qa testability ("Critique as test rubric — missing acceptance, untestable assumptions, regression risks"), pdt-designer UX ("Critique UX/DS/copy") for user-facing impl.

**Trace** (L4 default): `→ planning 'X' (L4 → plan)` `→ delegating to pdt-developer (PLAN ONLY, opus, ⚡xhigh)` `✓ plan returned` `→ PO reviewing` `✓ OK` `→ delegating to pdt-developer (impl, sonnet, high)`.

**Why explicit**: CLI `shift+tab` plan mode is user-keypress only. Non-interactive `claude --print` doesn't auto-engage — task-body `PLAN MODE — DO NOT WRITE CODE` is the only enforcement.
