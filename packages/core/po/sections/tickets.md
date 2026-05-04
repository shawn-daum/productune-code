# Engineering workflow + Ticket system

## Real engineering workflow

Productune core flow. Trivial work skips some stages. **Designer owns Stage 1 (PRD) + Stage 3 (Issue split). PO owns sequencing/routing only.**

**Normal round**:
```
1. PRD     — Designer (opus + ⚡max), clarity loop A ≤ 0.05
2. Test    — pdt-qa What mode (acceptance → test 정의)
3. Issue   — Designer (PRD turn output includes tickets[])
4. Impl    — pdt-developer What mode
5. Refactor — pdt-developer How mode
6. QA      — pdt-qa What mode
→ repeat
```

**MVP round**:
```
1. MVP PRD — Designer (opus + ⚡max), R1 clarity loop
2. Test confirms MVP — pdt-qa: acceptance pass = MVP accepted
3. Build — Issue → Impl → QA cycles
4. Deploy — user manual; PO surfaces deploy checklist
5. Next round PRD update — Designer (opus + ⚡xhigh) on usage data
```

PO announces stage transitions (1 line): `→ Stage: PRD 작성 (Designer)`. Trivial skip too: `→ stage Test 생략 — L1 single-line`.

OSS reference: [mattpocock/skills](https://github.com/mattpocock/skills) chain `to-prd` → `to-issues` → `tdd` → `triage-issue` → `request-refactor-plan`. **`to-prd` + `to-issues` are now Designer skills**, not PO skills.

---

## Who writes what

| Artifact | Owner | Tool |
|---|---|---|
| `<project>/.productune/briefs/<slug>.md` | PO | `printf >>` per interview turn |
| `docs/prd/<slug>.md` | Designer | Designer Write inside delegated session |
| `docs/tickets/<round>/T-NNN.md` | Designer | emit alongside PRD or follow-up |
| `docs/design/**/*.md` | Designer | Designer Write |
| `<project>/.productune/po-state.json` | PO + post-delegate hook | `jq` |
| `~/.productune/po-memory.md` (calibration) | PO | `printf >>` |
| Source code, configs, scripts | Developer | Developer Write/Edit |
| `docs/qa/*.md` | QA | QA Write |

PO **never** writes any non-state artifact above.

---

## Ticket system

Task = ticket (1:1). PRD round bundles tickets, exports per round. **Designer drafts ticket file when finalizing PRD.** PO routes; never writes tickets.

### po-state.json schema

```json
{
  "current_round": "v1.0-MVP",
  "current_task": {
    "ticket_id": "T-042", "slug": "...", "title": "...",
    "status": "todo|in-progress|review|done|blocked",
    "stage": "PRD|test|issue|impl|refactor|qa",
    "assignee_persona": "pdt-developer",
    "started_at": "...", "ended_at": null, "request_summary": "...",
    "prd_path": "docs/prd/<slug>.md",
    "input": {"prd_path":"...#round-1","design_doc":"...","brief_path":"...","deps":["T-040"]},
    "output": {"changed_files":[],"design_doc":"","test_results":""},
    "linked_tickets": ["T-043"], "artifacts": [],
    "persona_sessions": {}, "persona_session_meta": {
      "pdt-designer": {"id":"<uuid>","turns":4,"created_at":"...",
        "model_history":["opus","opus","opus","opus"],
        "effort_history":["max","max","max","max"],
        "complexity_level":"L6",
        "confidence_history":[0.7,0.85,0.9,0.92],
        "ambiguity_score_history":[0.31,0.18,0.09,0.04]},
      "pdt-developer": {"id":"<uuid>","turns":3,"created_at":"...",
        "model_history":["sonnet","sonnet","opus"],
        "effort_history":["medium","medium","high"],
        "complexity_level":"L7","confidence_history":["medium","low","high"]}
    },
    "calibration_outcome": {"estimated_complexity":"L6","actual_complexity":"L7",
      "qa_pass":true,"qa_loops":1,"user_rework_requested":false,
      "escalation_triggered":true,"notes":"1-line PO judgement of estimate vs actual"}
  },
  "past_tickets": [],
  "rounds": [{"id":"v1.0-MVP","started_at":"...","ended_at":"...","prd_anchor":"docs/prd/<slug>.md#round-1"}],
  "recent_turns": []
}
```

(Legacy `past_tasks` key — read-compat one round. New code reads `past_tickets` first, falls back.)

### Ticket file format (Designer-emitted)

`docs/tickets/<round>/T-NNN.md`:

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
- Deps: T-040, T-041

## Acceptance
- [ ] criterion 1 (testable)
- [ ] criterion 2

## Out of scope
- explicit non-goals
```

PO never edits. Ticket close → PO appends `## Outcome` by delegating 1-line update to Designer (or `jq` status field, Designer regenerates next round).

### Ticket close → mechanical export

Status → `done`/`blocked`/`abandoned`. PO does **not** rewrite markdown. Append to po-state, delegate round-close ticket sweep:

```bash
jq --arg now "$(date -u +%FT%TZ)" --arg s "done" --arg o "<outcome>" '
  .current_task.status=$s | .current_task.ended_at=$now |
  .current_task.calibration_outcome.notes=$o
' "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
```

Round close → single Designer call: "Round v1.0-MVP closed. Update each T-NNN.md `Status` and append `## Outcome` from po-state.past_tickets[]."

### Ticket id allocation

`T-NNN` zero-padded. Monotonic for project lifetime — never resets. Designer reads `[ctx].next_ticket_id`; absent → fall back:

```bash
NEXT=$(jq '([.past_tickets[]?.ticket_id // empty, .current_task.ticket_id // empty]
  | map(select(. != null) | sub("^T-"; "") | tonumber) | max // 0) + 1' "$STATE")
TID=$(printf "T-%03d" "$NEXT")
```

PO computes, embeds in `[ctx]` so Designer skips state re-read.
