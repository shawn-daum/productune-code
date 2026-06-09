---
ticket_id: T-PATCH-059
version: v0.5
phase: 3
type: build
status: open
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L3
risk_flags: iframe-sandbox, keyboard-shortcut, focus
slug: html-iframe-cmd-shortcut-fix
qa_status: pending
requires_qa: true
area_tag: gui-main-panel
parent_ticket: T-PATCH-047
---

# T-PATCH-059: HTML iframe 클릭 후 cmd 단축키 복원

## Context

T-PATCH-047 후속 QA. BrowserTab(webview)의 before-input-event 포워딩은 구현됐지만, 로컬 HTML 산출물 뷰어는 `<iframe srcdoc sandbox="">` 를 사용해서 webview가 아님.

iframe 내부를 클릭하면 window의 keyboard focus가 iframe 내부 document로 이동함. 이 상태에서 cmd+T 등 앱 단축키가 window.keydown을 받지 못해 무시됨.

`sandbox=""` (비어있음): `allow-scripts`, `allow-same-origin` 모두 없음 → iframe.contentWindow 접근 불가 → cross-origin 이벤트 포워딩 불가.

## Acceptance Criteria

- [ ] AC-1: 로컬 HTML artifact(preview tab) iframe 내부 클릭 후에도 cmd+T (새 탭), cmd+W (탭 닫기), cmd+F (검색), cmd+1-9 (탭 전환) 등 앱 단축키가 동작
- [ ] AC-2: iframe 내 스크롤은 정상 동작 유지
- [ ] AC-3: sandbox 속성 변경 없음 (보안 유지)

## Plan

**File: `packages/gui/src/components/workspace/main/panes/HtmlViewer.tsx`**

`LocalHtmlViewer` 함수 내부에서:

1. `frameWrapRef` 추가: `const frameWrapRef = useRef<HTMLDivElement | null>(null)`
2. iframe을 감싸는 div에 `ref={frameWrapRef}` + `tabIndex={-1}` 적용
3. window blur 이벤트 → focus 복원 effect 추가:
   ```tsx
   useEffect(() => {
     const onWindowBlur = () => {
       // When iframe captures focus, window loses it.
       // Re-focus the frame container so app-level keydown handlers fire again.
       requestAnimationFrame(() => {
         if (document.activeElement?.tagName === 'IFRAME') {
           frameWrapRef.current?.focus({ preventScroll: true })
         }
       })
     }
     window.addEventListener('blur', onWindowBlur)
     return () => window.removeEventListener('blur', onWindowBlur)
   }, [])
   ```
4. `previewWrap` div에 `outline: 'none'` 추가 (tabIndex -1 focus ring 방지):
   ```tsx
   <div style={{ ...previewWrap, outline: 'none' }} ref={frameWrapRef} tabIndex={-1}>
   ```

Note: `window.addEventListener('blur', ...)` 는 iframe이 focus를 가져갈 때 발생함 (window losing focus to its child iframe). `document.activeElement`가 `IFRAME` 태그인 경우에만 복원하여 다른 창 전환 시에는 적용하지 않음.
