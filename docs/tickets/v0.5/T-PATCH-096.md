---
ticket_id: T-PATCH-096
title: "Main-pane 상단 phase 헤더에 버전 명시 + 영역 확대, PO 채팅 아래 phase 표시줄 삭제 (#8)"
version: v0.5
round: patch
type: feature
status: done
phase: 3
assignee: pdt-developer
estimated_complexity: L2
model: sonnet
effort: medium
risk_flags: none
slug: mainpane-phase-version-header
qa_status: pass
qa_loops: 0
area_tags: [gui/workspace-shell, gui/phase, gui/header]
created_at: 2026-06-10
---

| T-PATCH-096 | mainpane-phase-version-header | review |

# T-PATCH-096: Main-pane 상단 phase 헤더에 버전 명시 + 영역 확대, PO 채팅 아래 phase 표시줄 삭제 (#8)

> main-pane 상단 phase 브레드크럼 앞에 버전을 붙이고 해당 영역을 넓고 크게 만든다. PO 채팅 아래 중복 phase 표시줄은 제거한다.

## 1. Request

### 유저 지시 (verbatim)

> "main pane 상단 phase 표시 앞에 버젼 명시. 해당 영역에 넓게 배치, 글자 및 여백 키우기. Po 채팅 아래 phase 표시줄 삭제."

### Current state

- main-pane 상단 phase 인디케이터는 `PhaseBreadcrumb` (`packages/gui/src/components/workspace/PhaseBreadcrumb.tsx`) — 'PRD › Design › Build › Deploy › Close', 현재 단계 보라색(#8B5CF6) 강조, full-width, `borderBottom`. `WorkspaceShell.tsx`의 `breadcrumbArea`에서 렌더 (`packages/gui/src/views/WorkspaceShell.tsx` line 338-349, `<PhaseBreadcrumb phase={phase} />`는 line 343).
- 버전 문자열은 po-state에 있고 `WorkspaceShell`에서 이미 읽힌다 (`packages/gui/src/views/WorkspaceShell.tsx` line 150: `poStateVersion = useWorkspace((s) => s.poState?.current_version ?? null)`). 다만 phase 근처에는 **표시되지 않는다**.
- `PhaseStrip.tsx`(접이식 dot strip / chip variant)는 사이드바 `VersionRow` hover 팝오버에서만 쓰이고 main-pane과는 무관하다 — 이번 변경 대상 아님.
- **"PO 채팅 아래 phase 표시줄"의 실제 정체** (코드 확인 결과): `ChatPanel.tsx`(`packages/gui/src/components/workspace/ChatPanel.tsx`) line 370-373의 `rp-ctx` row 안에서 렌더되는 **두 번째 `PhaseBreadcrumb`** (`<PhaseBreadcrumb phase={currentPhase} />`, T-PATCH-053에서 PhaseStrip chip을 대체하며 들어옴)이다. 이것이 PO 채팅 헤더 아래에 보이는 phase 표시줄이며, main-pane 상단 브레드크럼과 시각적으로 중복된다.

### Task

1. main-pane 상단 영역(`WorkspaceShell` `breadcrumbArea`)의 `PhaseBreadcrumb` **앞에 버전 라벨(예: "v0.5")**을 prepend.
2. 그 영역을 더 넓게 배치하고 글자 크기·여백(padding)을 키운다.
3. PO 채팅 아래(`ChatPanel`의 `rp-ctx` row)에 있는 phase 표시줄을 **제거**한다.

## 2. Acceptance

- [x] **[AC-1]** main-pane 상단 phase 브레드크럼 바로 앞에 현재 버전(`poStateVersion`, 예 "v0.5")이 노출된다. po-state에 버전이 없으면 버전 라벨은 렌더되지 않는다(브레드크럼은 그대로 표시).
- [x] **[AC-2]** 상단 phase/버전 영역의 글자 크기와 좌우/상하 여백이 현재보다 명확히 커지고, 영역이 더 넓게 배치된다(시각적으로 "헤더"로 인지될 수준).
- [x] **[AC-3]** 버전 라벨은 phase 강조 보라(#8B5CF6)와 충돌하지 않는 시각 위계를 가진다(버전은 보조 위계, phase 현재 단계가 주 강조 유지).
- [x] **[AC-4]** PO 채팅 헤더 아래(`ChatPanel` `rp-ctx` row)의 phase 표시줄(`<PhaseBreadcrumb phase={currentPhase} />`)이 더 이상 렌더되지 않는다.
- [x] **[AC-5]** PhaseBreadcrumb 제거로 인해 ChatPanel에서 unused import/var(`PhaseBreadcrumb`, `currentPhase` 파생값, `ctxRow` 스타일 등)가 남지 않는다(린트/tsc clean).
- [x] **[AC-6]** `pnpm tsc --noEmit` 통과, 새 에러 없음.

## 3. Out of scope

- 사이드바 `VersionRow` 팝오버의 `PhaseStrip`은 변경하지 않는다.
- phase 단계 문구/순서(PRD › Design › Build › Deploy › Close)나 강조 색상 자체의 변경.
- 버전 선택/스위칭 UX(드롭다운 등) 추가 — 이번 티켓은 "표시"만.
- `PersonaPresenceBar`, `TodoChip` 등 `rp-ctx` 아래 다른 행은 유지(phase 표시줄만 제거).

## 4. Implementation plan

1. `packages/gui/src/views/WorkspaceShell.tsx`
   - line 150의 `poStateVersion`를 `breadcrumbArea`로 전달. line 343 `<PhaseBreadcrumb phase={phase} />`를 버전 라벨 + 브레드크럼 묶음으로 감싸거나, `PhaseBreadcrumb`에 `version` prop을 넘긴다(아래 2안 중 택1, 2안 권장).
2. `packages/gui/src/components/workspace/PhaseBreadcrumb.tsx`
   - 선택적 `version?: string | null` prop 추가. 값이 있으면 단계 목록 앞에 버전 라벨 세그먼트를 렌더(보조 위계 스타일).
   - 폰트 크기·padding 상향(헤더 위계). 현재 강조 보라(#8B5CF6)는 phase active에 유지.
3. `packages/gui/src/views/workspace/shell/styles.ts`
   - `breadcrumbArea` 스타일을 더 넓고 큰 여백으로 조정(상단 헤더 높이/패딩 증가). 그리드 행 높이가 고정이면 동반 조정.
4. `packages/gui/src/components/workspace/ChatPanel.tsx`
   - line 370-373 `rp-ctx` row의 `<PhaseBreadcrumb phase={currentPhase} />` 제거.
   - line 26 `import PhaseBreadcrumb` 제거(다른 사용처 없으면), line 345 `currentPhase` 파생 로직과 line 763 `ctxRow` 스타일을 다른 잔여 사용 여부 확인 후 정리.
5. `pnpm tsc --noEmit`로 unused/타입 확인 후 정리.

## 5. QA scope (smoke)

- [ ] 앱 실행 → 워크스페이스 진입 시 main-pane 상단에 "v0.5 | PRD › Design › Build › Deploy › Close" 형태로 버전 + phase가 함께 보이고, 영역 글자/여백이 이전보다 큼.
- [ ] PO 채팅 헤더 아래에 phase 표시줄이 더 이상 보이지 않음.
- [ ] phase가 바뀌면 상단 브레드크럼의 현재 단계 강조가 정상 갱신됨.
- [ ] po-state 버전이 없는 초기 상태에서 레이아웃 깨짐/빈 라벨 없음.
- [ ] `pnpm tsc --noEmit` green.

## Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
| pdt-developer | T-PATCH-096 | 2026-06-10T00:00:00Z | 2026-06-10T00:00:00Z | claude-opus-4-8 | medium |
| pdt-qa | T-PATCH-096-qa | 2026-06-10T00:00:00Z | 2026-06-10T00:00:00Z | claude-opus-4-8 | standard |
| pdt-developer | T-PATCH-096-qa-fix | 2026-06-10T00:00:00Z | 2026-06-10T00:00:00Z | claude-opus-4-8 | medium |

### QA verification (pdt-qa · code inspection)

All §2 acceptance verified against implemented code; centralized build GREEN (tsc 0, locale parity, smoke passed). VISUAL ticket → `user-verify`.

- AC-1 PASS — `PhaseBreadcrumb` (`version?: string | null` prop) renders a `versionNode` segment + chevron only when `version` truthy; `WorkspaceShell.tsx:344` passes `version={poStateVersion}` (`poState?.current_version ?? null`). Null → no segment, breadcrumb intact.
- AC-2 PASS — `wrap` padding `10px 28px`, `minHeight: 48`; `baseNode` fontSize 14 / padding `5px 12px` (up from prior smaller header). Reads as a header band.
- AC-3 PASS — `versionNode` is neutral (`#9A9AA0` text on `#1E1E1E`/`#2F2F2F` border); active phase keeps purple `#8B5CF6`. Version = secondary hierarchy.
- AC-4 PASS — `ChatPanel.tsx:464-465` second `PhaseBreadcrumb` removed; `PersonaPresenceBar` now follows header directly.
- AC-5 PASS — no `import PhaseBreadcrumb`, no `currentPhase` derived var, no live `ctxRow` style in ChatPanel (only one historical comment at line 848). No unused remnants.
- AC-6 PASS — centralized tsc 0 errors.

**User-verify eyeball:** Launch app → enter workspace. Confirm (1) main-pane top header shows `v0.5 › PRD › Design › Build › Deploy › Close` with version label visibly left of phases and larger text/padding than before; (2) PO chat header no longer shows a phase strip below it (PersonaPresenceBar sits directly under header); (3) switching phase re-highlights the active node in purple; (4) a project with no po-state version shows the breadcrumb with no empty version chip / no layout break.

---

## §4.b QA-feedback: header polish (designer addendum)

> Re-opens the header for two QA-eyeball tweaks. Scope is `PhaseBreadcrumb.tsx` render + styles only. No code in this addendum — implementable spec for pdt-developer. lucide-react only (no new icons required here).

### Source feedback (verbatim)

> "버젼 옆에 > 표시 없애줘. 페이즈 별로 옆에 작게 (45/57)이렇게 done ticket 진행사항 알려줘."

Decoded into two changes:

- **AC-1b — remove version→first-phase chevron.** The `›` rendered between the version badge and the first phase (PRD) is removed. Phase-to-phase `›` separators are kept unchanged.
- **AC-2b — per-phase ticket progress.** Next to each phase label, show a small `(done/total)` counter.

### Data-source investigation (read, not guessed)

Checked `useTicketScan.ts`, `types.ts`, `phase-mapping.ts`, the scanner `electron/ipc/tickets.ts`, and the on-disk frontmatter across all 250 ticket md files.

Findings:

1. **No clean ticket→phase attribution exists.**
   - `phase-mapping.ts` header states it explicitly: phase (Layer A, `current_phase` 1..5) and ticket `type` (Layer B) are **distinct axes** per v2 doctrine. There is no `type → phase` map in the codebase (grep for `typeToPhase`/`phaseFor`/`TYPE_PHASE` → none).
   - `Ticket` (`types.ts`) carries `type`, `status`, `round`, `version` — **no phase field**.
   - `round:` frontmatter is free-form text (`patch`, `phase4-r4`, `phase4-r4-fix`, …), not a 1..5 phase. Unusable as a phase key.
   - A `phase:` frontmatter field **does** exist on disk (109 of 121 v0.5 files) BUT (a) the scanner `electron/ipc/tickets.ts` does **not** parse it into the `Ticket` object — it is invisible to the GUI today; and (b) its distribution is degenerate: across all versions the values are `1`×1, `2`×6, `3`×102, and **zero** tickets at phase 4 (Deploy) or 5 (Close). Mapping on this field would render `(0/0)` for Deploy/Close and pile everything onto Build — misleading, not informative.

   **Verdict: reliable per-phase attribution from existing data is NOT feasible.** Neither `round`, `type`, nor the (unparsed, skewed) `phase` field yields a trustworthy done/total per the 5 phases.

2. **Best available approximation (this is what we ship), FLAGGED as approximate.**
   Use the only axis that is both parsed and semantically phase-adjacent: ticket **`type` → phase bucket**, version-scoped to the current version. This is an approximation, not ground truth, and must be visually marked as such (see treatment below).

   Fixed `type → phase` bucket map (single source, add to `phase-mapping.ts`; not the doctrine phase axis):

   | Phase  | ticket `type`(s) bucketed into it           |
   |:-------|:--------------------------------------------|
   | PRD    | `feature`, `docs`                           |
   | Design | `design`                                    |
   | Build  | `impl`, `refactor`, `build`, `bug`, `fix`, `chore` |
   | Deploy | `deploy`                                    |
   | Close  | `qa`, `test`, `close`                       |

   - `doctrine` / `doctrine-*` types and any unmapped/legacy composite (`design+impl`, `PRD|test|...`) are **excluded from all buckets** (they are not product-cycle work). Normalize via the existing `normalizeStatus`-style tolerance; bucket on `t.type ?? t.stage`.
   - Scope: only tickets whose `version === poStateVersion` (current version). Cross-version tickets are excluded.

### Count rule (exact)

For each of the 5 phases, over `useTicketScan` tickets filtered to the current version and bucketed by the `type → phase` map above:

- **total** = count of bucketed tickets for that phase.
- **done** = count of those whose `normalizeStatus(status) === 'done'`.
- Render `(done/total)`.

`abandoned` tickets count toward neither done nor total (drop them before bucketing). All other live statuses (`todo`/`in-progress`/`review`/`user-verify`/`blocked`) count toward total only.

### Empty-phase behavior

- **total === 0** for a phase → render **no counter** at all for that phase (omit the `(…)` node entirely). Do NOT show `(0/0)` — an empty Deploy/Close phase should read clean, not zeroed. This is required given the data skew above (Deploy/Close will frequently be 0).

### Visual treatment (`(done/total)`)

- Placement: inline, immediately to the **right** of each phase label, inside the same phase `<span>` node, with a small left gap (`gap`/`marginLeft: 4`).
- Size: `fontSize: 10` (clearly sub-label vs the 14px phase text), `fontVariantNumeric: 'tabular-nums'` so digits do not jitter as counts change.
- Color: **muted/secondary**, distinct from both the active-phase purple and the phase label color so it reads as metadata, not as part of the label.
  - On the active phase: `#8B5CF6` at reduced emphasis is acceptable, but prefer a single neutral muted token for all phases for consistency: text `#707070` (matches existing `inactiveNode` color token), no background, no border.
  - Do NOT color the counter purple on inactive phases.
- Weight: `fontWeight: 400` (never bold) — the phase label keeps the hierarchy.
- **Approximate-data marker (required, because this is not true phase attribution):** render the counter with `opacity: 0.7` AND wrap it in a `title` tooltip: `"approximate — by ticket type, current version"`. This honestly signals the count is a heuristic, not authoritative, without adding visual noise. No icon needed; if a marker is ever wanted, lucide `Info` at 10px muted is the only sanctioned choice — but default is text-only + tooltip.
- No layout shift: the counter sits within the existing flex node; the breadcrumb must not wrap. If width is a concern at narrow panel widths, the counter is the first thing allowed to be hidden (it is supplementary), but default is always-shown.

### Chevron removal (AC-1b, confirmed)

Current render (`PhaseBreadcrumb.tsx` lines 15–20): the version block renders `<span style={versionNode}>{version}</span>` followed by `<span style={chevron}>›</span>`. **Remove that trailing `<span style={chevron}>›</span>`** so the version badge stands alone. The phase loop's own separator (`{i > 0 && <span style={chevron}>›</span>}`, line 23) is **unchanged** — phases keep their `›` between each other. Net: `v0.5  PRD › Design › Build › Deploy › Close`.

### Acceptance (addendum)

- [x] **[AC-1b]** No `›` renders between the version badge and the first phase (PRD). Phase-to-phase `›` separators remain.
- [x] **[AC-2b]** Each phase with ≥1 current-version bucketed ticket shows a small muted `(done/total)` to the right of its label, using the `type → phase` bucket map; `done` = status `done`.
- [x] **[AC-3b]** A phase with 0 bucketed tickets shows no counter node (no `(0/0)`).
- [x] **[AC-4b]** The counter is visually subordinate (10px, muted `#707070`, weight 400, tabular-nums, opacity 0.7) and carries the `title="approximate — by ticket type, current version"` tooltip; it never renders bold or purple-on-inactive.
- [x] **[AC-5b]** Breadcrumb does not wrap; no layout break when counts are present, absent, or version is null.
- [x] **[AC-6b]** `type → phase` bucket map lives in `phase-mapping.ts` (single source); scoped `tsc --noEmit` clean (no new errors in changed files).

### Implementation notes (no code here)

- `PhaseBreadcrumb` needs the ticket list to compute counts. Pass current-version, pre-filtered counts down as a prop (e.g. `phaseCounts?: Record<Phase, { done: number; total: number }>`) computed in `WorkspaceShell` from `useTicketScan` — keep `PhaseBreadcrumb` presentational; do not call the hook inside it.
- Add the `type → phase` bucket map + a `bucketTicketsByPhase(tickets, version)` helper to `phase-mapping.ts` alongside the existing `PHASE_DEFS`.
- This addendum does NOT request parsing the on-disk `phase:` frontmatter into the scanner. If a future ticket wants true phase attribution, that is the prerequisite (parse `phase` in `electron/ipc/tickets.ts`, backfill phase 4/5 frontmatter) — out of scope here and flagged.
