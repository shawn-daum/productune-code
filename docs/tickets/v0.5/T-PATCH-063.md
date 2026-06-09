---
ticket_id: T-PATCH-063
version: v0.5
phase: 3
type: build
status: open
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L2
risk_flags: iframe-focus, blur-event, keyboard-shortcut
slug: html-iframe-cmd-shortcut-refix
qa_status: pending
requires_qa: true
area_tag: gui-main-panel
parent_ticket: T-PATCH-059
---

# T-PATCH-063: HTML iframe cmd 단축키 재수정 (올바른 blur 감지)

## Context

T-PATCH-059 구현이 `window.addEventListener('blur', ...)` 를 사용했는데, 이는 **OS 레벨**에서 Electron 윈도우가 다른 OS 창으로 포커스를 잃을 때만 발동. iframe이 동일 페이지 내에서 포커스를 가져가는 경우에는 발동하지 않음.

올바른 접근: `document.addEventListener('blur', ..., true)` — capture phase로 등록하면 document 내부 어느 element가 focus를 잃더라도 핸들러가 실행됨.

## Acceptance Criteria

- [ ] AC-1: 로컬 HTML artifact 뷰어(iframe) 내부 클릭 후 cmd+T / cmd+W / cmd+F 등 앱 단축키 동작
- [ ] AC-2: iframe 내 마우스 스크롤 정상 동작 유지
- [ ] AC-3: sandbox 속성 변경 없음

## Plan

**File: `packages/gui/src/components/workspace/main/panes/HtmlViewer.tsx`**

`LocalHtmlViewer` 내 `useEffect` 수정:

```tsx
// 기존 (잘못된 접근 — window blur는 OS 레벨):
useEffect(() => {
  const onWindowBlur = () => {
    requestAnimationFrame(() => {
      if (document.activeElement?.tagName === 'IFRAME') {
        frameWrapRef.current?.focus({ preventScroll: true })
      }
    })
  }
  window.addEventListener('blur', onWindowBlur)
  return () => window.removeEventListener('blur', onWindowBlur)
}, [])

// 수정 (capture phase — document 내 모든 focus 이동 감지):
useEffect(() => {
  const onBlurCapture = () => {
    requestAnimationFrame(() => {
      if (document.activeElement?.tagName === 'IFRAME') {
        frameWrapRef.current?.focus({ preventScroll: true })
      }
    })
  }
  document.addEventListener('blur', onBlurCapture, true)  // true = capture phase
  return () => document.removeEventListener('blur', onBlurCapture, true)
}, [])
```

변경 포인트:
- `window` → `document`
- `addEventListener('blur', ...)` → `addEventListener('blur', ..., true)` (capture phase 추가)
- 함수명 `onWindowBlur` → `onBlurCapture`
- `removeEventListener` 에도 `true` 추가
