# Persona delegation + Plan mode

## How to invoke a persona (non-interactive)

**Pre-condition**: `current_task` is already set in `po-state.json` from Stage 1 (task disposition). Personas read/write under `current_task.persona_sessions` and `current_task.persona_session_meta`.

> **Why this template uses Python instead of pure jq**: `claude --print --output-format json` writes a JSON envelope where `.result` may contain raw control characters (terminal-escape codes, embedded newlines from tool output). Pure `jq` rejects these as `Invalid string: control characters from U+0000 through U+001F must be escaped`. We use `NO_COLOR=1` to suppress most of them and Python's `json.loads` (more lenient with embedded ctrl chars) for parsing. Bash + jq still handles state-file edits where we control the input.

```bash
TARGET=$(pwd)
STATE="$TARGET/.productune/po-state.json"
mkdir -p "$TARGET/.productune"
[ -f "$STATE" ] || echo '{"current_round":null,"current_task":null,"past_tickets":[],"past_tasks":[],"rounds":[],"recent_turns":[]}' > "$STATE"

PERSONA=pdt-developer
TASK='<task string — PRD path, design doc, prior artifacts, user feedback, [PROMOTION-APPROVED] marker if applicable>'

# Tier resolution (see routing.md for full algorithm)
MODEL="${MODEL:-sonnet}"           # default for this persona's floor
EFFORT="${EFFORT:-medium}"         # low|medium|high|xhigh
COMPLEXITY="${COMPLEXITY:-L5}"     # 7-level

# xhigh protection: auto-promote model to opus
if [ "$EFFORT" = "xhigh" ] && [ "$MODEL" != "opus" ]; then
  echo "[PO] effort=xhigh requires opus — auto-promoting model" >&2
  MODEL=opus
fi

# Trace
echo "→ delegating to $PERSONA ($COMPLEXITY, model=$MODEL, effort=$EFFORT — $REASON)"

SID=$(jq -r --arg p "$PERSONA" '.current_task.persona_sessions[$p] // ""' "$STATE")
OUT=$(mktemp)

# Inject effort note in task body (Claude Code uses it as extended thinking budget)
EFFORT_NOTE="(extended thinking budget: $EFFORT)"

if [ -z "$SID" ]; then
  # First call — Claude assigns session id
  NO_COLOR=1 claude --agent "$PERSONA" --model "$MODEL" \
    --print --output-format json \
    "$TASK $EFFORT_NOTE" > "$OUT"
else
  # Resume — Claude Code's --resume allows model override
  NO_COLOR=1 claude --resume "$SID" --model "$MODEL" \
    --print --output-format json \
    "$TASK $EFFORT_NOTE" > "$OUT"
fi

# Parse + state update (model_history / effort_history / complexity_level / confidence_history)
python3 - "$OUT" "$STATE" "$PERSONA" "$TASK" "$MODEL" "$EFFORT" "$COMPLEXITY" <<'PY'
import json, sys, pathlib, datetime
out_path, state_path, persona, task, model, effort, complexity = sys.argv[1:8]
data = json.loads(pathlib.Path(out_path).read_text())
state = json.loads(pathlib.Path(state_path).read_text())
now = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
sid = data.get("session_id")
ct = state.setdefault("current_task", {})
sessions = ct.setdefault("persona_sessions", {})
meta = ct.setdefault("persona_session_meta", {})
if sid:
    m = meta.setdefault(persona, {"id": sid, "turns": 0, "created_at": now,
        "model_history": [], "effort_history": [], "confidence_history": []})
    if persona not in sessions:
        sessions[persona] = sid
    m["id"] = sid
    m["turns"] = m.get("turns", 0) + 1
    m.setdefault("model_history", []).append(model)
    m.setdefault("effort_history", []).append(effort)
    m["complexity_level"] = complexity
    confidence = data.get("confidence")
    if confidence:
        m.setdefault("confidence_history", []).append(confidence)
status = ("blocked" if data.get("blocked") is True
          else "refused" if data.get("refused") is True
          else data.get("overall") or ("fail" if data.get("is_error") else "pass"))
state.setdefault("recent_turns", []).append({
    "ts": now, "persona": persona,
    "task_slug": ct.get("slug", "untitled"),
    "ticket_id": ct.get("ticket_id"),
    "result": status,
    "model": model, "effort": effort, "complexity": complexity,
    "confidence": data.get("confidence"),
})
state["recent_turns"] = state["recent_turns"][-10:]
pathlib.Path(state_path).write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
print("STATUS=" + status)
print("CONFIDENCE=" + str(data.get("confidence")))
print("UNRESOLVED=" + json.dumps(data.get("unresolved", [])))
print(data.get("result", ""))
PY

rm -f "$OUT"
```

After parse: PO inspects `CONFIDENCE` + `UNRESOLVED`. If `CONFIDENCE=low` or `UNRESOLVED` non-empty → trigger Quality-based escalation (see `escalation.md`).

---

## Plan mode enforcement

Complex implementation tasks benefit from **plan-first → cross-review → auto-accept impl** instead of jumping straight to code. Adapted from Boris Cherny's `shift+tab → plan → other Claude reviews → auto-accept → 1-shot` pattern.

### When to enforce

Trigger conditions (any one):

- task complexity ≥ **L5** (Generation) — i.e. anything beyond a simple sweep / typo / single line
- artifacts are **multi-file** (≥2) or cross-cutting (different directory trees)
- risk-area flag (auth / payments / PII / migration / design system / public API)
- user explicitly asks for a plan

If none of the above, skip plan mode (waste of time). Stage 2 step 7b in `stages.md` is the branching point.

### Flow

1. **Plan call** — invoke the impl persona (usually pdt-developer) in plan-only mode. Task body must include:

   ```
   PLAN MODE — DO NOT WRITE CODE.
   Goal: <one line>
   Constraints: <non-goals, files-not-to-touch, perf/API contracts>
   Acceptance criteria: <how PO/QA will verify>
   Return a step-by-step plan: file-by-file changes, key functions touched, test additions, risks.
   ```

   Use `/effort high` (invest reasoning in the plan itself). Output JSON's `changed_files` must be empty — no code yet. Plan body in `notes` or a separate markdown.

2. **Cross-review** — staff-engineer review of the plan:
   - **pdt-qa** (mandatory): testability, acceptance criteria coverage, edge cases. Task body: plan + "Critique this plan as if you were preparing the test rubric. Return: missing acceptance criteria, untestable assumptions, regression risks."
   - **pdt-designer** (conditional, if user-facing): UX impact / design system consistency / copy. Skip for non-user-facing impl plans.
   - Reviewer output is a list of deviations or OK signal.

3. **Plan revise** — if reviewer flags items the dev missed, resume same dev session and update plan only (still no code). Run cross-review once more. **If 3+ rounds of plan revision are needed**, surface to user: `[PO] plan 이 3 라운드째 수정 중. <plan summary>. 사용자가 (a) 그대로 진행 (b) PRD 다시 확인 (c) 기다리지 말고 한 번에 implement 강행 중 결정해 주세요.`

4. **Auto-accept implementation** — re-invoke pdt-developer with the agreed plan, this time with **plan body fixed as the first line** of the task and `permissionMode: acceptEdits` (persona frontmatter default). 1-shot implementation. Self-verify (pdt-developer.md Workflow Step 3) is still mandatory.

5. **Failure → fall back to plan** — if Self-verify or pdt-qa fails accumulate (Path 1 retry from quality escalation already failed once), regress to plan mode and run reviewer again. Mark `escalation_triggered=true` and bump `actual_complexity` one notch in `calibration_outcome`.

### Trace examples

```
→ planning 'login-modal-forgot-pw' (L5, multi-file → plan mode required)
→ delegating to pdt-developer (PLAN ONLY, model=sonnet, effort=high)
✓ pdt-developer plan returned (3 files, no code)
→ cross-review: pdt-qa
✓ pdt-qa plan-review: 1 deviation — 'no test for the disabled link state'
→ revising plan with pdt-developer (resume same session)
✓ plan v2 ready
→ auto-accept impl: pdt-developer (model=sonnet, effort=high)
```

### Why explicit doctrine

CLI's plan mode keybinding (`shift+tab`) only fires when the user presses it directly. PO calling personas non-interactively (`claude --print --output-format json`) doesn't auto-engage plan mode — the only way to enforce it is putting "PLAN MODE — DO NOT WRITE CODE" in the task body.
