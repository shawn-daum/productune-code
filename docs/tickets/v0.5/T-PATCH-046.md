---
ticket_id: T-PATCH-046
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-05T12:00:00Z
estimated_complexity: L4
risk_flags: keyboard-shortcut, main-panel, webview-interference
slug: main-panel-cmd-f-search
qa_status: skipped
requires_qa: true
area_tag: gui-main-panel
---

# T-PATCH-046: Main panel 내부 cmd+F 키워드 검색 (vscode 스타일)

## Request

Main panel 내부에서 cmd+F (macOS) / ctrl+F (Windows/Linux)로 현재 탭 콘텐츠에서 키워드 검색. vscode 참고.

## Acceptance Criteria

- [ ] AC-1: 포커스가 main panel 탭 콘텐츠 내에 있을 때 cmd+F(mac)/ctrl+F 단축키로 검색 바 토글
- [ ] AC-2: 검색 바는 탭 콘텐츠 상단(또는 하단) 오버레이 형식으로 노출 — 레이아웃 밀지 않음
- [ ] AC-3: 검색 바: 텍스트 입력 + 다음(↓) / 이전(↑) 버튼 + 결과 "N/M" 표시 + Esc 닫기
- [ ] AC-4: 텍스트 탭(Markdown, Code, ArtifactMd, DoctrineFile)에서 동작
- [ ] AC-5: HTML 뷰어(webview)에서는 `webview.findInPage()` API 사용
- [ ] AC-6: 검색 닫으면 하이라이트 해제, Esc 키 동작 보장
- [ ] AC-7: webview 내부 포커스 시 cmd+F 이벤트가 webview에 빼앗기지 않도록 처리 (IPC 또는 Electron menu 등록)

## Plan

- `packages/gui/src/components/workspace/main/TabContent.tsx` 또는 `LeafPane.tsx` — 단축키 감지 + 검색 상태 관리
- `packages/gui/src/components/workspace/main/FindBar.tsx` (신규) — 검색 UI 컴포넌트
- Electron main: `globalShortcut` 또는 menu accelerator 로 cmd+F → renderer IPC 포워딩 고려
