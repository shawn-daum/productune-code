---
ticket_id: T-PATCH-049
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-05T12:00:00Z
estimated_complexity: L1
risk_flags: none
slug: search-pane-simplify
qa_status: skipped
requires_qa: false
area_tag: gui-explorer
---

# T-PATCH-049: 파일 탐색 검색 UI 단순화

## Request

탐색 > 파일내용 검색에서:
1. **범위 선택창 삭제** — 항상 프로젝트 전체로 고정. "현재 폴더" 옵션 제거.
2. **빈 상태 설명 텍스트 제거** — 검색어 미입력 시 나오는 "파일 내용 검색~설명~" 본문 텍스트 제거.

## Acceptance Criteria

- [ ] AC-1: SearchPane에서 범위(scope) 토글 버튼 제거
- [ ] AC-2: `scope` state 제거 (또는 `'project'`로 고정) — scopeDir 항상 null
- [ ] AC-3: 빈 상태(emptyState) 본문 설명 텍스트 제거 — `emptyTitle`만 유지하거나 완전 제거
- [ ] AC-4: 관련 locale key(`scopeTitle`, `scopeLabel`, `scopeProject`, `scopeFolder`, `emptyBody`) 미사용 처리 (삭제 또는 주석)

## Plan

- `packages/gui/src/components/explorer/SearchPane.tsx`
  - scope 관련 state/toggle 제거, scopeDir = null 고정
  - empty state 섹션에서 body text 제거
- `packages/gui/src/locales/ko.json` / `en.json` — 미사용 key 정리 (선택)
