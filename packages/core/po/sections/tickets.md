# Engineering workflow + Ticket system

## Real engineering workflow

Trivial work skips stages. **Designer owns Stage 1 (PRD) + Stage 3 (Issue split/content). PO owns sequencing/routing + ticket lifecycle state.**

**Normal round**:
```
1. PRD     — Designer (opus + ⚡max), clarity loop A ≤ 0.05
2. Design  — Designer (opus + high)
             L4+ / user-facing / risk_flags → mandatory; L1–L3 trivial → skip
             산출물 4종 (each separate ticket, Designer emits):
               a. Design System  → docs/design/<slug>/system.md
               b. UX Flow Mermaid → docs/design/<slug>/flow.md
               c. Wireframe Excalidraw → docs/design/<slug>/screens/*.excalidraw.json
               d. Hi-fi mockup HTML/CSS → docs/design/<slug>/mockups/*.html
             PRD ready → PO auto-emits 4 design tickets → Designer → user approval → Build
3. Test    — pdt-qa (acceptance → test definition)
4. Issue   — Designer (PRD turn output includes tickets[])
5. Impl    — pdt-developer (design 산출물 Inputs reference 필수)
6. Refactor — pdt-developer
7. QA      — pdt-qa
→ repeat
```

**MVP round**: 1. MVP PRD (opus + ⚡max, R1 clarity) · 2. QA acceptance = MVP accepted · 3. Build (Issue → Impl → QA cycles) · 4. Deploy (user manual; PO surfaces checklist) · 5. Next round PRD update (opus + ⚡xhigh on usage data).

PO announces stage transitions (1 line): `→ Stage: PRD 작성 (Designer)`. Trivial skip: `→ stage Test 생략 — L1 single-line`.

OSS ref: [mattpocock/skills](https://github.com/mattpocock/skills) — `to-prd` + `to-issues` are now Designer skills.

---

## Who writes what

| Artifact | Owner | Tool |
|---|---|---|
| `<project>/.productune/briefs/<slug>.md` | PO | `printf >>` |
| `docs/prd/<slug>.md` | Designer | inside delegated session |
| `docs/tickets/<round>/T-NNN.md` body/AC | Designer | emit alongside PRD |
| `docs/tickets/<round>/T-NNN.md` lifecycle frontmatter/status | PO | mechanical |
| `docs/design/**/*.md` | Designer | Designer Write |
| `<project>/.productune/po-state.json` | PO + post-delegate hook | `jq` |
| `~/.productune/po-memory.md` (calibration) | PO | `printf >>` |
| Source code, configs, scripts | Developer | Developer Write/Edit |
| `docs/qa/*.md` | QA | QA Write |

PO **never** writes authored content. Lifecycle/frontmatter = state, not authoring. If status update reveals product scope must change, delegate to Designer.

### PO mechanical write whitelist

| T-NNN.md item | PO direct |
|---|---|
| frontmatter: `status`, `started_at`, `completed_at`, `duration_min`, `assignee`, `stage`, `estimated_complexity`, `risk_flags`, `branch`, `worktree_path`, routing/model/effort meta | ✅ sed/awk/perl/printf |
| Mirrored header status line | ✅ sed |
| `## Persona Activity` table — 1-row append-only (≤80 char Result) | ✅ printf |
| `## Request`, `## Inputs`, `## Acceptance`, `## Out of scope` body | ❌ Designer |
| `## Outcome` narrative | ❌ Designer (round-close) |
| Title substantive change | ❌ Designer |

**PO refusal 2-line template** (on content-change request):
```
[PO] 콘텐츠 변경(<무엇>)은 Designer 위임 필요. 진행할까요?
[PO] (lifecycle 메타 / Persona Activity는 직접 가능 — 이건 콘텐츠 변경이라 위임)
```

`branch` / `worktree_path` auto-filled by git-workflow (Phase 4 R2) at ticket open.

---

## Ticket system

Task = ticket (1:1). PRD round bundles tickets, exports per round. **Designer drafts ticket file, owns content.** PO routes + owns lifecycle: status transitions, timestamps, assignee/routing meta, progress, archive sync with `po-state`.

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
    "branch": "feature/T-042/<slug-kebab>",
    "worktree_path": "<project>/.productune/worktrees/T-042/",
    "input": {"prd_path":"...","design_doc":"...","brief_path":"...","deps":["T-040"]},
    "output": {"changed_files":[],"design_doc":"","test_results":""},
    "linked_tickets": ["T-043"], "artifacts": [],
    "persona_sessions": {},
    "persona_session_meta": {
      "pdt-designer": {"id":"<uuid>","turns":4,"model_history":["opus"],"effort_history":["max"],
        "complexity_level":"L6","confidence_history":[0.7,0.92],"ambiguity_score_history":[0.31,0.04]},
      "pdt-developer": {"id":"<uuid>","turns":3,"model_history":["sonnet","opus"],
        "effort_history":["medium","high"],"complexity_level":"L7","confidence_history":["high"]}
    },
    "calibration_outcome": {"estimated_complexity":"L6","actual_complexity":"L7",
      "qa_pass":true,"qa_loops":1,"user_rework_requested":false,
      "escalation_triggered":true,"notes":"1-line PO judgement"}
  },
  "past_tickets": [],
  "rounds": [{"id":"v1.0-MVP","started_at":"...","ended_at":"...","prd_anchor":"docs/prd/<slug>.md#round-1"}],
  "recent_turns": []
}
```

(Legacy `past_tasks` — read-compat one round. New code reads `past_tickets` first.)

### Ticket file format (Designer-emitted, PO-lifecycle-managed)

`docs/tickets/<round>/T-NNN.md`:

```markdown
---
ticket_id: T-042
round: v1.0-MVP
stage: impl
status: todo
assignee: pdt-developer
created_at: 2026-MM-DDTHH:MM:SSZ
started_at: null
completed_at: null
duration_min: null
estimated_complexity: L<n>
risk_flags: <auth|payments|migration|none>
branch: null                 # set by git-workflow on ticket open (Phase 4 R2)
worktree_path: null
---

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

## Persona Activity
<!-- PO managed, append-only — Result ≤ 80 chars -->
| When | Persona | Model/Effort | Turn | Result |
|---|---|---|---|---|
```

Designer owns scope-defining fields. PO updates lifecycle/status meta + mirrored header + Persona Activity rows mechanically (whitelist above). If lifecycle work requires content edits, delegate.

### Ticket close → mechanical export

```bash
jq --arg now "$(date -u +%FT%TZ)" --arg s "done" --arg o "<outcome>" '
  .current_task.status=$s | .current_task.ended_at=$now |
  .current_task.calibration_outcome.notes=$o
' "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
```

Mechanical rules:
- `todo → in-progress`: set `started_at` if empty.
- `in-progress|review → done|blocked|abandoned`: set `completed_at`; compute `duration_min` if `started_at` exists.
- Status transitions: update frontmatter + mirrored header.
- `assignee`, routing/session refs: metadata only.
- `branch` / `worktree_path`: set on open; do not delete on close (history).
- `## Outcome` = content. Delegate if product meaning needed.

Round close → mechanical status/backfill sweep. Outcome text needed → single Designer call: `"Round v1.0-MVP closed. Append ## Outcome summaries from past_tickets[] without changing scope/AC."`

### Ticket id allocation

`T-NNN` zero-padded. Monotonic, never resets. Designer reads `[ctx].next_ticket_id`; absent → fall back:

```bash
NEXT=$(jq '([.past_tickets[]?.ticket_id // empty, .current_task.ticket_id // empty]
  | map(select(. != null) | sub("^T-"; "") | tonumber) | max // 0) + 1' "$STATE")
TID=$(printf "T-%03d" "$NEXT")
```

PO computes, embeds in `[ctx]` so Designer skips state re-read.
