---
ticket_id: T-PATCH-064
version: v0.5
phase: 3
type: build
status: open
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L2
risk_flags: findbar-live-search, preview-tab-find
slug: findbar-live-search-on-change
qa_status: pending
requires_qa: true
area_tag: gui-main-panel
parent_ticket: T-PATCH-058
---

# T-PATCH-064: FindBar 글자 칠 때마다 즉시 검색 (Enter 불필요)

## Context

T-PATCH-058 후속. 사용자가 검색어를 입력할 때 Enter를 누르지 않아도 즉시 검색이 되어야 함.

현재 코드에서 `handleQueryChange`는 `onChange`마다 호출되지만, `isBrowserTab || isTextTab` 조건이 true인 경우에만 실제 검색 실행됨. `preview` 타입 탭(HTML artifact)은 두 조건 모두 false라 검색이 되지 않음.

또한 BrowserTab의 경우 `runBrowserFind(q, true, false)`가 onChange마다 호출되므로 live search가 되어야 하는데, 실제로 동작하는지 확인 필요.

## Acceptance Criteria

- [ ] AC-1: 텍스트 탭(markdown, code 등)에서 글자 칠 때마다 즉시 검색 (Enter 불필요)
- [ ] AC-2: BrowserTab에서 글자 칠 때마다 즉시 검색
- [ ] AC-3: Enter는 다음 매치로 이동 (기존 동작 유지)

## Plan

**File: `packages/gui/src/components/workspace/main/LeafPane.tsx`**

`handleQueryChange` 현황 확인:
```tsx
const handleQueryChange = useCallback((q: string) => {
  setFindQuery(q)
  setMatchInfo(null)
  if (isBrowserTab) {
    runBrowserFind(q, true, false)
  } else if (isTextTab) {
    runTextFind(q, true)
  }
}, [isBrowserTab, isTextTab, runBrowserFind, runTextFind])
```

이미 onChange → 즉시 검색 구조임. 하지만 실제 렌더에서 작동하지 않는다면:

1. `TEXT_TAB_TYPES`에 `'preview'` 추가 검토:
   - `preview` 탭은 LocalHtmlViewer(iframe) 또는 BrowserTab(http)을 사용
   - LocalHtmlViewer의 경우 `window.find()`가 페이지 내 DOM을 검색 — iframe 내용도 검색 가능성 있음
   - 단, `sandbox=""` 환경에서는 `window.find()`가 iframe 내용 검색을 못할 수 있음
   - **일단 `isTextTab` 조건에 `|| activeTab?.type === 'preview'` 추가하고 테스트**

2. BrowserTab(http preview) 지원:
   - `preview` 타입이고 내부적으로 BrowserTab을 사용하는 경우
   - LeafPane은 탭 타입만 보므로, `preview` 탭에 대해서도 `browserFindRef` 연결이 필요
   - 이는 복잡하므로 일단 LocalHtmlViewer(window.find) 경로만 처리

**핵심 수정:**
```tsx
// LeafPane.tsx
const TEXT_TAB_TYPES = new Set(['markdown', 'artifact-md', 'code-view', 'doctrine-file', 'preview'])
```

`preview`를 TEXT_TAB_TYPES에 추가하여 `runTextFind(q, true)`가 호출되도록 함.

Cmd+F 오픈 조건도 동일하게 업데이트:
```tsx
// 기존
if (activeTab && (isBrowserTab || isTextTab)) {
// preview도 cmd+F로 FindBar 열 수 있도록 → isTextTab이 이미 preview 포함하면 자동 처리
```
