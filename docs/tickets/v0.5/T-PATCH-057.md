---
ticket_id: T-PATCH-057
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L3
risk_flags: html-viewer, zoom, webview
slug: html-viewer-zoom-fix
qa_status: skipped
requires_qa: true
area_tag: gui-main-panel
parent_ticket: T-PATCH-045
---

# T-PATCH-057: HTML artifact viewer +/- zoom 추가

## Context

T-PATCH-045 후속 QA. Markdown artifact(ArtifactMdTab)에는 zoom이 생겼지만 HTML viewer에는 여전히 없음.

HTML artifact는 TabType `'preview'` → `HtmlViewer.tsx`로 라우팅됨.
- `tabProps.url`이 http(s)인 경우 → `BrowserTab`으로 delegate (webview, zoom 없음)
- 그 외 로컬 파일 → `LocalHtmlViewer` (iframe, ZoomControls 코드는 있지만 실제로 안 보임)

## Acceptance Criteria

- [ ] AC-1: `preview` type HTML artifact 탭에서 +/- zoom 버튼이 헤더에 보임
- [ ] AC-2: LocalHtmlViewer iframe에서 zoom이 동작함 (CSS zoom 속성)
- [ ] AC-3: BrowserTab으로 위임되는 경우(http URL)에도 zoom 버튼 추가 — `webview.setZoomFactor(zoom)` 사용
- [ ] AC-4: zoom 범위 0.5–3.0, step 0.1 (LocalHtmlViewer 기존 상수 유지)

## Plan

**Step 1: LocalHtmlViewer 경로 확인 및 수정**

`packages/gui/src/components/workspace/main/panes/HtmlViewer.tsx`:

현재 코드에는 `ZoomControls`가 헤더 안 `!editing` 분기에 있음. 만약 렌더가 안 된다면:
- `tabProps.url`이 빈 문자열이 아닌 `file://` 또는 다른 값일 때 `isHttp` 판단 로직 확인
- `loadState !== 'done'`이면 헤더는 보이지만 body만 loading임 — ZoomControls는 loadState 무관하게 헤더에 항상 표시되므로 정상이어야 함
- 실제 렌더 경로 확인: console.log 없이 코드 로직만으로 판단

**Step 2: BrowserTab에 zoom 추가**

`packages/gui/src/components/workspace/main/panes/BrowserTab.tsx`:

1. `zoom` state 추가 (0.5–3.0, default 1.0)
2. ZoomControls import 및 navBar 우측에 배치
3. zoom 변경 시 `webviewRef.current?.setZoomFactor(zoom)` 호출
   - `ElectronWebview` interface에 `setZoomFactor(factor: number): void` 추가
4. 단, `BrowserFindHandle` forwardRef export 유지 (LeafPane이 사용 중)

**Step 3: HtmlViewer에서 BrowserTab으로 zoom props 전달**

`HtmlViewer.tsx` isHttp 분기에서 BrowserTab에 `zoomEnabled` 또는 prop 전달 방식 결정.
BrowserTab 자체에서 zoom state를 관리하는 것이 더 단순함 (Step 2 방식 선택).
