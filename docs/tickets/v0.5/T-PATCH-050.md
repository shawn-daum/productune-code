---
ticket_id: T-PATCH-050
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-05T12:00:00Z
estimated_complexity: L2
risk_flags: ipc, recent-projects
slug: recent-projects-all-methods
qa_status: skipped
requires_qa: true
area_tag: gui-home
---

# T-PATCH-050: 최근 프로젝트 — 모든 open 방식 포함

## Request

메인 화면(HomeView)의 최근 프로젝트 목록과 File > 최근 프로젝트 메뉴가 특정 방식(예: 해당 기능 직접 사용)으로만 열었을 때만 업데이트됨. 폴더 열기(onOpenFolder), 드래그앤드롭, CLI 인자 등 모든 방식으로 프로젝트를 열었을 때도 recent 목록에 추가되어야 함.

## Acceptance Criteria

- [ ] AC-1: `onOpenFolder` 경로로 프로젝트를 열면 해당 프로젝트가 recents 목록에 추가됨
- [ ] AC-2: CLI 인자로 프로젝트 디렉토리를 전달해 열어도 recents 목록에 추가됨
- [ ] AC-3: 메인 화면 HomeView 최근 목록 + File 메뉴 > 최근 프로젝트 양쪽 모두 반영
- [ ] AC-4: 중복 방지 — 같은 경로가 이미 있으면 timestamp만 갱신, 목록 최상단으로 이동
- [ ] AC-5: 최근 프로젝트 최대 N개(기존 정책) 유지

## Plan

- Electron main process에서 프로젝트 open 이벤트를 중앙화 처리
- `projects:open` IPC 핸들러(또는 openProject 함수)에서 항상 `addToRecents(projectDir, slug)` 호출
- HomeView.tsx의 `api.listProjects()` 가 모든 경로 커버하는지 확인
- `packages/gui/src/views/HomeView.tsx`, `packages/gui/src/views/workspace/shell/helpers.ts`, `packages/electron/main.ts` (또는 IPC 핸들러)
