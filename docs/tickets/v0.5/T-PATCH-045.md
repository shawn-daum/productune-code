---
ticket_id: T-PATCH-045
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-05T12:00:00Z
estimated_complexity: L2
risk_flags: artifact-viewer, webview-zoom
slug: artifact-detail-zoom-controls
qa_status: skipped
requires_qa: true
area_tag: gui-artifact-viewer
---

# T-PATCH-045: 산출물 상세 뷰어 줌 컨트롤 (+ / −)

## Request

산출물 상세 페이지에서 콘텐츠가 잘리는 경우가 많음 (특히 HTML). +/− 버튼으로 뷰어 내부 콘텐츠 크기 조정 필요.

## Acceptance Criteria

- [ ] AC-1: HTML 뷰어(`HtmlViewer.tsx`)에 + / − / 초기화 버튼 표시 (상단 헤더 영역)
- [ ] AC-2: + 클릭 시 zoom 10% 증가, − 클릭 시 10% 감소, 초기화 시 100% 복귀
- [ ] AC-3: zoom 범위 50%~300%
- [ ] AC-4: `ZoomControls.tsx` 가 이미 존재하면 재사용. 없으면 새로 생성하되 `ArtifactMermaidTab.tsx` 패턴 참고
- [ ] AC-5: Markdown 뷰어(`MarkdownTab.tsx`, `ArtifactMdTab.tsx`)에도 동일 zoom 컨트롤 추가
- [ ] AC-6: Code 뷰어(`CodeViewTab.tsx`)에도 font-size 조정용 zoom 추가 (vscode 스타일)

## Plan

- `packages/gui/src/components/workspace/main/panes/HtmlViewer.tsx` — webview의 `setZoomFactor` 또는 `executeJavaScript('document.body.style.zoom')` 활용
- `packages/gui/src/components/workspace/main/panes/ArtifactMdTab.tsx` — font-size scale
- `packages/gui/src/components/workspace/main/panes/ZoomControls.tsx` — 기존 파일 있으면 재사용
