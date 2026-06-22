---
ticket_id: T-PATCH-006
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-02T00:00:00Z
completed_at: 2026-06-02T00:00:00Z
duration_min: 40
estimated_complexity: L4
risk_flags:
  - brand-color-tint (alpha variants of #FF6B2B→#8B5CF6 must recalculate — #FF6B2B33→#8B5CF633 etc.)
  - version-select-mutex (removing "onSelect removed" constraint — verify no regression on rename-guard logic)
  - artifacts-scope-ipc (electron/ipc/artifacts.ts also needs update, not just ArtifactsPane.tsx)
  - header-action-slot (refresh button must move from paneToolbar to LeftSidebar header — lift load callback or use event bus)
---

# T-PATCH-006: Phase 3-A UI Polish

## Request

### KR

Phase 3-A 빌드 이후 발견된 UI 피드백 6종을 일괄 수정한다.
모두 기존 컴포넌트 내부 수정이며 신규 UX 설계는 없다.

---

## 변경 명세

### 1. 브랜드 컬러 전체 교체 (F0)

`#FF6B2B` (주황) → `#8B5CF6` (보라). `--accent: #8B5CF6`은 이미 `md-recipes.css`에 선언됨.
알파 변형도 동일 비율로 교체:

| 기존 | 교체 |
|------|------|
| `#FF6B2B` | `#8B5CF6` |
| `#FF6B2B33` | `#8B5CF633` |
| `#FF6B2B50` | `#8B5CF650` |
| `#FF6B2B66` | `#8B5CF666` |
| `#1A1208` (주황 배경 tint) | `#1A1030` (보라 배경 tint) |

**영향 파일 (하드코딩 위치):**
- `src/App.tsx` :335, :398
- `src/components/NewProjectModal.tsx` :51, :126
- `src/components/FreshComposer.tsx` :158 (주석), :236
- `src/components/GitHubOAuthFlow.tsx` :145
- `src/components/workspace/PhaseBreadcrumb.tsx` :46
- `src/components/workspace/WorkflowRulesPanel.tsx` :164
- `src/components/workspace/Titlebar.tsx` :12, :49
- `src/components/workspace/chat/PoFab.tsx` :96
- `src/components/workspace/chat/TodoChip.tsx` :77
- `src/components/workspace/chat/TodoListPanel.tsx` :254
- `src/components/workspace/SidePanelVersionList.tsx` :271 (배경 tint), :273, :284, :286
- `src/components/workspace/VersionsPanel.tsx` :125, :128, :133, :198, :209, :251, :282

---

### 2. 버전 선택 하이라이트 — 상호배제 + 탭 포커스 연동 (F1)

**문제:** 과거 버전 선택 후 현재 버전 클릭 시 과거 버전 highlight가 유지됨.

**수정:**

**`SidePanelCurrentVersion.tsx`**
- Props에서 `onSelect: (id: string) => void` 추가
- 현재 버전 카드 클릭 핸들러에서 `onSelect(currentVersionId)` 호출
  (기존 주석 "onSelect removed — current-version card click must never touch selectedVersionId" 제거)
- `isSelected = selectedVersionId === currentVersionId`
- selected 스타일: 테두리 `2px solid #8B5CF6` + 배경 `#1A1030`

**`LeftSidebar.tsx`**
- `SidePanelCurrentVersion`에 `onSelect={(id) => handleVersionClick(id)}` 전달
  - `handleVersionClick`은 기존에 `SidePanelPastVersions`에서도 사용 중이므로 공유

**탭 포커스 연동 (VSCode-like):**
- `activeIcon` prop을 활용해 해당 패널이 활성 탭일 때만 selection을 full brand color로 렌더
- `activeIcon !== 'project'` 일 때: selectedVersionId 기억은 유지하되 highlight를 dim (`opacity: 0.4` 또는 배경 투명+테두리만 유지)
- `SidePanelCurrentVersion`과 `SidePanelVersionList` 양쪽에 `isFocused: boolean` prop 추가
  - `isFocused = activeIcon === 'project'` (LeftSidebar에서 계산해 전달)

다른 탭(explorer, artifacts 등)에서도 동일 `isFocused` 패턴 사용:
- explorer: `activeIcon === 'explorer'`
- artifacts: `activeIcon === 'artifacts'`
- 각 패널 내부 선택 상태도 `isFocused` 여부에 따라 brand color vs dim 처리

---

### 3. 탭 헤더 "productune" 제거 + 액션 버튼 위치 (F2a)

**`LeftSidebar.tsx`**
- header 영역에서 `<div style={projectSlugMuted}>{project.slug}</div>` 제거
- header 오른쪽 끝에 `headerAction` 슬롯 추가:
  ```tsx
  <div style={header}>
    <div style={tabTitle}>{TAB_TITLES[activeIcon] ?? activeIcon}</div>
    <div style={headerActionSlot}>{headerAction}</div>
  </div>
  ```
- `activeIcon === 'artifacts'`일 때 headerAction에 RefreshCw 버튼 렌더
  → ArtifactsPane의 `load` 콜백을 끌어올리거나 `window.dispatchEvent('artifacts:reload')`로 이벤트 버스 사용

**전략 권장: 이벤트 버스 방식**
```ts
// LeftSidebar header 버튼 클릭
window.dispatchEvent(new CustomEvent('artifacts:reload'))

// ArtifactsPane useEffect
useEffect(() => {
  const handler = () => load()
  window.addEventListener('artifacts:reload', handler)
  return () => window.removeEventListener('artifacts:reload', handler)
}, [load])
```

- ArtifactsPane 내부의 `paneToolbar`+`refreshIconBtn` 블록은 제거

---

### 4. 산출물 탭 스코프 — docs/artifacts/ 만 (F2b)

**`electron/ipc/artifacts.ts`**
- `scanDir(path.join(projectDir, 'docs', 'prd'), ...)` 블록 제거
- `scanDir(path.join(projectDir, 'docs', 'designer'), ...)` 블록 제거
- `docs/artifacts/<version>/` 만 스캔 (기존 로직 유지)

**`ArtifactsPane.tsx`**
- `ArtifactEntry.scopeGroup` 타입: `'prd' | 'artifacts' | 'designer'` → `'artifacts'` 단일
- `SCOPE_LABELS` 단순화
- groups 렌더링 로직 단순화 (scope header label 제거 또는 `docs/artifacts/` 표시)
- empty state 문구: "docs/artifacts/ 폴더에 산출물이 생기면 여기 나타납니다."

---

### 5. 탐색 탭 — hidden 파일 기본 표시 + 토글 제거 (F3b)

**`src/store/explorer.ts` line 36:**
```ts
showHidden: false,  // 기존
showHidden: true,   // 수정
```

**`ExplorerPane.tsx`:**
- `showHidden`, `toggleShowHidden` 관련 toggle 버튼 UI 제거
  (lines 128-132 영역 — Eye/EyeOff 버튼)
- `toggleShowHidden` import도 제거

---

### 6. ChatPanel — "round-N" 제거 + 전송버튼 텍스트 흰색 (F4)

**`ChatPanel.tsx` ctxCaption (lines 198-202):**

```ts
// 기존
const round = versionsCount > 0 ? versionsCount : phaseNum > 0 ? 1 : 0
if (!round && !ticketId) return t('workspace.chat.idleCtx')
if (ticketId) return `round-${round || 1} · ${ticketId} ${action}`
return `round-${round}`

// 수정
if (!ticketId) return t('workspace.chat.idleCtx')
return `${ticketId} ${action}`
```

`versionsCount`, `round` 변수도 함께 제거.

**`ChatPanel.tsx` sendBtn (line ~540):**
```ts
color: '#0F0F0F',  // 기존 (검정 → 보라 배경에 가독성 불량)
color: '#FFFFFF',  // 수정
```

---

## Acceptance Criteria

1. 앱 내 주황(`#FF6B2B`) 계열 색상이 사라지고 보라(`#8B5CF6`) 계열로 표시됨
2. 프로젝트 탭에서 과거 버전 선택 후 현재 버전 클릭 시 과거 highlight 즉시 해제됨
3. 현재 버전 카드에 `2px solid #8B5CF6` 테두리가 표시됨
4. 다른 사이드바 탭(explorer 등) 으로 전환하면 프로젝트 탭 내부 selection이 dim 처리됨
5. 모든 탭 헤더 우측에 "productune" 슬러그 텍스트가 없음
6. 산출물 탭 헤더 우측에 RefreshCw 버튼이 표시되고 클릭 시 목록 새로고침됨
7. 산출물 탭에 docs/prd/, docs/designer/ 항목이 나타나지 않음
8. 탐색 탭에서 숨김 파일(`.`으로 시작)이 기본 표시됨
9. 탐색 탭에 Eye/EyeOff 토글 버튼이 없음
10. PO 채팅 헤더 컨텍스트에 "Round-N" 형식이 나타나지 않음
11. 전송 버튼 텍스트가 흰색으로 표시됨
