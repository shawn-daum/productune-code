# T-P4-023 — Version history (버전 히스토리) design plan

**Ticket**: T-P4-023
**Round**: phase4-r2 (R2 finale)
**Version**: v0.4-meta-dogfood
**Status**: design land (OQ-1 / OQ-7 closed 2026-05-12)
**Owners**: pdt-designer (spec) + pdt-developer (impl)
**Mockups**:
- `docs/design/T-P4-023/mockups/main-pane-tab.html` (past-version linear card list — §2.2.2 reference)
- `docs/design/T-P4-023/mockups/side-panel-section.html`

> Background: PRD §10 [버전 히스토리] + ROADMAP Round 2 finale. ticket / deploy 카드 + version 기반 grouping + 자연어 변환 (frontmatter mile-stone + T-P4-021 commit msg parser). T-P4-046 dispatcher 12번째 tab type. `useTicketScan` SoT (past_tickets[] 제거 정합, T-P4-065 sub-f).

---

## 1. Goals / non-goals

### Goals
- 사용자가 "어제 어떤 작업이 있었지" 질문에 자연어 한 줄로 답변 가능.
- ticket / deploy 활동을 **version 단위로 grouping** — 사용자 가시 SoT.
- side panel 에서 항상 "이번 작업" 인지, main pane tab 에서 풀 카드 세부.
- 외부 어휘 (commit / sha / push / branch / merge / worktree) 노출 0.

### Non-goals
- commit revert / rollback UI (별도 ticket)
- 페르소나 turn 별 산출물 diff (Round 7 메모리 편집기)
- export to markdown / PDF (Phase 5)
- 라운드 간 비교 view (Phase 5)

---

## 2. Master-detail structure

OQ-1 closure (2026-05-12): side panel-only 안 (B) 도 main-pane-only 안 (A) 도 단독으로 부족. **master-detail** 채택.

### 2.1 Side panel — version list (selector)

- 위치: Project tab → **기존 "VERSIONS" sp-section 을 REPLACE** (현재 `ProjectVersionsSection.tsx` 가 `LeftSidebar.tsx` line 65 에서 렌더). 신규 sp-section 추가 X — 기존 region 의 component swap. layout slot 보존.
- **title = "버전" (한국어) / "Versions" (영문)**. `"버전 히스토리"` 가 아니다 — history 는 §2.2 main pane detail tab 의 title 로만 쓰임. master-side label = entity 이름 (entity = version) 만.
- **collapse toggle 없음** — chevron 없음, 항상 expanded. version awareness 는 구조적으로 always-on 이어야 하는 region (사용자가 닫을 수 있는 collapsible sp-section 의 카테고리가 아님). §1.5.5 Escape 는 main pane tab close × / filter chip dismiss / Esc 키로 충족.
- 각 row = **3 fields max** (§1.5 Few Things):
  1. `Version N` pill (예: `v0.4` / `v0.3`) — 최신 = orange accent / 과거 = designer purple
  2. ticket count + deploy count (예: `12 · 2`)
  3. date (latest 활동 시각 — 예: `2026-05-12` 또는 `오늘`)
- 정렬: 최신 version 맨 위.
- 상호작용: row 클릭 → `selectedVersionId` state 갱신 → `version-select` event emit → Main pane tab 의 "버전 히스토리" 가 selectedVersionId 의 ticket/deploy 카드 렌더.
- empty state: "작업 기록 없음 — 새 작업 시작" (`design-system.md` §8.9 Empty pane recipe).
- 헤더 right-meta: `{totalTickets} · 배포 {totalDeploys}` (예: `36 · 배포 7`) — 기존 ProjectVersionsSection 헤더 메타 그대로 유지.

```
┌────────────────────────────────┐
│ 버전              36 · 배포 7 │  ← chevron 없음, 항상 expanded
├────────────────────────────────┤
│ [v0.4] 12 · 2     2026-05-12 │ ← selected (active bg)
│ [v0.3] 18 · 4     2026-05-05 │
│ [v0.2]  6 · 1     2026-04-28 │
│ ...                           │
└────────────────────────────────┘
```

side panel 240px 폭 안 — 3-field row 외 추가 메타 X. version 내부 ticket/deploy detail 은 절대 표시하지 않음 (master-detail 의 master 책임만).

**Rationale**: VERSIONS 영역은 이미 항상 노출되는 구조적 region. 신설 sp-section 으로 만들면 중복. master-detail 의 master 가 기존 region 을 inherit 하는 게 자연스러움.

### 2.2 Main pane tab — "버전 히스토리" (detail)

OQ-7 closure (2026-05-12): detail view 는 선택된 version 이 **current 인지 past 인지에 따라 bifurcate**. current = kanban (WIP planning surface, status-bound), past = linear card list (chronological narrative, history/reflection). 동일 data layer + 다른 UX shape.

- tab type: `version-history` (T-P4-046 dispatcher 12번째 enum).
- 진입: side panel row 클릭 또는 ⌘P quick-open "버전 히스토리".
- 헤더 (공통): `버전 히스토리 — {versionLabel}` + subtitle "작업 N · 배포 M · 소요 X".
- empty state (selectedVersionId === null, 공통): **"버전을 선택하세요"** — side panel 가리키는 화살표 + 안내. (design-system §8.9 Empty pane.)
- 자연어 매핑 어휘 (`service-flow-and-screens.md` §3.2 표 정합, 공통):
  - "이번 작업" / "지난 작업"
  - "{ticketId} 시작" / "{ticketId} 완료"
  - "배포 시작" / "배포 완료"
  - 페르소나 turn 별 reason → "시작" / "완료" / "자동 저장" / "설계" / "차단" / "품질 확인 통과"
  - 외부 어휘 0 — vocabulary lint helper (`packages/core/src/lint/vocabulary.ts`) 검증.

#### 2.2.1 Current version (kanban board)

조건: `selectedVersionId === currentVersionId` (§2.2.3 branch logic).

- **컴포넌트 재활용**: 기존 `packages/gui/src/components/workspace/main/panes/TicketReviewTab.tsx` board view 패턴 그대로 차용. 신규 컴포넌트 추가 X — `VersionHistoryView` 내부에서 branch 로 분기 후 동일 board 패턴 render. ('ticket-review:board' TabType 자체를 재호출하는 게 아니라 **rendering pattern reuse** — `selectedVersionId` 로 ticket scope 만 좁힘.)
- **컬럼**: ticket status enum 4종 — `todo` / `in-progress` / `qa` / `done`. 컬럼 헤더 한글 매핑 = "할 일" / "진행 중" / "품질 확인" / "완료" (TicketReviewTab 기존 i18n key 정합).
- **카드 = ticket 만**. deploy event 는 status-bound 가 아니므로 kanban 에서 **skip** (deploy 가시화는 §2.2.2 past view 에서만 — current 는 진행 중인 작업 surface 가 목적).
- **카드 최소 메타** (§1.5.1 Few Things):
  1. ticket id (예: `T-P4-023`)
  2. title (1 line, ellipsis)
  3. persona chip (assignee — po/designer/developer/qa 4 색)
  4. qa pill (qa_status: `pending` / `pass` / `fail`)
- **drag-drop = out of scope**. 본 view 는 **read-only kanban** — status 변경은 기존 `ticket-review` tab 에서만 가능. version-history 는 surfacing/awareness 책임만 (Few Things — 두 view 가 같은 기능 가지면 사용자 confusion).
- **empty column state**: "이 단계에 작업 없음" (`design-system.md` §8.9 Empty pane recipe — 컬럼 단위 sub-empty).
- **expand**: kanban 카드 클릭 → 해당 ticket review tab 으로 navigate (§1.5.2 Familiar — 기존 ticket 진입 패턴 정합). version-history tab 안에서 inline expand X.
- **filter** (§2.4): persona chip × 4 + date range — kanban 위 toolbar 에도 동일 적용. persona chip = 컬럼 가로질러 카드 hide/show. date range = ticket `created_at` 기준 filter.

```
┌─ [버전 히스토리 — v0.4] (current)
│ 작업 12 · 배포 2 · 6h 32m  |  [persona × 4] [date range]
├────────────┬────────────┬────────────┬────────────┐
│ 할 일       │ 진행 중     │ 품질 확인   │ 완료        │
│  3         │  2         │  1         │  6         │
├────────────┼────────────┼────────────┼────────────┤
│ T-P4-091   │ T-P4-023   │ T-P4-069   │ T-P4-046   │
│ Wiki ...   │ Version ...│ Mockup ... │ Tab dis... │
│ [designer] │ [designer] │ [qa] PASS  │ [dev] PASS │
│ qa: -      │ qa: -      │            │            │
├────────────┼────────────┼────────────┼────────────┤
│ T-P4-073   │ T-P4-067   │            │ T-P4-021   │
│ ...        │ ...        │            │ ...        │
└────────────┴────────────┴────────────┴────────────┘
```

#### 2.2.2 Past version (linear card list)

조건: `selectedVersionId !== currentVersionId` (§2.2.3 branch logic) — `selectedVersionId` 가 과거 version id 인 경우.

- 렌더 룰: `selectedVersionId` 의 ticket / deploy 카드만.
  - 카드 종류 2: `ticket-card` (페르소나 trace inline) / `deploy-card` (포함 작업 + 소요).
  - 정렬: 시간순 최신 위 (within version).
  - 카드 body 3 lines max (§1.5 Few Things) — 페르소나 trace inline 도 카드 상태별 N=1~3 line.
  - 카드 클릭 → expand → 해당 ticket 의 auto-save commit 시퀀스 (페르소나 turn 별 1줄). expand 는 사용자 명시 click 시만 (§1.5.3 Predictability).
- **mockup 유효**: 기존 `docs/design/T-P4-023/mockups/main-pane-tab.html` spec 그대로 유지 — past version 전용. 신규 mockup 추가 X (kanban 은 이미 ship 된 TicketReviewTab UI 가 reference).
- filter (§2.4): persona chip × 4 + date range — linear list 위 toolbar 적용. persona chip = 카드 hide/show. date range = 카드 timestamp 기준 filter.

#### 2.2.3 Branch logic

```ts
// pseudo
const isCurrentVersion = selectedVersionId === poState.currentVersionId
//                                              ^^^^^^^^^^^^^^^^^^^^^^^^
// po-state.json 의 versions[] 배열 + current 표식.
// schema 가 explicit `current: true` flag 인지 last entry's id 인지는 impl 시 확인
// (T-P4-086 frontmatter version SoT 정합 — po-state versions[] 는 metadata 만).
// null 이면 past 로 fallback (역사 처리 — current 추정 불가능 시 안전한 default).
```

- `isCurrentVersion === true` → §2.2.1 kanban.
- `isCurrentVersion === false` → §2.2.2 linear card list.
- `selectedVersionId === null` → empty state ("버전을 선택하세요", 공통).

#### 2.2.4 Rationale

- **Current version = WIP focus**. 사용자의 1차 질문 = "지금 뭐가 어디까지 됐어?" — status-bound kanban 이 정답. 컬럼 = 진행 단계의 시각화. 작업 분포 한눈 인지 + 병목 컬럼 즉시 가시.
- **Past version = chronological narrative**. 사용자의 1차 질문 = "지난 version 에서 뭐가 있었어?" — 시간순 linear list 가 정답. status 는 이미 모두 `done` (또는 deferred) 이라 status 컬럼 무의미. 시간 흐름 + deploy event mix-in 이 reflection/history 의 본질.
- **Different UX shapes, same data layer**. `useTicketScan` SoT + `selectedVersionId` filter 만 공통. render path 만 분기.

### 2.3 Persistence

- `selectedVersionId` = **workspace local state** (zustand `useWorkspace` slice, `selectedVersionId: string | null`).
- po-state.json 에 저장 **X** — UI ephemeral. 한 세션 안에서만 유지.
- default = 최신 version (`versions[0].id`) — 첫 open 시 자동 선택. (default = current version 이므로 kanban 가 1차 surface.)
- side panel mount 시 첫 row 선택 자동 emit → main pane tab 이 열려 있으면 즉시 동기.
- main pane tab 닫고 다시 열 때 = 최신 version 으로 reset (ephemeral).

### 2.4 Filter

- filter (persona chip × 4 + date range) = **Main pane tab toolbar 안에만** — current/past 양쪽 view 모두 적용.
- side panel = 최소 — filter 없음. 항상 version 단위 raw list (date 정렬).
- 이유: side panel 240px 폭에 filter UI 부담 + master 책임 (version awareness) 와 detail 책임 (filter / 세부) 분리.
- date range default = 해당 version 의 first~last 활동 시각. 사용자 수정 가능.
- persona chip default = 4 chip 전체 active.

---

## 3. Layout

```
┌──────┬──────────────┬─────────────────────────────┬──────────┐
│ AB   │ Side Panel   │ Main pane (tab)             │ Chat     │
│ 48px │ 240px        │ flex                        │ 320px    │
│      │              │                             │          │
│      │ 버전        │ ┌─ Tab strip ──────────────┐│          │
│      │  v0.4 12·2 ●│ │ PRD │ 보드 │ 버전 히… ×│          │
│      │  v0.3 18·4  │ └─────────────────────────┘│          │
│      │  v0.2  6·1  │                             │          │
│      │              │ [버전 히스토리 — v0.4]      │          │
│      │              │ 작업 12 · 배포 2 · 6h 32m  │          │
│      │              │                             │          │
│      │              │ [persona × 4 ] [date range]│          │
│      │              │                             │          │
│      │              │ ※ current → kanban (§2.2.1)│          │
│      │              │ ※ past    → linear (§2.2.2)│          │
└──────┴──────────────┴─────────────────────────────┴──────────┘
```

---

## 4. Data sources

| Source | Field | Renderer 변환 |
|---|---|---|
| `useTicketScan` | ticket frontmatter (`version`, `status`, `assignee`, `created_at`, `completed_at`, `duration_min`, `qa_status`, `qa_loops`) | 1차 카드 메타 (T-P4-086) |
| ticket `## Persona Activity` 표 | turn 별 row (When/Persona/Model/Effort/Result) | 카드 body activity-line (past view). 본 ticket 은 표 데이터 reuse — 신규 trace 생성 X |
| T-P4-021 자동저장 commit msg | `T-NNN [status: a→b] <summary>` | parser → 자연어 summary 만 표시. prefix (id / status 전이) 카드 메타로 |
| poState.versions[] | version metadata (id, label, started_at, ended_at, current flag) | grouping key + subtitle 메타 + §2.2.3 branch logic |
| Vercel deploy event | deploy 시각 + 포함 ticket list + duration | deploy-card (past view 만) |

자연어 변환 helper = `packages/core/src/history/naturalize.ts` (frontmatter mile-stone + commit msg parser 통합 layer). R7 메모리 편집기 timeline 에도 재사용.

---

## 5. Acceptance (impl 단계 — ticket md AC 보강)

기존 ticket AC + 본 plan 의 master-detail 결정사항 합본:

- [ ] Side panel — 기존 "VERSIONS" sp-section (`ProjectVersionsSection.tsx`) REPLACE. 신규 sp-section 추가 X, 기존 layout slot 보존. title = "버전" / "Versions". chevron toggle 없음 (항상 expanded). header right-meta `{totalTickets} · 배포 {totalDeploys}` 유지. Version N pill + count + date 3-field row + 최신 위. (§2.1)
- [ ] Main pane tab `version-history` — selectedVersionId 카드 렌더 + null 시 empty state. (§2.2)
- [ ] Main pane tab — current version 선택 시 kanban board 렌더 (status column todo/in-progress/qa/done, TicketReviewTab 재활용). (§2.2.1)
- [ ] Main pane tab — past version 선택 시 linear card list 렌더 (기존 mockup spec). (§2.2.2)
- [ ] selectedVersionId zustand workspace slice — po-state.json 저장 X. (§2.3)
- [ ] filter (persona × 4 + date range) = Main pane tab toolbar 안에만 — side panel 에 filter X. (§2.4)
- [ ] 사용자 화면 어휘 lint — `branch`/`commit`/`PR`/`merge`/`worktree`/`dev`/`staging` 노출 0.
- [ ] empty state: side panel "작업 기록 없음", main pane "버전을 선택하세요", kanban 컬럼 "이 단계에 작업 없음".
- [ ] main pane tab close × button (기존 tab dispatcher). side panel 섹션은 collapse 없음 (§2.1).
- [ ] `pnpm -r build` 통과.

---

## 6. §1.5 UX principles self-check

- **Few Things (§1.5.1)** — side panel row 3 field max / main pane card body 3 line max (past) / kanban card 4 메타 (current) / filter 2 control (chip + date) / expand 사용자 명시 click 만 / kanban read-only (status 변경은 ticket-review tab 만 — 기능 중복 회피).
- **Familiar (§1.5.2)** — Project tab 기존 sp-section / sp-item 패턴 차용. 기존 VERSIONS region 의 component swap (신규 region 추가 X — 사용자 mental model 안정). VSCode timeline / outline UI 정합. kanban = 기존 TicketReviewTab board 패턴 그대로. 자연어 어휘 ("이번 작업" / "지난 작업" / "{id} 시작·완료" / "배포 시작·완료") 만. 외부 어휘 0.
- **Predictability (§1.5.3)** — side panel 항상 보임 (collapse 없음 — version awareness always-on). main pane tab 은 명시 선택 시만 렌더. expand 클릭 시만. tab strip 기존 패턴 동일. current/past 분기 = selectedVersionId 의 결정론적 함수 (사용자 컨트롤로 예측 가능).
- **Feedback (§1.5.4)** — selectedVersionId 변경 시 side panel active bg + main pane subtitle 즉시 갱신 + view shape (kanban ↔ linear) 전환. 카드 hover border-color 변화. loading skeleton (deploy fetch 중).
- **Escape (§1.5.5)** — main pane tab close × / filter chip dismiss / Esc 키 (focus 안에서 selectedVersionId reset). side panel section collapse 는 의도적으로 제외 (§2.1 rationale — version awareness 는 always-on region).

---

## 7. Open questions

OQ-1 (master vs detail vs both) — **closed 2026-05-12, master-detail** 채택. ↑ §2 참조.

OQ-2 (deploy event source — Vercel REST vs autosave commit log) — **closed (designer 권고 a)** Vercel REST 1차 + autosave commit 의 squash merge 결과 cross-reference 보조.

OQ-3 (filter MVP scope — persona + date 만) — **closed (a)** MVP = persona + date 2 control. ticket type / status filter 는 R3+ enhancement.

OQ-4 (자연어 변환 helper 위치 — core vs gui) — **closed (a)** `packages/core/src/history/naturalize.ts` 공용 layer. R7 timeline 재사용.

OQ-5 (filter chip default — 전체 active vs 마지막 선택 유지) — **closed (b)** 마지막 선택 유지. localStorage 보조.

OQ-6 (Unassigned bucket — version=null ticket 표시 위치) — **closed (b)** side panel 맨 아래 별 pseudo-row `[지정 없음] N` + main pane 렌더 동일. T-P4-086 정합.

OQ-7 (detail view shape — current 와 past 가 같은 UX 인지) — **closed 2026-05-12, bifurcate**: current → kanban (TicketReviewTab 재활용, status column) / past → linear card list (mockup spec 유지). ↑ §2.2 참조.

OQ 1-6 designer 권고 b/a/a/a/b/b 채택 (ROADMAP Activity log 2026-05-12 정합). OQ-7 = 사용자 결정.

---

## 8. Implementation notes

- 모듈 위치: `packages/gui/src/views/VersionHistoryView.tsx` (main pane tab, current/past branch dispatcher) + `packages/gui/src/components/workspace/SidePanelVersionList.tsx` (side panel section) + `packages/core/src/history/naturalize.ts` (자연어 변환) + `packages/core/src/git-workflow/history.ts` (deploy event scan).
- **Side panel REPLACE path**: `LeftSidebar.tsx` line 65 의 `<ProjectVersionsSection ... />` 를 `<SidePanelVersionList ... />` 로 swap. `ProjectVersionsSection.tsx` 자체는 삭제 (다른 곳에서 import 되지 않는지 확인 후). `SidePanelVersionList` 내부는 collapse chevron 제거 + title key 변경 ("버전 히스토리" → "버전" / "Versions") + 기존 header right-meta `{totalTickets} · 배포 {totalDeploys}` 그대로 수용.
- **Kanban 재활용 path**: `packages/gui/src/components/workspace/main/panes/TicketReviewTab.tsx` 의 board view sub-component 추출 권장 — `VersionHistoryView` 가 동일 component (혹은 동일 hook 패턴) 호출. 신규 component 추가 X 의도. impl 시 component 추출 cost 가 크면 props 로 ticket scope 만 좁힌 형태도 OK.
- zustand store: `useWorkspace.selectedVersionId: string | null` + `setSelectedVersionId(id)` action. localStorage persist X (UI ephemeral).
- main pane tab dispatcher (T-P4-046) `TabType` enum 에 `version-history` 추가 + lazy render.
- 어휘 lint helper = `packages/core/src/lint/vocabulary.ts` — design service-flow §3.2 매핑 표 기반. T-P4-024 와 함께 추가 권장 — 본 ticket impl 시 manual smoke 로 검증해도 OK.
- side panel section 위치 = 기존 ProjectVersionsSection slot (LeftSidebar line 65). 추가 위치 이동 X.
- **Branch logic 위치**: `VersionHistoryView` 컴포넌트 top-level — `isCurrentVersion` 계산 후 conditional render. po-state.json `versions[]` schema 의 current 표식 방식 (explicit flag vs last entry) impl 진입 시 확인 후 helper `isCurrentVersionId(state, id)` 추출 권장.

---

## Activity log

- **2026-05-12** — design plan land. master-detail 채택 (OQ-1 closed). 6 OQ resolved (designer 권고 b/a/a/a/b/b). T-P4-046 dispatcher 12번째 tab type. mockup 2종 (main-pane-tab.html / side-panel-section.html) 산출.
- **2026-05-12** — §2.2 detail view bifurcation (OQ-7 closed). current → kanban (TicketReviewTab 재활용, status column todo/in-progress/qa/done) / past → linear card list (기존 mockup spec 유지). §2.2.1 / §2.2.2 / §2.2.3 / §2.2.4 추가. §5 acceptance 2 checkbox 추가. 신규 mockup 산출 X — kanban shipped UI 가 reference.
- **2026-05-12** — plan §2.1 revise — VERSIONS replace + toggle 제거 + title "버전" (user dogfood feedback). §2.1 본문 + ASCII diagram + rationale 추가. §5 acceptance 1번 checkbox 갱신 + 9번 (side panel section collapse) 제거. §6 Familiar / Predictability / Escape self-check 문구 정합 갱신. §8 Implementation notes 에 LeftSidebar line 65 swap path 추가.
