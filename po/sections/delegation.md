# Persona delegation + Plan mode

## How to invoke a persona (non-interactive)

**Pre-condition**: `current_task` is already set in `po-state.json` from Stage 1 (task disposition). Personas read/write under `current_task.persona_sessions` and `current_task.persona_session_meta`.

### Session-id rules (most common deviation source)

- First call: omit `--session-id`. Claude Code assigns one, returns in response `.session_id`.
- Store that UUID in `po-state.json` `current_task.persona_sessions.<persona>`.
- Subsequent calls: `--resume "$SID"` only. Never pass `--session-id` and `--resume` together.

DO NOT:
- Generate session_id yourself (`uuidgen`, random hex, etc.). Claude Code owns the namespace.
- Prefix/postfix UUIDs (`pdt-dev-...`, `task-001-...`). UUIDs are strictly 8-4-4-4-12 lowercase hex; anything else fails with `Invalid session ID`.
- Pass `--session-id <uuid>` on first call to "claim" an id. Pattern is omit-then-resume.
- Reuse a UUID across personas. Each persona has its own slot in `persona_sessions`.

Wrong session_id crashes the call or silently creates a new session, breaking `--resume` for Path 1 escalation.

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

## Plan mode enforcement (default for L4+ implementation)

Implementation tasks of L4+ go through **plan-first (developer authors plan in opus/xhigh) → PO reviews directly → auto-accept impl (sonnet/high)**. Adapted from Boris Cherny's `shift+tab → plan → review → auto-accept → 1-shot` pattern, but using PO as the default reviewer (not pdt-qa) so the reviewer is the same actor that owns the PRD/ticket.

### When to enforce

Trigger conditions (any one):

- task complexity ≥ **L4** (Summarization) — i.e. anything beyond an L1–L3 trivial (typo, single line, simple reformat)
- artifacts are **multi-file** (≥2) or cross-cutting (different directory trees)
- risk-area flag (auth / payments / PII / migration / design system / public API)
- user explicitly asks for a plan

L1–L3 trivials (single-line edits, obvious typos, mechanical reformats) skip plan mode — pdt-developer goes straight to impl at sonnet/medium. Stage 2 step 7b in `stages.md` is the branching point.

### Flow

1. **Plan call** — invoke pdt-developer in plan-only mode at **`opus + xhigh`** (developer's plan-phase default). Task body:

   ```
   PLAN MODE — DO NOT WRITE CODE.
   Goal: <one line>
   Constraints: <non-goals, files-not-to-touch, perf/API contracts>
   Acceptance criteria: <how PO/QA will verify>
   Return a step-by-step plan: file-by-file changes, key functions touched, test additions, risks.
   ```

   Output JSON's `changed_files` must be empty — no code yet. Plan body in `notes` or a separate markdown.

2. **Plan review (PO direct, default)** — PO reads the plan and assesses testability + acceptance coverage + architecture + risk. **No persona cross-review by default.** PO uses its own mode (typically sonnet/medium for routine review, escalates to opus/high for risk-flagged or system-level plans).

   PO records the review verdict as either:
   - `OK` — plan accepted; proceed to impl
   - `revise: [item1, item2, ...]` — list of issues for developer to address

3. **Plan revise** — if PO flags items, resume same developer session and update plan only (still no code). PO reviews v2. **If 3+ rounds of plan revision are needed**, surface to user: `[PO] plan 이 3 라운드째 수정 중. <plan summary>. 사용자가 (a) 그대로 진행 (b) PRD 다시 확인 (c) 기다리지 말고 한 번에 implement 강행 중 결정해 주세요.`

4. **Auto-accept implementation** — re-invoke pdt-developer with the agreed plan at **`sonnet + high`**, plan body fixed as the first line of the task, `permissionMode: acceptEdits` (persona frontmatter default). 1-shot implementation. Self-verify (pdt-developer.md Workflow Step 3) is still mandatory.

5. **Failure → fall back to plan** — if Self-verify or pdt-qa fails accumulate (Path 1 retry already failed once), regress to plan mode at `opus + xhigh` and have PO re-review. Mark `escalation_triggered=true` and bump `actual_complexity` one notch in `calibration_outcome`.

### Optional cross-review escalation

PO can opt to invoke persona cross-reviewers for high-stakes plans:

- **pdt-qa testability cross-review** — when the plan is risk-flagged or has acceptance criteria PO is uncertain about. Task body: plan + "Critique this plan as if preparing the test rubric. Return: missing acceptance criteria, untestable assumptions, regression risks."
- **pdt-designer UX cross-review** — when impl touches user-facing UI/UX/copy that wasn't already covered by a design doc. Task body: plan + "Critique this plan for UX consistency / design system compliance / copy."

These are *not* part of the default flow — invoke only when PO's own review surfaces specific concerns it can't resolve alone.

### Trace examples

L4 simple feature (default flow, no cross-review):
```
→ planning 'login-link-color' (L4 → plan mode required)
→ delegating to pdt-developer (PLAN ONLY, model=opus, effort=⚡xhigh)
✓ pdt-developer plan returned (1 file, no code)
→ PO reviewing plan directly
✓ PO: plan OK
→ delegating to pdt-developer (impl, model=sonnet, effort=high)
```

L6 multi-file refactor with PO cross-review escalation:
```
→ planning 'auth-middleware-rewrite' (L6 multi-file + risk-flagged → plan mode)
→ delegating to pdt-developer (PLAN ONLY, model=opus, effort=⚡xhigh)
✓ pdt-developer plan returned (5 files, no code)
→ PO reviewing plan — risk-flagged, escalating to pdt-qa cross-review
→ delegating to pdt-qa (plan testability cross-review, model=sonnet, effort=high)
✓ pdt-qa: 2 deviations — 'no test for token rotation', 'session-fixation case missing'
→ revising plan with pdt-developer (resume same session)
✓ plan v2 ready, PO accepts
→ delegating to pdt-developer (impl, model=sonnet, effort=high)
```

### Why explicit doctrine

CLI's plan mode keybinding (`shift+tab`) only fires when the user presses it directly. PO calling personas non-interactively (`claude --print --output-format json`) doesn't auto-engage plan mode — the only way to enforce it is putting "PLAN MODE — DO NOT WRITE CODE" in the task body.
