---
ticket_id: T-PATCH-161
version: v0.5
slug: md-viewer-zoom-fix
title: Markdown viewer 줌 +/- 작동 안 함 (HTML viewer 방식으로 수정)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: md-viewer-zoom
risk_flags: []
estimated_complexity: L1
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-161: MD viewer 줌 +/- 수정

## 현 상태 (조사 완료)
- `MarkdownViewer.tsx`: zoom state/handler/`ZoomControls` 다 있음(154-163, 347-349). 적용은 wrapper div에 `fontSize: ${zoom*BASE_FONT_PX}px`(454-456)인데 **실제 콘텐츠가 안 커짐**(MdRenderer 내부가 고정 px라 부모 fontSize 상속 안 되는 등).
- `HtmlViewer.tsx`: 줌이 **작동** — iframe에 CSS `zoom: zoom` 직접 적용(534).

## Fix
`packages/gui/src/components/workspace/main/panes/MarkdownViewer.tsx` — HtmlViewer와 동일하게 wrapper에 **CSS `zoom`** 적용:
- line ~454: `style={zoomEnabled ? { ...viewerWrap, fontSize: ... } : viewerWrap}` → `{ ...viewerWrap, zoom: zoom }` (fontSize 방식 폐기).
- zoom state/handler/ZoomControls/상수(ZOOM_STEP/MIN/MAX/DEFAULT)는 그대로.
- (대안: `transform: scale(zoom)` + `transformOrigin:'top left'` — 단 레이아웃 영향 있어 CSS `zoom`이 더 깔끔, HTML과 일관.)

## Acceptance
- AC-1: MD 뷰어에서 +/- 클릭 시 콘텐츠가 실제로 확대/축소(HTML 뷰어와 동일 체감).
- AC-2: reset 동작, ZOOM_MIN/MAX clamp 유지. build PASS.
- AC-3: HtmlViewer 줌은 회귀 없음(별개 파일이지만 확인).
