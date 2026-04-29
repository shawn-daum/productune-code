# Engineering workflow + Ticket system

## Real Engineering workflow

Productune's core flow. Every task goes through these stages, but trivial work may skip some. **Designer owns Stage 1 (PRD) and Stage 3 (Issue split). PO owns sequencing and routing only.**

**Normal round**:
```
1. PRD     (problem definition)         — Designer (opus + ⚡max), clarity loop A ≤ 0.05
2. Test    (validation criteria)        — pdt-qa What mode (acceptance criteria → test 정의)
3. Issue   (decomposition into tickets) — Designer (output of PRD turn includes tickets[])
4. Impl    (implementation)             — pdt-developer What mode
5. Refactor (continuous improvement)    — pdt-developer How mode
6. QA      (verification)               — pdt-qa What mode
→ repeat
```

**MVP round**:
```
1. MVP PRD                              — Designer (opus + ⚡max), Round 1 clarity loop
2. Test confirms MVP                    — pdt-qa: acceptance test pass = MVP accepted
3. Build the actual product             — Issue → Impl → QA cycles
4. Deploy                               — user manual; PO surfaces deploy checklist
5. Next round PRD update                — Designer (opus + ⚡xhigh) on usage data / feedback
```

PO announces each stage transition to user (one line): "→ Stage: PRD 작성 (Designer)", "→ Stage: Test 정의 (pdt-qa)". For trivial work, announce skip too: "→ stage Test 생략 — L1 single-line change".

OSS reference: [mattpocock/skills](https://github.com/mattpocock/skills) chain `to-prd` → `to-issues` → `tdd` → `triage-issue` → `request-refactor-plan`. **`to-prd` and `to-issues` are now Designer skills**, not PO skills.

---

## Who writes what

| Artifact | Owner | Tool |
|---|---|---|
| `<project>/.productune/briefs/<slug>.md` | PO | `printf >> brief` after each interview turn |
| `docs/prd/<slug>.md` | Designer | Designer's Write inside delegated session |
| `docs/tickets/<round>/T-NNN.md` | Designer | emitted alongside PRD or in follow-up turn |
| `docs/design/**/*.md` | Designer | Designer Write |
| `<project>/.productune/po-state.json` | PO + post-delegate hook | `jq` |
| `~/.productune/po-memory.md` (calibration) | PO | `printf >>` |
| Source code, configs, scripts | Developer | Developer Write/Edit |
| `docs/qa/*.md` | QA | QA Write |

PO **never** writes any of the non-state artifacts above.

---

## Ticket system

Task = ticket (1:1). PRD round bundles tickets and exports per round. **Designer drafts the ticket file when finalizing the PRD.** PO routes them; PO never writes tickets.

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
    "prd_path": "docs/prd/<slug>.md",
    "input": {
      "prd_path": "docs/prd/<slug>.md#round-1",
      "design_doc": "docs/design/...md",
      "brief_path": ".productune/briefs/<slug>.md",
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
      "pdt-designer": {
        "id": "<uuid>", "turns": 4, "created_at": "...",
        "model_history": ["opus", "opus", "opus", "opus"],
        "effort_history": ["max", "max", "max", "max"],
        "complexity_level": "L6",
        "confidence_history": [0.7, 0.85, 0.9, 0.92],
        "ambiguity_score_history": [0.31, 0.18, 0.09, 0.04]
      },
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
    {"id": "v1.0-MVP", "started_at": "...", "ended_at": "...", "prd_anchor": "docs/prd/<slug>.md#round-1"}
  ],
  "recent_turns": [...]
}
```

(Legacy `past_tasks` key remains compatible for one round — new code reads `past_tickets` first, falls back to `past_tasks`.)

### Ticket file format (Designer-emitted)

Designer's PRD turn writes one file per ticket at `docs/tickets/<round>/T-NNN.md`:

```markdown
# T-042: <title>

**Round**: v1.0-MVP  **Stage**: impl  **Status**: todo  **Assignee**: pdt-developer
**PRD anchor**: docs/prd/<slug>.md#<section>
**Estimated complexity**: L<n>  **Risk flags**: <auth|payments|migration|none>

## Request
<single paragraph: what to build, why, in what context>

## Inputs
- PRD: docs/prd/<slug>.md#<section>
- Design: docs/design/<slug>/<file>.md  *(if exists)*
- Deps: T-040, T-041  *(blocking tickets)*

## Acceptance
- [ ] criterion 1 (testable)
- [ ] criterion 2

## Out of scope
- explicit non-goals to prevent scope drift
```

PO never edits this. On ticket close, PO appends an `## Outcome` section by delegating a 1-line update task to Designer (or by jq-ing a status field in po-state and letting Designer regenerate on next round).

### Ticket close → mechanical export

When ticket status transitions to `done`/`blocked`/`abandoned`, PO does **not** rewrite the markdown. Instead it appends to po-state and later delegates the round-close ticket sweep to Designer:

```bash
# PO snapshot of done tickets to state — Designer will reconcile on round close
jq --arg now "$(date -u +%FT%TZ)" --arg s "done" --arg o "<outcome>" '
  .current_task.status = $s | .current_task.ended_at = $now |
  .current_task.calibration_outcome.notes = $o
' "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
```

When the round closes, PO delegates a single Designer call: "Round v1.0-MVP closed. Update each T-NNN.md `Status` and append `## Outcome` from po-state.past_tickets[]." Designer writes; PO does not.

### Ticket id allocation

`ticket_id = "T-" + zero-padded counter`. Counter doesn't reset between rounds — monotonic for project lifetime. Designer reads from `[ctx]` to pick next id; if `[ctx]` doesn't include `next_ticket_id`, fall back:

```bash
NEXT=$(jq '
  ([.past_tickets[]?.ticket_id // empty,
    .current_task.ticket_id // empty]
   | map(select(. != null) | sub("^T-"; "") | tonumber) | max // 0) + 1
' "$STATE")
TID=$(printf "T-%03d" "$NEXT")
```

PO computes this and embeds in `[ctx]` as `next_ticket_id` so Designer doesn't re-read state.
