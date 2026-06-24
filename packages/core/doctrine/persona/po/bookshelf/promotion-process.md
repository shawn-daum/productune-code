# Promotion process — 4-quadrant classification + user-approval gate

Classify each persona-emitted candidate, surface it, write to the resolved (scope, pattern) target on user approval. You route every long-term write; persona never writes.

## Consume

Read `promotion_candidates[]` (top-level JSON array) from every persona envelope. Schema + 10 fields + scope×pattern + refusal string: `common/bookshelf/promotion-candidate-schema.md`. Treat any in-doc `## Promotion Candidates` body as secondary annotation.

Attach PO-managed lifecycle fields during disposition (not persona-emitted): `status` (`pending|approved|dropped|edited`), `decided_at`, `final_target` (set on `edited`).

## 4-quadrant classification

2 axes × 2 values. Classify, then write to the resolved target on user `y`:

| Quadrant (scope/pattern) | Target path | Write |
|:--|:--|:--|
| (project, bookshelf) | `docs/<persona>/bookshelf/<file>.md` | **auto** on `y` — append + habit-index sync |
| (project, habit) | `docs/<persona>/habit.md` | curated merge (PO shell on `y`) |
| (global, bookshelf) | `~/.productune/<persona>/bookshelf/<file>.md` | append + habit-index sync (PO shell on `y`) |
| (global, habit) | `~/.productune/<persona>/habit.md` | curated merge (PO shell on `y`) |

- (project, bookshelf) = **auto-write** on `y` (low-stakes append + source label).
- (project, habit) + both **global** quadrants = **user-approval surface**.
- Never write global silently — persona proposes, you write only on a user decision.

## Layer priority — tier map (SINGLE SOURCE)

**Tier location 정의는 여기가 SoT.** 다른 곳(habit / calibration)은 이 표를 cross-ref, 재정의 금지.

| Tier | 위치 (location) | 무엇 | write |
|:--|:--|:--|:--|
| **Tier 0** | `packages/core/doctrine/` | 코어 doctrine — `common/` + persona `habit.md` + **`bookshelf/`** (ux-principles · anti-default · security-6 등 — **bookshelf 는 Tier 0**) | **직접 write 금지** — Designer doctrine-editing flow (user-approved) 로만 |
| **Tier 1** | 프로젝트 `docs/<persona>/` | project overlay (`docs/po/calibration-log.md` · `docs/designer/design-system.md` 등) | promotion gate (project quadrant) |
| **Tier 2** | **`~/.productune/<persona>/`** | 개인/글로벌 cross-project (`$HOME/.productune/po/habit.md` 등) | promotion gate (global quadrant) |

혼동 지점 못박기: **bookshelf = Tier 0** (Tier 2 아님), **`~/.productune` = Tier 2** (Tier 0 아님).

Reader chain (Tier 0 common → Tier 0 persona → Tier 1 project → Tier 2 personal): **last layer wins**. 같은 topic 두 layer 에 있으면 뒤가 override 해서 productune doctrine 직접 안 건드리고 진화.

**calibration-log = routing-bias 1-liner ONLY**; operational/infra/product 규칙·결정·preference 는 calibration-log 가 아니라 **Tier 1/2 promotion candidate (+user ASK)** 로 — 라벨 헷갈려도 destination 못 틀리게. 전문: `../habit.md:46` · `calibration.md`.

**Promotion never targets Tier 0.** 4 quadrants 는 Tier 1/2 전용. Tier 0 core doctrine 변경 (all-subagent-read rule 포함) 은 이 gate 가 아니라 Designer doctrine-editing flow (user-approved) 로 route.

## Merge on promotion — habit write 는 curated merge

`(*, habit)` write 는 target 기존 entries 와 conflict check:

| 관계 | 처리 |
|:--|:--|
| **new** — 무관 topic | § 자리에 append |
| **refine** — 같은 topic, 더 정확 | replace + 변경 사유 1줄 surface |
| **supersede** — 기존 outdated | 삭제 + new, user 명시 (`X → Y 대체 OK?`) |
| **conflict** — 두 룰 모순 | append 금지, conflict surface → 통합안 |

`(global, habit)` decision 전 PO 는 **Tier 0 base 를 매번 다시 read** (persona Tier 0 habit + 그 habit 의 bookshelf 인덱스 라인), 그 위에 merge classifier 돌려 분류. supersede / conflict 시 user 명시 확인 필수 — 자동 처리 X. Tier 0 mechanical workflow (self-check · dispatch 순서 · refusal · gate) 를 weaken / 우회하는 변경이면 단순 `X → Y OK?` 가 아니라 **명시 경고** surface (예: `Tier 0 § N 의 ___ 를 weaken 합니다. 의도 맞으세요?`). user explicit confirm 후에만 write.

## Habit-as-index — bookshelf 와 habit 은 한 쌍

bookshelf = 본문 (on-demand), 같은 layer 의 habit = 인덱스 (always-read). Persona 는 session start 에 habit 만 read — habit 에 cross-link 없으면 bookshelf 는 orphan (영영 안 열림). 그래서 모든 bookshelf write 는 habit-index action 과 쌍:

- **New bookshelf file (first entry)** — same-layer habit 에 한 줄 인덱스 add:
  `- <topic 요약> → \`bookshelf/<file>.md\``. (bookshelf 가 사는 layer 가 인덱스 layer.)
- **Append to existing** — 인덱스 라인 그대로 (topic 요약 안 바뀜).
- **Bookshelf split (cap ≥100)** — 인덱스 라인도 split, 결과 file 마다 pointer.

인덱스 entry 는 **curated** (no `[T-NNN]`), bookshelf append 가 `auto` 여도. PO 가 같은 approval turn 에 직접 write.

| bookshelf write target | sync 할 same-layer habit |
|:--|:--|
| `docs/<persona>/bookshelf/<file>.md` | `docs/<persona>/habit.md` |
| `~/.productune/<persona>/bookshelf/<file>.md` | `~/.productune/<persona>/habit.md` |

## Lifecycle

1. **Persona emits** `promotion_candidates[]`.
2. **Capture**: surface inline 불가 (background turn / closed window) → `po-state.json :: pending_promotions[]` 에 enqueue, `status:"pending"`.
3. **Surface** at next turn-start — drain `pending_promotions[]` before disposition. **Batch, not interrogation**: 2+ candidates → ONE table in a single turn (rendered in user lang, planner-friendly phrasing) — `1-line candidate summary · quadrant · PO recommendation (y/n/edit) + 1-line reason`. The user answers once, flipping exceptions only ("all y, but n on #2").
4. **User decides** per candidate: `y` (approve) / `n` (drop) / `edit` (modify delta/target). Exception — `(global, habit)` supersede / conflict items are confirmed INDIVIDUALLY outside the batch table (the merge-classifier explicit-warning rule stays).
5. **Write** per 4-quadrant table.
6. **Update** `pending_promotions[].status` + `decided_at`. `status:"edited"` 면 `final_target` = 실제 written payload.

> **Work-notes** (`docs/<persona>/R<n>-<slug>.md`) bypass this grid — owning persona 가 직접 write, quadrant 통과 금지.

## Append rules (bookshelf)

- Format: `- (YYYY-MM-DD) [T-NNN] <area-tag> · <note>`. Source label `[T-NNN]` mandatory.
- Habit files = **curated, no source label** — approval 시 coherence 위해 rewrite.
- Target bookshelf at capacity → topic 별 split 후 append.

## Phase 5 promotion drain

Version close 에 모든 `pending_promotions[]` 를 single batch 로 user 에게 surface. Drain 후, `status ∈ {approved, edited, dropped}` ∧ `decided_at ∈ [version.started_at, version.ended_at]` snapshot = **5th retrospective read source** (`lifecycle/p5-close.md`).

## Refusal — direct user long-term write

User 가 persona 에게 "write this to my global memory / habit / bookshelf" 직접 요청 → persona returns
`{refused: true, reason: "Long-term memory writes route through the productune promotion gate.", suggested_route: "promotion_candidates[scope:global]"}`.
