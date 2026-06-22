---
ticket_id: T-PATCH-047
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-05T12:00:00Z
estimated_complexity: L2
risk_flags: webview-keyboard, ipc
slug: html-viewer-cmd-t-fix
qa_status: skipped
requires_qa: true
area_tag: gui-main-panel
---

# T-PATCH-047: HTML 뷰어 내부 클릭 후 cmd+T 탭 닫힘 문제

## Request

HTML 뷰어(webview) 내부를 클릭해 포커스가 webview 안으로 들어가면 cmd+T 등 앱 레벨 단축키가 동작하지 않음. webview가 keyboard event를 먹어버려서 앱 커맨드가 안 먹히는 듯.

## Acceptance Criteria

- [ ] AC-1: HTML 뷰어(webview) 내부에 포커스가 있어도 cmd+T / cmd+W / cmd+1~9 등 앱 레벨 단축키는 정상 동작
- [ ] AC-2: webview 내부 키보드 입력(form 등)은 그대로 webview에 전달
- [ ] AC-3: cmd+T로 현재 탭 닫기 정상 동작 확인

## Plan

- `packages/gui/src/components/workspace/main/panes/HtmlViewer.tsx`
- Electron `webview`에서 `before-input-event` IPC 수신 후 앱 레벨 단축키(cmd+T, cmd+W 등)를 `ipcRenderer.send`로 main에 포워딩
- 또는 `webContents.on('before-input-event')` + main process 처리
- 참고: T-PATCH-023에서 webview pointer-events 처리 선례 있음
