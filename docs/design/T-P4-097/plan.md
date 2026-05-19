# T-P4-097 plan — Side panel master = "현재 버전" + "Version history" 2-section split

**Slug**: `side-panel-master-redesign` **Round**: phase4-r4 **Author**: pdt-designer
**Created**: 2026-05-12 **Status**: OQ resolved (v2 — 2026-05-12) — ticket emit ready
**Output file**: `docs/design/T-P4-097/plan.md` (본 문서) **Output ticket**: `docs/tickets/phase4/T-P4-097.md` (companion turn)
**Companion**: [design-direction.md](../design-direction.md), [service-flow-and-screens.md](../service-flow-and-screens.md), [design-system.md](../design-system.md) §1.5
**Deps**: `T-P4-023` (Version-History master-detail + isCurrentVersion 분기 land), `T-P4-095` (version-id naming regex `^v\d+(\.\d+)?$`)
**Companion (precedent)**: `docs/design/T-P4-095/plan.md` (naming convention rationale)

---

## §1 Background

### 1.1 사용자 요청 verbatim

> 프로젝트 side panel 구성
> 현재 버젼 (처음 init 하면 v1을 디폴트로 설정 이후 prd 작성하면서 version naming 바뀔 수 있음)
> {version-title} {phase name-hover시 전체 phase 표시} → 클릭시 main panel에 {version title} 탭 (기존 ticket tab 재사용) 표시
> Version history
> 현재 버젼 제외한 이전 버젼 listup
> {version-title} {phase-아마 close겠지?} → 클릭시 version history (ticket completed at sort)

### 1.2 현 상태 (T-P4-023 1.5차 land 후)

- `SidePanelVersionList.tsx` — VERSIONS 1-section master. 모든 `versions[]` (current 포함) 을 단일 리스트로 desc sort, 최상단 = isLatest. Row click → `version-history:main` tab + `setSelectedVersionId(id)`.
- `VersionHistoryView.tsx` — `isCurrentVersion === (selectedVersionId === poState.current_version)` 분기:
  - `true` → 4-column **Kanban** (todo / in-progress / review / done) + filter toolbar.
  - `false` → linear ticket-card list sorted by `completed_at` desc + filter toolbar + Vercel deploy events.
  - `__unassigned__` 버킷도 동일 linear path.
- Main tab type 은 **하나** (`version-history`, id `version-history:main`). 내부 분기로 처리 → 사용자는 같은 탭이 내용만 바뀐다고 인식.

### 1.3 redesign 동기 (사용자 mental model 측면)

- "**현재 작업**" 과 "**지난 기록**" 은 사용자 멘탈 모델상 서로 다른 객체다. 같은 list / 같은 tab 에 섞이면 "지금 v1 작업 중인가? 아니면 이미 끝난 건가?" 가 row 위치로만 구분된다 — 약한 시각 신호.
- 사용자 요청 = **2 sp-section 으로 명시적 분리** + **현재 버전은 별도 탭 (제목 = `v1`)** + **과거 버전은 "버전 히스토리" 탭으로 묶기**.
- Phase 정보를 row 메타로 노출 (현재 = 진행 중인 phase, 과거 = "완료" 단일 상태). hover 시 5-phase 전체 strip — `PhaseStrip variant=strip` 의 hover-expand 패턴과 의미 일관.

### 1.4 ROADMAP 정합

- 본 turn 에서 ROADMAP Round 4 표에 1-line entry 추가 (memory `feedback_roadmap_row_brevity` — title + 1줄 intent + dep). 상세 spec 은 본 plan + 본 ticket md.

---

## §2 Decisions (a–g)

### (a) 현재 버전 클릭 시 main tab type

**Decision**: `version-history` tab 재사용 + **2 개의 tab id 로 분리** (semantic 분리, component 단일).

**옵션 비교**:

| 옵션 | 장점 | 단점 | 평가 |
|---|---|---|---|
| **A1**. `ticket-review` 재사용 (versionFilter prop) | tab type 1 개 절약 | ticket-review 는 단일 ticket detail viewer 다. 의미 mismatch | ✘ 부적합 |
| **A2**. `version-history` tab + 동일 tab id (현 구현, 내부 분기) | net delta 0 | 사이드 클릭 시 같은 탭의 내용이 통째 바뀜 → 사용자가 어느 객체를 보는지 시각 추적 어려움. tab 제목 = 항상 "버전 히스토리" 가 사용자 요청 ("{version title} 탭") 과 어긋남 | ✘ 사용자 요청 불일치 |
| **A3**. `version-history` tab + **2 tab id 분리**: `version-current:{id}` (title=`v1`) + `version-history:main` (title=`버전 히스토리`). 내부 component 는 동일 `VersionHistoryView`, `isCurrentVersion` 분기 그대로. | tab 제목으로 현재 vs 과거 즉시 구분. 컴포넌트 재사용 (design-direction §reduce-surface). T-P4-023 1.5차 작업 보존. 두 탭을 동시에 열어 비교 가능. | tab id 가 versionId 에 묶이므로 PRD 진행 중 version rename 시 tab id stale → **OQ-5 resolved (§5)**: store `updateTabId(oldId, newId)` helper 로 **in-place id swap** (close+reopen X). | **✓ 채택** |
| **A4**. 신규 컴포넌트 `CurrentVersionView` + `version-current` tab type 신설 | 의미 분명 | TabType enum + dispatcher route + i18n key 등 surface 증가. KanbanBoard 코드 중복. | ✘ surface 과다 |

**근거**: design-direction §reduce-surface ("기존 컴포넌트 재사용 강제") + service-flow §3.1 mockup-as-source (Main pane = `version-history` tab 단일 type). T-P4-023 1.5차 land 한 `isCurrentVersion → kanban` 분기 = 본 요구 그대로 충족, 단지 tab id 만 분리해서 시각 분리 강화.

### (b) Phase name source

**Decision**:

| 대상 | source | display |
|---|---|---|
| **현재 버전** row | `PoState.current_phase` (1..5) → `PHASE_NAMES[current_phase]` ("PRD" / "Design" / "Build" / "Deploy" / "Close") | row 메타 우측 = 현재 phase label + 색 dot (PhaseStrip 의 1-dot variant 와 동일 토큰) |
| **과거 버전** row | 항상 **"완료"** (OQ-1 resolved §5) — `versions[i].ended_at != null` 또는 `versions[i].outcome != null` 이면 closed 로 간주. (※ schema 상 versions[i].current_phase 필드 없음 → 과거는 의미상 모두 완료) | row 메타 우측 = **"완료" pill** (neutral gray-on-dark). service-flow §3.2 어휘 매핑 표에 `closed → 완료` 1 행 추가 필요 (별 turn, lint 영향 없음). |
| **hover** (양쪽) | 별도 component — `PhaseStrip variant=strip` 의 hover-expand 5-dot 패턴 재사용. **CSS `:hover` group selector** 로 구현 (OQ-2 resolved §5). popover library / 외부 dep 도입 X. | 현재 버전: active dot = current_phase 위치. 과거 버전: 5 dot 전부 done (gray). |

**근거**: 현 `PhaseStrip` 컴포넌트는 `poState.current_phase` 만 보고 1 / 5 dot 분기. 과거 versions[]의 phase trajectory 는 schema 미보존 → "완료" 단일 상태로 단순화 (Few Things, §1.5.1). 라벨 = "완료" — 한글 카탈로그 자연어, "Closed" 는 영어 카탈로그용. T-P4-057 protected-token linter 영향 없음 (보호어 6 분류 — 페르소나/doctrine/stage/status/schema/product — 와 무관).

### (c) v1 default — init flow

**Decision**: PO `project:installAt` 또는 onboarding wizard 의 **첫 PRD turn 직전 step** 에서 `po-state.json` 에 다음을 시드 push:

```jsonc
{
  "current_version": "v1",
  "current_phase": 1,        // PRD
  "versions": [{ "id": "v1", "started_at": "<ISO now>" }],
  "phase_history": []
}
```

- **초기 시드 (강제)** — UI fallback "v1" 표시 only 는 brittle (versions[] 비었을 때 row 자체가 없으면 master-detail 깨짐).
- **rename 허용** — PRD clarity loop 중 사용자가 다른 id (예: `v0.1`) 로 바꾸길 원하면 PO 가 `versions[0].id` + `current_version` 동시 갱신. regex 검증은 T-P4-095 의 shared validator (`packages/gui/src/lib/version-id.ts` 또는 `packages/core/po/version-id.ts`) 거침. invalid → 거부 + 사용자 안내 "버전 이름 형식: v1 또는 v0.1".
- **rename 영향** — `selectedVersionId` 가 stale 가능. workspace store 에 rename guard 추가 + **`updateTabId(oldId, newId)` helper** 로 열린 tab id 도 in-place swap (§g 참조 + OQ-5 resolution).
- **방어** — versions[] 가 비어있고 current_version 도 없으면 sidebar 가 "현재 버전" section 에 read-only fallback row 표시 ("v1 (대기 중)", click 비활성, hint = "PRD 작성 시작 시 활성화됩니다") — empty state §1.5.3.

**근거**: T-P4-095 §1 — `v1` only valid initial id. Init 시 PoState 시드 = 단일 진실 출처 (UI fallback ad-hoc 보다 robust).

### (d) Version history row "완료" badge

**Decision**: row 메타 우측 = 한 개의 신호 — **`ended_at != null` OR `outcome.observed_result != null` 이면 "완료" pill**.

> **[T-P4-110 fix]** `!!outcome` (object 존재) 가 아닌 `!!outcome?.observed_result` (실측값 set) 기준. Planning-time outcome object (north_star / input_metrics / validation_method) 는 close trigger 가 아님.

- 라벨 = "완료" (OQ-1 resolved §5). 영어 카탈로그 = `"Closed"` (T-P4-057 보호어 미해당, 자유 번역).
- `versions[i].outcome` 의 enum mapping (north_star / observed_result / retrospective_path) 은 **side panel row 에서 노출 X** — 정보 과부하 (§1.5.1 Few Things).
- 회고 보기 / outcome 상세는 **Main 의 `version-history` 탭 헤더** 에 표시 — 현재 `VersionHistoryView` 의 `headerSubtitle` 에 이미 ticket count · deploy count · duration 노출. outcome 요약 (1 줄) 추가 가능 (별 turn).
- Side panel row 메타 = pill 1 개 + 날짜 1 개. 끝.

**근거**: Few Things § 1.5.1 — sidebar row 의 primary signal = "어느 버전인가" + "완료 여부" 2 가지로 한정.

### (e) Side panel 구조 (2 sp-section split)

**Decision**: 기존 `SidePanelVersionList` 의 단일 "버전 히스토리" sp-section 을 **2 sp-section** 으로 split. Phase strip 자리 (위쪽) 는 그대로 유지 (Project tab top), 그 아래로 본 master 가 들어옴.

```
┌─ Project tab body ────────────────────────────┐
│ ── sp-sec-hdr: PHASE ──                       │
│ [PhaseStrip variant=strip]                    │
│ ── sp-sec-hdr: 현재 버전 ──            (1 row) │
│ [ v1 ]  Build  ▸                  ◯ 오늘  │  │  ← row (click → main: version-current:v1)
│ ── sp-sec-hdr: VERSION HISTORY ── (N rows)    │
│ [ v0.2 ]  완료             3·1     2026-05-10│
│ [ v0.1 ]  완료             7·2     2026-05-04│
│ [ legacy/phase3 ]  완료    12·0    2026-04-20│
│ [ 미배정 ]  —              4       —         │  ← unassigned bucket
└───────────────────────────────────────────────┘
```

**Section header spec**:

| sp-sec-hdr | i18n key | 우측 메타 | rationale |
|---|---|---|---|
| `현재 버전` (CURRENT VERSION) | `workspace.versionHistory.sidePanel.currentTitle` | 우측 = 현재 phase 색 dot only (label 은 row 메타에 있음) | 1-row section. 시각 anchor = "지금 작업 중인 것" |
| `버전 히스토리` (VERSION HISTORY) | `workspace.versionHistory.sidePanel.title` (기존 재사용) | 우측 = "{N}개 · 배포 {M}" (현 구현 유지, 단 N 은 과거 버전만 count) | 과거 list. count 메타로 규모 신호 |

**Transient version transition (OQ-4 resolved §5)**:
- 사용자가 PO 와 함께 Close phase 마무리 후 다음 version 으로 cycle 직전, `versions[current].outcome != null` OR `versions[current].ended_at != null` 가 set 되는 순간 = **transient close 상태**.
- 그 시점부터 **즉시 "현재 버전" section 에서 해당 row 제거 + "버전 히스토리" section 최상단으로 이동**. "현재 버전" section 은 read-only fallback row 표시 ("다음 버전 시작 대기 중 — PO 와 새 PRD 시작 시 활성화됩니다", click 비활성).
- 새 version 이 PO 에 의해 시드되면 (`current_version` = new id + `versions[]` 에 push) 새 row 가 "현재 버전" section 에 자리잡고 transient 해소.
- Determination logic:
  ```ts
  const currentVersion = poState.versions.find(v => v.id === poState.current_version)
  const isCurrentClosed =
    !!currentVersion?.outcome?.observed_result ||  // [T-P4-110] observed_result 기준 (outcome object 존재 ≠ closed)
    !!currentVersion?.ended_at
  // isCurrentClosed === true → 해당 row 는 history section 으로 (현재 section 은 fallback)
  ```

**Row layout (양 section 공통)** — 기존 `VersionRow` 재사용 + props 확장:

```tsx
<VersionRow
  versionId="v1"
  phaseLabel="Build"           // or "완료" (closed)
  phaseColor="#FF6B2B"         // build = orange; completed = #707070
  ticketCount={5}
  deployCount={1}
  latestActivityDate="2026-05-12T..."
  isCurrent={true}             // 신규 prop — rename: isLatest → isCurrent
  isSelected={selectedId === 'v1'}
  onClick={...}
/>
```

**Row 시각 토큰**:
- 좌 = version pill (현재 = orange `pillLatest`, 과거 = purple `pillPast` 그대로).
- 가운데 = phase label (small caption, phase color 토큰).
- 우 = "ticket·deploy" mono + 날짜 mono (기존 그대로).
- selected = `borderLeft 2px PO-orange` + `background #1A1208` (기존 `rowStyle(true)` 재사용).
- hover = background `#1A1A1A` (기존 그대로).

**Hover phase popover** (OQ-2 resolved — **CSS-only**):
- row 자체 hover 시 phase label 우측 영역에 5-dot strip 노출. 별도 popover 컴포넌트 / 라이브러리 / portal 사용 X.
- 구현 패턴:
  ```tsx
  // VersionRow 내부 (Tailwind-style 가정 — 실제 inline style 동일 효과)
  <button className="version-row group">
    <span>{versionPill}</span>
    <span className="phase-label">{phaseLabel}</span>
    {/* default = hidden, group-hover 로 표시 */}
    <span className="phase-popover hidden group-hover:flex">
      <PhaseStrip poState={poState} variant="strip" forceExpanded />
    </span>
  </button>
  ```
  - inline style 버전: `position: absolute; right: 4px; top: 50%; transform: translateY(-50%); opacity: 0; pointer-events: none;` → row `:hover` 시 `opacity: 1; pointer-events: auto;`. 0.15s ease transition.
- `PhaseStrip variant=strip` 컴포넌트에 **`forceExpanded?: boolean` prop 추가** — 기본 동작은 mouse-driven expand 유지하면서, 부모가 강제로 5-dot 펼친 상태 렌더 가능. row hover ↔ strip hover 의 이벤트 경계 충돌 회피.
- 과거 버전 (완료 상태) 의 strip = 5 dot 전부 done (gray). 현재 버전 strip = active dot 만 phase color.

**Empty state**:
- 현재 버전 section 비었을 때 (transient close 직후 또는 versions[] 자체 비어있음):
  - "v1 (대기 중) — PRD 작성 시작 시 활성화됩니다" (init 전).
  - "다음 버전 시작 대기 중 — PO 와 새 PRD 시작 시 활성화됩니다" (transient close 후).
  - 양쪽 모두 click 비활성, read-only fallback row.
- Version history section 비었을 때: 기존 emptyState 재사용 (`workspace.versionHistory.sidePanel.empty`).

### (f) Version naming convention 통합 (T-P4-095 정합)

**Decision**: 본 ticket = T-P4-095 의 **consumer** — naming validation logic 재사용, 신규 logic 정의 X.

- side panel row 의 version pill 라벨 = `version.id` 그대로 (slug prefix 없음 — T-P4-095 §4 마이그레이션 후 보장).
- init 시 default = `v1` (T-P4-095 §3 valid 예시 의 head).
- PRD turn 중 사용자가 rename 요청 (예: "v0.1 으로 바꿔줘") → PO 가 `version-id.ts` validator 호출 후 `versions[0].id` + `current_version` 동시 갱신.
- side panel = `poState.current_version` + `versions[]` 단일 source. selectedVersionId 가 rename 영향받으면 §g rename guard + `updateTabId` 로 따라감.

**Dep order**: T-P4-095 land 후 본 ticket 시작 권장 (T-P4-095 의 shared validator 가 import 가능해야 함). 만약 parallel 진행 시 본 ticket 내부에 stub validator 두고 T-P4-095 land 시 swap (소소).

### (g) Zustand store — selectedVersionId 분기 + tab dispatch + updateTabId helper

**Decision**: store 의 `selectedVersionId` 는 그대로 유지. 분기는 **side panel 클릭 핸들러 안에서** tab id 를 다르게 발급. **추가**: store 에 `updateTabId(oldId, newId)` helper 신설 (rename 시 in-place swap — OQ-5 resolved §5).

```ts
// SidePanelVersionList → handleRowClick
function handleRowClick(versionId: string, isCurrent: boolean) {
  setSelectedVersionId(versionId)
  if (isCurrent) {
    openTab(
      `version-current:${versionId}`,
      'version-history',                  // ← tab type 동일
      { mode: 'current' },                // ← view 내부 hint (props)
      versionId                           // ← tab title = "v1"
    )
  } else if (versionId === '__unassigned__') {
    openTab(
      `version-unassigned:main`,
      'version-history',
      { mode: 'past' },
      t('workspace.versionHistory.unassigned.label')  // "미배정"
    )
  } else {
    openTab(
      `version-history:main`,             // ← 기존 ID 유지 (과거 multi-select 1 탭 공유)
      'version-history',
      { mode: 'past' },
      t('workspace.versionHistory.title') // "버전 히스토리"
    )
  }
  window.dispatchEvent(new CustomEvent('version-select', { detail: { versionId } }))
}
```

**View 분기** — `VersionHistoryView` 의 `isCurrentVersion` 계산은 그대로 (`selectedVersionId === poState.current_version`). props.mode 는 보조 hint only (탭 제목 결정용) — 분기 진실 출처 = store.

**Rename guard + in-place tab id swap (OQ-5 resolution)**:

```ts
// store/workspace.ts — 신규 helper
updateTabId: (oldId: string, newId: string, newTitle?: string) => set((state) => {
  // pane tree 재귀 탐색하여 매칭 tab 의 id (+ optional title) 갱신
  // 기존 tabs[i].props 보존. activeTabId 도 oldId 매칭 시 newId 로 swap.
  // 구현: walkTree(state.paneTree, leaf => { ... })
}),

// LeftSidebar 또는 workspace store 의 subscribe-side effect
useEffect(() => {
  const cv = poState?.current_version
  if (!cv) return

  // 1. selectedVersionId 가 stale (이전 current_version id) → 새 id 로 swap
  if (
    selectedVersionId &&
    !versions.some(v => v.id === selectedVersionId) &&
    selectedVersionId !== '__unassigned__' &&
    selectedVersionId === prevCurrentVersionRef.current  // rename 케이스 한정
  ) {
    setSelectedVersionId(cv)
    // 2. 열린 tab id 도 in-place swap — close+reopen X (사용자 컨텍스트 유지)
    updateTabId(
      `version-current:${prevCurrentVersionRef.current}`,
      `version-current:${cv}`,
      cv  // newTitle
    )
  }
  prevCurrentVersionRef.current = cv
}, [poState?.current_version, poState?.versions])
```

**Auto-select on mount**:
- 기존 `SidePanelVersionList` 의 first-mount auto-select 로직 (versions[0] = latest 자동 click) 은 유지하되 **target = current_version row** 로 변경. mount 시 `setSelectedVersionId(poState.current_version)` + `openTab('version-current:{cv}', ...)`.
- transient close 상태 (isCurrentClosed === true) 면 auto-select target = "현재 버전 section fallback" — tab open 하지 않음.

---

## §3 Side panel structure (mockup ASCII + props sketch)

### 3.1 ASCII mockup (260px wide)

```
┌─ sidebar 260px (Project tab) ─────────────────────────────┐
│ ┌─ header 44px ───────────────────────────────────────┐  │
│ │ PROJECT                              paepyeong-meta │  │
│ └─────────────────────────────────────────────────────┘  │
│ ┌─ sp-sec-hdr (PHASE) ─────────────────────────────────┐  │
│ │ • Build                                              │  │  ← PhaseStrip variant=strip (1-dot default)
│ └──────────────────────────────────────────────────────┘  │
│ ┌─ sp-sec-hdr (현재 버전) ─────────────────────────────┐  │
│ │  현재 버전                                     ●Build│  │  ← sec-hdr 우측 = current phase dot only
│ ├──────────────────────────────────────────────────────┤  │
│ │▌[v1]   Build      5·1            오늘              │  │  ← row (selected = orange left bar)
│ └──────────────────────────────────────────────────────┘  │
│ ┌─ sp-sec-hdr (VERSION HISTORY) ───────────────────────┐  │
│ │  버전 히스토리                          3개·배포 1   │  │  ← 우측 메타 = 과거 count
│ ├──────────────────────────────────────────────────────┤  │
│ │ [v0.2]  완료      3·1            2026-05-10         │  │
│ │ [v0.1]  완료      7·0            2026-05-04         │  │
│ │ [미배정] —        4              —                  │  │  ← unassigned bucket (맨 아래)
│ └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Transient close mockup** (isCurrentClosed === true):

```
│ ┌─ sp-sec-hdr (현재 버전) ─────────────────────────────┐  │
│ ├──────────────────────────────────────────────────────┤  │
│ │ (다음 버전 시작 대기 중 — PO 와 새 PRD 시작 시 활성) │  │  ← fallback, click 비활성
│ └──────────────────────────────────────────────────────┘  │
│ ┌─ sp-sec-hdr (VERSION HISTORY) ───────────────────────┐  │
│ │ [v1]   완료       5·1            오늘 ← top (just closed) │
│ │ [v0.2] 완료       3·1            2026-05-10            │
│ │ ...                                                    │
│ └──────────────────────────────────────────────────────┘  │
```

### 3.2 Component props sketch

```tsx
// SidePanelVersionList → 2-section refactor.
// 명시적으로 component 분리 권장: SidePanelCurrentVersion + SidePanelPastVersions.
// 공통 VersionRow 는 재사용.

interface VersionRowProps {
  versionId: string
  phaseLabel: string           // 'Build' | 'PRD' | ... | '완료'
  phaseColor: string           // phase token color
  ticketCount: number
  deployCount: number
  latestActivityDate: string | null
  isCurrent: boolean           // (rename isLatest → isCurrent)
  isSelected: boolean
  onClick: () => void
  // hover popover = CSS-only (no callback prop); see §2(e) Hover phase popover
}

interface SidePanelCurrentVersionProps {
  poState: PoState | null
  selectedVersionId: string | null
  onSelect: (id: string) => void
}

interface SidePanelPastVersionsProps {
  poState: PoState | null
  selectedVersionId: string | null
  unassignedCount: number
  pastTicketCounts: Map<string, number>
  pastDeployCounts: Map<string, number>
  onSelect: (id: string) => void
}

// PhaseStrip — forceExpanded prop 추가 (hover popover 용)
interface PhaseStripProps {
  poState: PoState | null
  variant?: 'strip' | 'chip'
  forceExpanded?: boolean    // 신규 — 부모가 5-dot 펼친 상태 강제 (CSS hover popover 안에서 사용)
}
```

**LeftSidebar.tsx 갱신** (project tab body 영역):

```tsx
{activeIcon === 'project' && (
  <div style={projectBody}>
    <div style={secHdr}>{t('workspace.phaseStrip.sectionLabel')}</div>
    <PhaseStrip poState={poState} variant="strip" />

    {/* 1. 현재 버전 — 항상 1 row (또는 read-only fallback) */}
    <SidePanelCurrentVersion
      poState={poState}
      selectedVersionId={selectedVersionId}
      onSelect={(id) => handleVersionClick(id, /*isCurrent*/ true)}
    />

    {/* 2. 버전 히스토리 — 과거 + 미배정 */}
    <SidePanelPastVersions
      poState={poState}
      selectedVersionId={selectedVersionId}
      onSelect={(id) => handleVersionClick(id, /*isCurrent*/ false)}
      {...derivedCounts}
    />
  </div>
)}
```

---

## §4 Tab dispatch rules

| Row 종류 | tab id | tab type | props | tab title |
|---|---|---|---|---|
| 현재 버전 row | `version-current:{versionId}` | `version-history` (기존) | `{ mode: 'current' }` | `{versionId}` (예: `v1`) |
| 과거 버전 row (closed) | `version-history:main` (단일 공유 tab) | `version-history` (기존) | `{ mode: 'past' }` | i18n `workspace.versionHistory.title` ("버전 히스토리") |
| 미배정 bucket row | `version-unassigned:main` | `version-history` (기존) | `{ mode: 'past' }` | i18n `workspace.versionHistory.unassigned.label` ("미배정") |

**Routing 진실 출처** = `selectedVersionId` (store). View 컴포넌트 `VersionHistoryView` 의 `isCurrentVersion === (selectedVersionId === poState.current_version)` 분기 그대로 유지. `props.mode` 는 **탭 제목** 결정 보조용 hint — 분기에 영향 X.

**Tab lifecycle**:
- 같은 row 재클릭 → 이미 열린 탭 focus (기존 `openTab` 동작 유지).
- 다른 row 클릭 →
  - 현재 ↔ 현재 (id 변경 = rename) → **`updateTabId` helper 로 in-place swap** (close + reopen X — OQ-5 resolved §5). 사용자의 pane focus / scroll 위치 보존.
  - 현재 → 과거 → 별 탭 (`version-history:main`) open.
  - 과거 → 과거 (다른 versionId) → 동일 탭 (`version-history:main`) reuse, 내용만 갱신 (selectedVersionId 변경으로 view 재렌더).
- Tab close (X 클릭) → tab pane 에서 제거. `selectedVersionId` 는 그대로 유지 (다음 row 클릭 시 다시 열림).
- **Version transient close (§e)** → "현재 버전" section 의 row 제거 + history top 으로 이동. 이미 열린 `version-current:{id}` 탭은 그대로 (사용자가 직접 X 누르기 전까지 — view 는 isCurrentVersion 가 false 로 바뀌어 linear card list 로 자동 재렌더).

**Out of scope** (별 ticket):
- Tab pin / Tab "현재 버전" 자동 reopen on app launch — Workspace pane tree restore 와 연동 (T-P4-046 follow-up).
- Cross-version 비교 view (e.g. 두 탭 split-pane 옆에 띄우기) — Phase 5 별 ticket.

---

## §5 Open Questions

| ID | Question | Resolution | Status |
|---|---|---|---|
| **OQ-1** | "닫힘" 라벨 한글 어휘 — "닫힘" / "완료" / "Closed" / phase color pill 만 (텍스트 없음) 중 어느 게 service-flow §3.2 어휘 표 정합? | **"완료"** 채택. T-P4-057 protected-token 미해당 (보호어 6 분류와 무관). service-flow §3.2 어휘 매핑 표 `closed → 완료` 1 행 추가 (별 turn). 영어 카탈로그 = `"Closed"`. | ✓ resolved (PO directive 2026-05-12) |
| **OQ-2** | Phase hover popover — CSS `:hover` group selector vs popover library | **CSS `:hover` group selector** 채택. 외부 library / portal / popover token 도입 X. PhaseStrip 컴포넌트에 `forceExpanded?: boolean` prop 추가하여 부모가 5-dot 펼친 상태 강제. row `:hover` → 자식 popover `opacity: 0 → 1` transition 0.15s. | ✓ resolved (PO directive 2026-05-12) |
| OQ-3 | Past versions section 의 정렬 — `started_at` desc (기존) vs `ended_at` desc | started_at desc 유지 (default). transient close 후 즉시 top 으로 올라가야 하므로 `ended_at ?? started_at` desc 권장 — impl 시 확정. | ◐ minor (default OK) |
| **OQ-4** | Current 버전 row 의 phase 가 Close 일 때 "현재 버전" section 에 그대로? 아니면 즉시 history 로 옮김? | **즉시 history 로 옮김**. determination = `versions[current].outcome != null OR versions[current].ended_at != null`. 현재 section = read-only fallback row ("다음 버전 시작 대기 중"). 새 version 시드 시 transient 해소. §2(e) Transient version transition + §3.1 mockup 참조. | ✓ resolved (PO directive 2026-05-12) |
| **OQ-5** | Tab "현재 버전" rename 시 동작 — 이전 tab 자동 close vs replace tab id | **in-place id swap** (close + reopen X). store 에 `updateTabId(oldId, newId, newTitle?)` helper 신설 — pane tree 재귀 walk + tab id/title swap + activeTabId 매칭 시 swap. 사용자의 pane focus / scroll 보존. | ✓ resolved (PO directive 2026-05-12) |
| OQ-6 | "미배정" 버킷의 phase 메타 — 빈 ("—") vs 가장 빈도 높은 unassigned 티켓의 phase | "—" 채택 (default). | ◐ minor (default OK) |
| OQ-7 | Sidebar collapse → expand 시 selectedVersionId 보존 | zustand store 자동 보존 OK. impl smoke 로 확인. | ◐ smoke |
| OQ-8 | i18n key 추가 — `workspace.versionHistory.sidePanel.currentTitle`, `workspace.versionHistory.sidePanel.closed`, `workspace.versionHistory.sidePanel.currentFallback`, `workspace.versionHistory.sidePanel.currentFallbackTransient` — locale parity (T-P4-057) 통과 필요 | impl 시 ko/en 동시 추가. | ◐ impl |

---

## §6 Dependencies

| Ticket | Status | Why dep | Order |
|---|---|---|---|
| **T-P4-023** (버전 히스토리 카드 UI + 1.5차 isCurrentVersion 분기) | land | `VersionHistoryView` 의 `isCurrentVersion → kanban` 분기 = 본 ticket 의 current-version 렌더 동일 컴포넌트 reuse 의 기반. `SidePanelVersionList` master 도 동일. | T-P4-023 first |
| **T-P4-095** (version-id naming regex) | todo (parallel) | `version-id.ts` shared validator + paepyeong migration 의 consumer. side panel pill 라벨이 `v1` / `v0.1` (slug prefix 없음) 임을 보장. | T-P4-095 first (권장) 또는 parallel + stub |
| T-P4-046 (pane tree restore) | land | Tab id 분리 (`version-current:{id}` vs `version-history:main`) 가 pane tree json 에 직렬화 — restore 시 둘 다 살아남아야 함. `updateTabId` helper 가 동일 walkTree 로직 reuse 가능. | 별 ticket — restore smoke 만 |
| T-P4-057 (locale parity lint) | land | 신규 i18n key 4 개 한/영 동시 추가 lint 통과. "완료" 는 protected-token 미해당 (T-P4-057 보호어 6 분류와 무관). | impl 중 |

---

## §7 §1.5 self-check (design-system UX principles)

| Sub-rule | 검증 | 결과 |
|---|---|---|
| **2-1 Few Things** | Project tab 안 primary section 수 = 3 (Phase / 현재 버전 / 버전 히스토리). row 메타 = pill + phase + count + date 4 토큰 — 마지노선. row primary action = 1 (click open). | ✓ pass |
| **2-2 Familiar** | Master-detail (sidebar list + main viewer) = VS Code SCM / GitHub repo branches 패턴 친숙. 2-section split = Activity Bar Project tab 의 다른 sub-section (Phase / Versions) 와 동일 sec-hdr 톤. | ✓ pass |
| **3-1 Predictability** | row 클릭 = 항상 main tab open. selected 표식 = 좌측 2px PO-orange (기존 그대로). empty state = `Empty` 컴포넌트 ((c) fallback + transient fallback §e). rename = in-place id swap (사용자 컨텍스트 보존). | ✓ pass |
| **3-2 Feedback** | row hover = bg 변경 + CSS-only phase strip popover (`opacity 0→1` 0.15s transition). row click = main tab open (즉시 시각 변화) + selected 표식 변경. async 없음 → loader 불필요. | ✓ pass |
| **3-3 Escape** | tab X 클릭 = 닫기. side panel collapse = Activity Bar 재클릭 (기존 mechanism). row click 은 destructive 아니므로 confirm 없음. transient close 시 자동 tab close 도 안 함 — 사용자가 직접 닫음 (escape 보장). | ✓ pass |

**Anti-pattern 점검**:
- ❌ "row 클릭 후 무반응" 없음 — 즉시 tab open + selected 표식.
- ❌ "side panel 의 row 가 4 + 개 토큰 + N 줄로 폭주" 없음 — 1 row = 1 줄 (pill + phase + count + date).
- ❌ "현재 버전이 어디 있는지 못 찾음" 없음 — 별도 sp-section 으로 시각 분리.
- ❌ "rename 시 작업 컨텍스트 손실" 없음 — `updateTabId` in-place swap.
- ❌ "Close phase 끝났는데 현재 버전 자리에 계속 박혀있음" 없음 — transient close determination 으로 즉시 history 이동.

---

## Activity log

- **2026-05-12** — v1. Plan 초안 작성. decisions (a)–(g) 채택. 모든 결정의 default 는 "기존 컴포넌트 재사용 + tab id 분리만" 의 minimal-delta path. T-P4-023 1.5차 land 보존. ticket emit 별 turn.
- **2026-05-12 (v2 — OQ resolved)** — PO directive 로 OQ-1/2/4/5 resolved. (1) 완료 라벨 채택 ("닫힘" 폐기, T-P4-057 보호어 무관). (2) CSS `:hover` group selector 채택 — popover library 도입 X, PhaseStrip 에 `forceExpanded` prop 추가. (3) Version transient close determination — `outcome != null OR ended_at != null` 이면 즉시 history 로 이동 + 현재 section read-only fallback. (4) Tab rename = `updateTabId(oldId, newId, newTitle?)` helper 로 in-place swap (close+reopen X). 모든 ASCII mockup / props sketch / dispatch table / §1.5 self-check 동기 갱신. ticket emit ready.

## Promotion Candidates

다음 promotion 후보 — 본 plan 의 핵심 design decision 1 줄 (project tier):

- (2026-05-12) side-panel-master-redesign: master = "현재 버전" + "Version history" 2 sp-section split, tab id 분리 (`version-current:{id}` / `version-history:main`), tab type 단일 (`version-history`), version transient close (outcome|ended_at != null) → 즉시 history 이동, rename = `updateTabId` in-place swap — design-direction §reduce-surface + T-P4-023 1.5차 land 재사용
