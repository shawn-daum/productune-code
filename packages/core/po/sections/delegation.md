# Persona delegation + Plan mode

## Invoke (non-interactive)

`post-delegate-state-write` hook (`scripts/hooks/post-delegate-state-write.sh`, `PostToolUse(Bash)`) does mechanical work on every `claude --agent pdt-*` / `--resume`: captures `.session_id`, bumps `persona_session_meta.<persona>.turns`, appends `model_history`, merges `recent_turns`, unions `artifacts`. **Don't duplicate in `python3`/`jq`.**

PO's remaining writes (hook can't infer):
- Open `current_task` with semantic `slug` + `request_summary` + `artifacts` *before* delegating (else hook auto-creates `auto-<ts>` + `pre-delegate-task-check` blocks). `jq`, not `python3`.
- Update `docs/tickets/<round>/T-NNN.md` lifecycle metadata/frontmatter when routing or closing work: status, timestamps, duration, assignee/routing/model/effort/progress refs only. Do not edit ticket body/request/acceptance/scope; delegate those changes to Designer.
- Read SID from `current_task.persona_sessions.<persona>` (hook blocks unknown UUIDs via R4).
- Append `effort_history`, `complexity_level`, `confidence_history` after call.

### Session-id format

UUIDs strict **8-4-4-4-12 lowercase hex**. Never prefix. Never self-generate. First call: omit `--session-id` (Claude returns it). Resume: `--resume "$SID"`. Mixing rejected.

### Minimal template

TASK ships with `[ctx]` JSON line so personas skip `po-state.json` re-read. Persona doctrine reads `[ctx]` if present; falls back to `jq` re-read only when absent.

```bash
TARGET=$(pwd); STATE="$TARGET/.productune/po-state.json"
PERSONA=pdt-developer; USER_TEXT='<verbatim>'; SCOPE='<1-line English>'

# Tier (routing.md): MODEL ∈ {haiku,sonnet,opus} · EFFORT ∈ {low,medium,high,xhigh,max} · COMPLEXITY=L<n>
MODEL="${MODEL:-sonnet}"; EFFORT="${EFFORT:-medium}"; COMPLEXITY="${COMPLEXITY:-L5}"
case "$EFFORT" in xhigh|max) [ "$MODEL" = opus ] || MODEL=opus ;; esac

NEXT_NUM=$(jq -r '([.past_tickets[]?.ticket_id // empty, .current_task.ticket_id // empty]
  | map(select(. != null) | sub("^T-"; "") | tonumber) | max // 0) + 1' "$STATE" 2>/dev/null || echo 1)
NEXT_TID=$(printf "T-%03d" "$NEXT_NUM")
CTX=$(jq -c --arg ntid "$NEXT_TID" '{slug:.current_task.slug, request_summary:.current_task.request_summary,
  artifacts:(.current_task.artifacts // []), round:(.current_task.round // null),
  prd_path:(.current_task.prd_path // null), brief_path:(.current_task.input.brief_path // null),
  persona_sessions:(.current_task.persona_sessions // {}), next_ticket_id:$ntid}' "$STATE")

TASK="$USER_TEXT
(scope: $SCOPE)
(extended thinking budget: $EFFORT)
[ctx] $CTX"

echo "→ delegating to $PERSONA ($COMPLEXITY, $MODEL/$EFFORT — $REASON)"

SID=$(jq -r --arg p "$PERSONA" '.current_task.persona_sessions[$p] // ""' "$STATE")
OUT=$(mktemp); ERR=$(mktemp)
if [ -z "$SID" ]; then set -- claude --agent "$PERSONA" --model "$MODEL" --print --output-format json "$TASK"
else                   set -- claude --resume "$SID"        --model "$MODEL" --print --output-format json "$TASK"; fi
# Transient 403 guard — Anthropic backend's session-org cache occasionally returns
# "no longer a member of the organization" on first call but auto-recovers in seconds.
NO_COLOR=1 "$@" > "$OUT" 2> "$ERR" || true
if grep -qF "no longer a member of the organization" "$OUT" "$ERR" 2>/dev/null; then
  echo "  ↻ transient 403 — retrying in 5s..." >&2; sleep 5
  NO_COLOR=1 "$@" > "$OUT" 2> "$ERR"
fi
rm -f "$ERR"

# Hook captured session_id, turns, model_history, recent_turns, artifacts.
# PO appends only PO-specific meta + writes raw turn-log line to .productune/turns/<slug>.jsonl.
python3 - "$OUT" "$STATE" "$PERSONA" "$EFFORT" "$COMPLEXITY" "$MODEL" "$TARGET" "${TICKET_FILE:-}" "${WIKI_CONSULT_JSON:-}" <<'PY'
import json, sys, pathlib, datetime
out, state_p, persona, effort, complexity, model, target_dir, ticket_file, wiki_consult_raw = sys.argv[1:10]
try:
    wiki_consult = json.loads(wiki_consult_raw) if wiki_consult_raw and wiki_consult_raw.strip() not in ('', '{}') else None
except Exception:
    wiki_consult = None
data = json.loads(pathlib.Path(out).read_text())
state = json.loads(pathlib.Path(state_p).read_text())

# (1) persona_session_meta — PO-specific (hook can't infer)
m = state.setdefault("current_task", {}).setdefault("persona_session_meta", {}).setdefault(persona, {})
m.setdefault("effort_history", []).append(effort); m["complexity_level"] = complexity
if (c := data.get("confidence")): m.setdefault("confidence_history", []).append(c)
pathlib.Path(state_p).write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")

# (2) Turn-log append (Stream 3 — observability). One line per persona invocation.
ct = state.get("current_task", {}) or {}
slug = ct.get("slug") or "unknown"
session_id = (ct.get("persona_sessions", {}) or {}).get(persona)
turns_n = (m or {}).get("turns")
raw = data.get("result", "") or ""
try:
    output_full = json.loads(raw)
except Exception:
    output_full = {"_raw": raw}
turn_line = {
    "kind": "invocation",
    "ts": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "persona": persona, "task_slug": slug,
    "ticket_id": ct.get("ticket_id"), "round": ct.get("round"),
    "turn_index": turns_n,
    "input_meta": {"model": model, "effort": effort, "complexity": complexity,
                   "session_id": session_id, "ticket_file": ticket_file or None,
                   "task_body_chars": len(raw)},
    "wiki_consult": wiki_consult,  # populated when WIKI_CONSULT_JSON env was set by memory.md pre-search
    "output_full": output_full,
}
turns_dir = pathlib.Path(target_dir) / ".productune" / "turns"
turns_dir.mkdir(parents=True, exist_ok=True)
log_path = turns_dir / f"{slug}.jsonl"
with log_path.open("a", encoding="utf-8") as f:
    f.write(json.dumps(turn_line, ensure_ascii=False) + "\n")

print("CONFIDENCE=" + str(data.get("confidence")))
print("UNRESOLVED=" + json.dumps(data.get("unresolved", [])))
first_line = next((l.strip() for l in raw.splitlines() if l.strip()), "")
print("RESULT_ONELINE=" + first_line[:80])
print("TURN_LOG_PATH=" + str(log_path))
print(raw)
PY
rm -f "$OUT"

# Append one row to ticket's ## Persona Activity (PO mechanical write)
# TICKET_FILE, ROUND, TID must be set before invoking this template if appending.
# Skip silently if TICKET_FILE is unset or file doesn't exist.
if [ -n "${TICKET_FILE:-}" ] && [ -f "$TICKET_FILE" ]; then
  NOW=$(date -u +%FT%TZ)
  TURN=$(python3 -c "import json,pathlib; s=json.loads(pathlib.Path('$STATE').read_text()); print(s.get('current_task',{}).get('persona_session_meta',{}).get('$PERSONA',{}).get('turns',1))" 2>/dev/null || echo "?")
  RESULT_ONELINE="${RESULT_ONELINE:-}"
  printf "| %s | %s | %s/%s | %s | %s |\n" "$NOW" "$PERSONA" "$MODEL" "$EFFORT" "$TURN" "$RESULT_ONELINE" >> "$TICKET_FILE"
fi
```

> python3 here only: `claude --print` JSON `.result` may carry stray control chars; `json.loads` is forgiving. State writes use `jq`.
> `TICKET_FILE` = path to the current ticket's `.md`. Set it before the delegation block when a specific ticket is being worked. The `## Persona Activity` section in the ticket template has a comment marker so append lands in the right place.

After parse: inspect `CONFIDENCE` + `UNRESOLVED`. Low/non-empty → quality escalation (`escalation.md`).

---

## PRD delegation (Designer, clarity loop)

Stage 2A discovery done → delegate Round 1 PRD:

```bash
PERSONA=pdt-designer; SCOPE='draft Round 1 PRD with clarity loop A ≤ 0.05; emit tickets when ready'
MODEL=opus; EFFORT=max; COMPLEXITY=L7
BRIEF_PATH=$(jq -r '.current_task.input.brief_path // empty' "$STATE")
TASK="$USER_TEXT
(scope: $SCOPE)
(extended thinking budget: $EFFORT)
[ctx] $CTX
[brief] $BRIEF_PATH"
```

Designer returns:
```json
// needs-info — relay next_question to user
{"state":"needs-info","next_question":"어떤 기기/플랫폼이 1순위인가요?","missing_slot":"scope_boundary","ambiguity_score":0.18,"round":2}
// ready — PRD + tickets shipped
{"state":"ready","prd_path":"docs/prd/<slug>.md","tickets":["docs/tickets/r1/T-001.md"],
 "ambiguity_score":0.04,"slot_clarity":{},"confidence":0.92,"unresolved":[]}
```

PO loop:
1. Read `data.state`.
2. `needs-info` → print `next_question` (caveman lite, user's lang). Append user reply to `$BRIEF_PATH` (`printf >>`). Resume Designer.
3. `ready` → store `prd_path` in `current_task.prd_path`, push `tickets[]` into `artifacts`, route per `tickets.md`. PO may set initial lifecycle metadata/status for emitted tickets, but Designer remains owner of ticket content.

Hard cap: 5 `needs-info` rounds. 6th turn → resume body: `"finalize PRD with current state. Move unresolved into ## Open Questions."` Designer ships `ready` with `confidence < 0.7`.

---

## Plan mode (L4+ default)

L4+ goes **plan-first (dev opus/xhigh) → PO reviews → auto-accept impl (sonnet/high)**. PO is default reviewer. (Adapted from Boris Cherny's plan-review-1shot.)

**Trigger**: L≥4, multi-file/cross-cutting, risk flag (auth/payments/PII/migration/design-system/public-API), or user asks. L1–L3 trivials skip → straight sonnet/medium impl.

**Flow:**
1. Plan call — dev PLAN ONLY, opus/xhigh. Body starts `PLAN MODE — DO NOT WRITE CODE` + Goal/Constraints/Acceptance. `changed_files` must be empty.
2. PO review — testability + acceptance + architecture + risk. sonnet/medium routine, opus/high risk. Verdict: `OK` or `revise:[...]`.
3. Plan revise — resume same dev session, plan only, re-review. **3+ rounds** → surface (proceed / re-PRD / strong-implement).
4. Impl — dev sonnet/high, plan as task first line, `acceptEdits`. Self-verify mandatory.
5. Failure regress — Self-verify / QA fail after Path 1 retry → back to plan (opus/xhigh) + PO re-review. `escalation_triggered=true`, bump `actual_complexity`.

Optional cross-review (high-stakes): pdt-qa testability, pdt-designer UX/DS/copy.

**Trace** (L4): `→ planning 'X' (L4 → plan)` · `→ delegating pdt-developer (PLAN ONLY, opus/xhigh)` · `✓ plan returned` · `→ PO reviewing` · `✓ OK` · `→ delegating pdt-developer (impl, sonnet/high)`.

**Why explicit**: `claude --print` doesn't auto-engage plan mode; task-body `PLAN MODE — DO NOT WRITE CODE` is the only non-interactive enforcement.
