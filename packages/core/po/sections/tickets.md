# Engineering workflow + Ticket system

Two axes — keep separate:
- **Layer A — Version Cycle Phases** (시간 축, ticket 아닌 단계 포함)
- **Layer B — Ticket Type / `stage` enum** (분류 축, 개별 ticket의 종류)

Layer A 가 Layer B 를 호출 (어느 phase에서 어떤 stage ticket을 emit하는지).

## Naming convention

| 맥락 | 표기 | 예 |
|---|---|---|
| prose / 산문 | capitalized 역할명 | `PO`, `Designer`, `Developer`, `QA` |
| code / agent ID / 명령어 / frontmatter `assignee:` | `pdt-` prefix | `pdt-po`, `pdt-designer`, `pdt-developer`, `pdt-qa` |

---

## Layer A — Version Cycle Phases

```
Phase 1. Discovery     — PO (인터뷰 → brief)              [no ticket]
Phase 2. PRD           — Designer (clarity loop A ≤ 0.05) [no ticket — PRD = doc]
                         opus + ⚡max for Version 1; opus + ⚡xhigh for V2+ updates
Phase 3. Design        — Designer self-execute            [stage:design ticket × 4]
                         L4+ / user-facing / risk_flags → mandatory
                         L1–L3 trivial → skip
                         산출물 4종:
                           a. Design System  → docs/design/<slug>/system.md
                           b. UX Flow Mermaid → docs/design/<slug>/flow.md
                           c. Wireframe Excalidraw → docs/design/<slug>/screens/*.excalidraw.json
                           d. Hi-fi mockup HTML/CSS → docs/design/<slug>/mockups/*.html
                         → user gate before Phase 4
Phase 4. Build         — ticket execution
                         · stage:impl     (필수, Developer + auto QA smoke gate)
                         · stage:refactor (선택, Developer + auto QA smoke gate)
                         · stage:test     (조건부, QA — L≥6 / risk-flagged / 명시 요청 시)
                         · stage:qa       (독립 QA work만 — regression / deploy verify 등)
Phase 5. Version close — calibration + outcome            [no ticket]
                         (PDS See stage 자리 — Phase B에서 보강 예정)
```

PO announces phase transition (1 line): `→ Phase 3 Design 진입 (Designer)`. Trivial skip: `→ Phase 3 생략 — L<n> trivial`.

**MVP cycle (Version 1)**: Discovery → MVP PRD (opus + ⚡max, R1 clarity) → Design (조건부) → Build cycles → Deploy (user manual; PO surfaces checklist) → Version close → next Version PRD update on usage data.

OSS ref: [mattpocock/skills](https://github.com/mattpocock/skills) — `to-prd` + `to-issues` are now Designer skills.

---

## Layer B — `stage` enum

| stage | assignee | 자동 QA smoke gate | 언제 (어느 Phase) |
|---|---|---|---|
| `design` | `pdt-designer` | n/a | Phase 3 |
| `impl` | `pdt-developer` | **ON** | Phase 4 (필수) |
| `refactor` | `pdt-developer` | **ON** | Phase 4 (선택) |
| `test` | `pdt-qa` | n/a (자기 자체가 test 정의) | Phase 4 (조건부) |
| `qa` | `pdt-qa` | n/a (자기 자체가 QA work) | Phase 4 (독립 QA work) |

frontmatter `stage:` 값은 위 5개 enum 중 하나.

**Status (lifecycle)** ≠ `stage`. status는 ticket의 진행 상태:
```
todo → in-progress → review → done | blocked | abandoned
```
같은 ticket이 stage는 고정, status만 변함. 시각화 시 두 축 다 표시.

### 자동 QA smoke gate (Developer ticket close 조건)

`stage:impl` / `stage:refactor` ticket이 close (`done`) 되려면 자동 QA smoke 통과 필수. user 가 routing 깨짐 / page 안 뜸 / console error 같은 user-facing 깨짐을 직접 보지 않도록.

- **Tool**: Playwright / Chromium MCP / headless browser (allowlist 내). UI 없는 dev 변경은 build/typecheck/관련 unit test만 실행.
- **Coverage**: route 로딩, basic navigation, console error 없음, Acceptance 의 testable 항목 1차 확인.
- **Time budget**: ≤ 1분. full test plan 아님.
- **Fail loop**: dev resume + fail excerpt → 최대 3회. 넘으면 `blocked` + user surface.
- **Pass**: ticket `done` 허용. Persona Activity 에 1행 기록.

`stage:test` / `stage:qa` ticket은 그 자체가 QA work이므로 추가 gate 없음 (자기 자신이 gate).

---

## Who writes what

| Artifact | Owner | Tool |
|---|---|---|
| `<project>/.productune/briefs/<slug>.md` | PO | `printf >>` |
| `docs/prd/<slug>.md` | Designer | inside delegated session |
| `docs/tickets/<version>/T-NNN.md` body/AC | Designer | emit alongside PRD |
| `docs/tickets/<version>/T-NNN.md` lifecycle frontmatter/status | PO | mechanical |
| `docs/design/**/*.md` | Designer | Designer Write |
| `<project>/.productune/po-state.json` | PO + post-delegate hook | `jq` |
| `~/.productune/po-memory.md` (calibration) | PO | `printf >>` |
| Source code, configs, scripts | Developer | Developer Write/Edit |
| `docs/qa/*.md` | QA | QA Write |

PO **never** writes authored content. Lifecycle/frontmatter = state, not authoring.

### PO mechanical write whitelist

| T-NNN.md item | PO direct |
|---|---|
| frontmatter: `status`, `started_at`, `completed_at`, `duration_min`, `assignee`, `stage`, `estimated_complexity`, `risk_flags`, `branch`, `worktree_path`, routing/model/effort meta | ✅ sed/awk/perl/printf |
| Mirrored header status line | ✅ sed |
| `## Persona Activity` table — 1-row append-only (≤80 char Result) | ✅ printf |
| `## Request`, `## Inputs`, `## Acceptance`, `## Out of scope` body | ❌ Designer |
| `## Outcome` narrative | ❌ Designer (Version close) |
| Title substantive change | ❌ Designer |

**PO refusal 2-line template** (on content-change request):
```
[PO] 콘텐츠 변경(<무엇>)은 Designer 위임 필요. 진행할까요?
[PO] (lifecycle 메타 / Persona Activity는 직접 가능 — 이건 콘텐츠 변경이라 위임)
```

`branch` / `worktree_path` auto-filled by git-workflow (Phase 4 R2) at ticket open.

---

## Ticket system

Task = ticket (1:1). One PRD per Version; Version bundles its tickets, exported per Version. **Designer drafts ticket file, owns content.** PO routes + owns lifecycle: status transitions, timestamps, assignee/routing meta, progress, archive sync with `po-state`.

### po-state.json schema

```json
{
  "current_version": "v1.0-MVP",
  "current_task": {
    "ticket_id": "T-042", "slug": "...", "title": "...",
    "status": "todo|in-progress|review|done|blocked",
    "stage": "design|impl|refactor|test|qa",
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
  "versions": [{"id":"v1.0-MVP","started_at":"...","ended_at":"...","prd_anchor":"docs/prd/<slug>.md#version-1"}],
  "recent_turns": []
}
```

(Legacy `past_tasks` + `current_round` / `rounds[]` + `stage:PRD|issue` — read-compat one cycle. New code reads `past_tickets` / `current_version` / `versions[]` / 5-value `stage` enum first; falls back to legacy keys when absent.)

### Ticket file format (Designer-emitted, PO-lifecycle-managed)

`docs/tickets/<version>/T-NNN.md`:

```markdown
---
ticket_id: T-042
version: v1.0-MVP
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

**Version**: v1.0-MVP  **Stage**: impl  **Status**: todo  **Assignee**: pdt-developer
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

Designer owns scope-defining fields. PO updates lifecycle/status meta + mirrored header + Persona Activity rows mechanically. If lifecycle work requires content edits, delegate.

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
- `stage:impl` / `stage:refactor` ticket이 `done` 되려면 자동 QA smoke pass 필수 (위 Layer B 참조). fail 3회 누적 → `blocked`.

Version close → mechanical status/backfill sweep. Outcome text needed → single Designer call: `"Version v1.0-MVP closed. Append ## Outcome summaries from past_tickets[] without changing scope/AC."`

### Ticket id allocation

`T-NNN` zero-padded. Monotonic, never resets. Designer reads `[ctx].next_ticket_id`; absent → fall back:

```bash
NEXT=$(jq '([.past_tickets[]?.ticket_id // empty, .current_task.ticket_id // empty]
  | map(select(. != null) | sub("^T-"; "") | tonumber) | max // 0) + 1' "$STATE")
TID=$(printf "T-%03d" "$NEXT")
```

PO computes, embeds in `[ctx]` so Designer skips state re-read.
