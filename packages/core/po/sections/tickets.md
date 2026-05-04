# Engineering workflow + Ticket system

## Real engineering workflow

Productune core flow. Trivial work skips some stages. **Designer owns Stage 1 (PRD) + Stage 3 (Issue split/content). PO owns sequencing/routing + ticket lifecycle state.**

**Normal round**:
```
1. PRD     — Designer (opus + ⚡max), clarity loop A ≤ 0.05
2. Design  — Designer (opus + high)
             L4+ or user-facing or risk_flags → mandatory
             L1–L3 trivial → PO: `→ stage Design 생략 — L<n> trivial` + skip
             산출물 4종 (각 별도 티켓, Designer 발행):
               a. Design System  → docs/design/<slug>/system.md
               b. UX Flow (Mermaid, 전체 화면 전환 구조) → docs/design/<slug>/flow.md
               c. Wireframe (Excalidraw, 핵심 화면 a few) → docs/design/<slug>/screens/*.excalidraw.json
               d. Hi-fi mockup (HTML/CSS 정적 프리뷰, 핵심 화면 a few) → docs/design/<slug>/mockups/*.html
             PRD ready 후 PO: design 티켓 4개 자동 발행 → Designer 위임 → 사용자 승인 → Build 진입
3. Test    — pdt-qa What mode (acceptance → test 정의)
4. Issue   — Designer (PRD turn output includes tickets[])
5. Impl    — pdt-developer What mode (design 산출물을 Inputs에 reference 필수)
6. Refactor — pdt-developer How mode
7. QA      — pdt-qa What mode
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
| `docs/tickets/<round>/T-NNN.md` content/body/AC | Designer | emit alongside PRD or follow-up |
| `docs/tickets/<round>/T-NNN.md` lifecycle frontmatter/status | PO | mechanical metadata/status updates only |
| `docs/design/**/*.md` | Designer | Designer Write |
| `<project>/.productune/po-state.json` | PO + post-delegate hook | `jq` |
| `~/.productune/po-memory.md` (calibration) | PO | `printf >>` |
| Source code, configs, scripts | Developer | Developer Write/Edit |
| `docs/qa/*.md` | QA | QA Write |

PO **never** writes authored product content. Ticket lifecycle/frontmatter updates are treated as management state, not product authoring. If a status update reveals that product scope, body, or acceptance criteria must change, PO delegates that content change to Designer.

### PO mechanical write 허용 범위 (화이트리스트)

| T-NNN.md 항목 | PO 직접 가능 | 수단 |
|---|---|---|
| frontmatter: `status`, `started_at`, `completed_at`, `duration_min`, `assignee`, `stage`, `estimated_complexity`, `risk_flags`, routing/model/effort meta | ✅ | sed/awk/perl/printf |
| Mirrored header status line (예: `**Status**: in-progress`) | ✅ | sed mechanical |
| `## Persona Activity` 표 — 1행 append-only (structured, ≤80자 Result) | ✅ | printf append |
| `## Request`, `## Inputs`, `## Acceptance`, `## Out of scope` body | ❌ Designer | delegate |
| `## Outcome` narrative | ❌ Designer | round-close 위임 |
| Title 실질적 변경 | ❌ Designer | delegate |

**PO 거절 2-line template** (content 변경 요청 시 항상):
```
[PO] 콘텐츠 변경(<무엇>)은 Designer 위임 필요. 진행할까요?
[PO] (lifecycle 메타 / Persona Activity는 직접 가능 — 이건 콘텐츠 변경이라 위임)
```

---

## Ticket system

Task = ticket (1:1). PRD round bundles tickets, exports per round. **Designer drafts ticket file and owns ticket content when finalizing PRD.** PO routes and owns lifecycle operations: status transitions, timestamps, assignee/routing metadata, progress tracking, blocked/review/done transitions, status backfill, and archive/reference sync with `po-state`.

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
<!-- PO managed, append-only, structured — Result ≤ 80 chars -->
| When | Persona | Model/Effort | Turn | Result |
|---|---|---|---|---|
```

Designer owns all sections below frontmatter plus mirrored content fields that define product scope (`Request`, `Acceptance`, `Out of scope`, PRD/design inputs). PO may update lifecycle/status metadata, mirrored header status line, and `## Persona Activity` table rows mechanically — see **PO mechanical write 허용 범위** table above.

PO must not edit ticket body, request, acceptance criteria, out-of-scope, product/design details, or substantive title changes. If lifecycle work requires those edits, delegate to Designer. Use the 2-line refusal template (above) when declining — always specify whether the requested change is lifecycle (OK) or content (delegate).

### Ticket close → mechanical export

Status → `done`/`blocked`/`abandoned`. PO updates lifecycle metadata in `po-state` and ticket frontmatter/status fields; PO does **not** rewrite product content.

```bash
jq --arg now "$(date -u +%FT%TZ)" --arg s "done" --arg o "<outcome>" '
  .current_task.status=$s | .current_task.ended_at=$now |
  .current_task.calibration_outcome.notes=$o
' "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
```

Mechanical ticket metadata update rules:

- `todo → in-progress`: set `started_at` if empty.
- `in-progress|review → done|blocked|abandoned`: set `completed_at`; compute `duration_min` when `started_at` exists.
- `review`/`blocked`/`done` transitions: update `status` in frontmatter and mirrored header line.
- `assignee`, `model`, `effort`, routing/session refs: update only metadata/frontmatter/progress fields.
- Product outcome narrative (`## Outcome`) is content. PO may add a terse lifecycle reference to `po-state`/archive metadata, but if an outcome summary needs product meaning, delegate to Designer.

Round close → PO can run a mechanical status/backfill sweep. If any ticket needs content outcome text, single Designer call: "Round v1.0-MVP closed. Append `## Outcome` summaries from po-state.past_tickets[] without changing scope/AC."

### Ticket id allocation

`T-NNN` zero-padded. Monotonic for project lifetime — never resets. Designer reads `[ctx].next_ticket_id`; absent → fall back:

```bash
NEXT=$(jq '([.past_tickets[]?.ticket_id // empty, .current_task.ticket_id // empty]
  | map(select(. != null) | sub("^T-"; "") | tonumber) | max // 0) + 1' "$STATE")
TID=$(printf "T-%03d" "$NEXT")
```

PO computes, embeds in `[ctx]` so Designer skips state re-read.
