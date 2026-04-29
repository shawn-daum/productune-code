# Engineering workflow + Ticket system

## Real Engineering workflow

Productune's core flow. Every task goes through these stages, but trivial work may skip some:

**Normal round**:
```
1. PRD     (problem definition)        — productune Why mode
2. Test    (validation criteria)       — pdt-qa What mode (acceptance criteria → test 정의)
3. Issue   (decomposition into tickets) — productune How mode
4. Impl    (implementation)             — pdt-developer What mode
5. Refactor (continuous improvement)    — pdt-developer How mode
6. QA      (verification)               — pdt-qa What mode
→ repeat
```

**MVP round**:
```
1. MVP PRD                              — productune Why-essential (opus + ⚡xhigh)
2. Test confirms MVP                    — acceptance test pass = MVP accepted
3. Build the actual product             — Issue → Impl → QA cycles
4. Deploy                               — user manual; PO surfaces deploy checklist
5. Next round PRD update                — usage data / feedback → new PRD round
```

Announce each stage transition to user (one line): "→ Stage: PRD 작성", "→ Stage: Test 정의". For trivial work, announce skip too: "→ stage Test 생략 — trivial single-line change".

OSS reference: [mattpocock/skills](https://github.com/mattpocock/skills) chain `to-prd` → `to-issues` → `tdd` → `triage-issue` → `request-refactor-plan` is the baseline.

---

## Ticket system

Task = ticket (1:1). PRD round bundles tickets and exports per round.

### po-state.json schema (extended)

```json
{
  "current_round": "v1.0-MVP",
  "current_task": {
    "ticket_id": "T-042",
    "slug": "...",
    "title": "...",
    "status": "todo|in-progress|review|done|blocked",
    "stage": "PRD|test|issue|impl|refactor|qa",
    "assignee_persona": "pdt-developer",
    "started_at": "...", "ended_at": null,
    "request_summary": "...",
    "input": {
      "prd_path": "docs/prd/productune.md#round-1",
      "design_doc": "docs/design/...md",
      "deps": ["T-040", "T-041"]
    },
    "output": {
      "changed_files": [...],
      "design_doc": "...",
      "test_results": "..."
    },
    "linked_tickets": ["T-043", "T-044"],
    "artifacts": [...],
    "persona_sessions": {...},
    "persona_session_meta": {
      "pdt-developer": {
        "id": "<uuid>", "turns": 3, "created_at": "...",
        "model_history": ["sonnet", "sonnet", "opus"],
        "effort_history": ["medium", "medium", "high"],
        "complexity_level": "L7",
        "confidence_history": ["medium", "low", "high"]
      }
    },
    "calibration_outcome": {
      "estimated_complexity": "L6",
      "actual_complexity": "L7",
      "qa_pass": true,
      "qa_loops": 1,
      "user_rework_requested": false,
      "escalation_triggered": true,
      "notes": "1-line PO judgement of why estimate vs actual diverged"
    }
  },
  "past_tickets": [...],
  "rounds": [
    {"id": "v1.0-MVP", "started_at": "...", "ended_at": "...", "prd_anchor": "docs/prd/productune.md#round-1"}
  ],
  "recent_turns": [...]
}
```

(Legacy `past_tasks` key remains compatible for one round — new code reads `past_tickets` first, falls back to `past_tasks`.)

### Ticket close → mechanical export

When ticket status transitions to `done`/`blocked`/`abandoned`, PO auto-exports:

```bash
ROUND="$(jq -r '.current_round // "uncategorized"' "$STATE")"
TID="$(jq -r '.current_task.ticket_id' "$STATE")"
mkdir -p "docs/tickets/$ROUND"
jq '.current_task' "$STATE" > "docs/tickets/$ROUND/$TID.md.json"
# convert to markdown — short metadata block + summary + outcome
```

Markdown export structure:
```markdown
# T-042: <title>

**Round**: v1.0-MVP  **Stage**: impl  **Status**: done  **Assignee**: pdt-developer
**Period**: 2026-04-28 14:30 – 2026-04-28 15:10

## Request
<request_summary>

## Inputs
- PRD: docs/prd/productune.md#round-1
- Design: docs/design/...md
- Deps: T-040, T-041

## Outputs
- Changed files: ...
- Test results: ...

## Linked tickets
- T-043, T-044

## Outcome
<outcome_summary 1-2 sentence>
```

These markdowns become the backend for Phase 3 UI dashboard (CLI: jq + grep; UI: file watcher or SQLite import).

### Ticket id allocation

`ticket_id = "T-" + zero-padded counter`. Counter doesn't reset between rounds — monotonic for project lifetime:

```bash
NEXT=$(jq '
  ([.past_tickets[]?.ticket_id // empty,
    .current_task.ticket_id // empty]
   | map(select(. != null) | sub("^T-"; "") | tonumber) | max // 0) + 1
' "$STATE")
TID=$(printf "T-%03d" "$NEXT")
```
