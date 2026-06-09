---
ticket_id: T-PATCH-074
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L2
risk_flags: webview, pointer-capture, resize-drag
slug: resize-drag-webview-pointer-capture
qa_status: pending
requires_qa: false
area_tag: gui-layout
---

# T-PATCH-074: 리사이즈 드래그 중 webview 포인터 캡처 차단 (커서 멈춤 수정)

## Context

shawn: HTML 뷰어(webview) 열린 상태에서 **chat width 드래그 중 커서가 webview 위를 지나가면 멈춤/고장**. webview 가 드래그 중 포인터 이벤트를 가로채 mousemove/mouseup 이 끊김(커서 stuck).

선례: 탭 드래그는 이미 `tabDragActive` store 플래그로 해결 — `BrowserTab.tsx:303` `tabDragActive ? {pointerEvents:'none'} : webviewEl`, `LeafPane.tsx:416` 캡처 오버레이. 리사이즈 드래그엔 같은 보호가 없음.

리사이즈 핸들 2종: `ColumnResizeHandle.tsx`(chat width 등 컬럼) + `main/ResizeHandle.tsx`(pane split). 둘 다 드래그 중 webview pointer-events 차단 필요.

## Acceptance Criteria

- [ ] AC-1: webview 열린 상태에서 chat width 리사이즈 드래그가 커서 멈춤 없이 매끄럽게 동작
- [ ] AC-2: pane split 리사이즈(ResizeHandle) 드래그도 동일하게 webview 위에서 끊김 없음
- [ ] AC-3: 드래그 종료(mouseup) 후 webview pointer-events 정상 복구(클릭/스크롤 동작)
- [ ] AC-4: 탭 드래그(tabDragActive) 기존 동작 회귀 없음

## Plan

**Store: `packages/gui/src/store/workspace.ts`**
`tabDragActive` 와 같은 패턴으로 `resizeDragActive: boolean` + `setResizeDragActive` 추가 (또는 기존 드래그 플래그를 일반화).

**Resize handles:**
- `ColumnResizeHandle.tsx` + `main/ResizeHandle.tsx`: drag 시작(onMouseDown)에 `setResizeDragActive(true)`, 종료(window mouseup / drag end)에 `setResizeDragActive(false)`. (현재 드래그 lifecycle 에 훅.)

**webview gating: `BrowserTab.tsx:303`**
`(tabDragActive || resizeDragActive) ? {...webviewEl, pointerEvents:'none'} : webviewEl`.

**(option) 캡처 오버레이**: 필요 시 `LeafPane.tsx:416` 의 tabDragActive 오버레이처럼 resizeDragActive 에도 투명 캡처 레이어를 깔아 mousemove 연속성 보장(webview pointer-events:none 만으로 충분하면 생략).

## Note

QA 불요(상호작용), shawn hands-on 으로 webview 위 드래그 매끄러움 확인.
