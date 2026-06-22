---
ticket_id: T-PATCH-053
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-05T12:00:00Z
estimated_complexity: L3
risk_flags: po-chat-header, phase-display
slug: po-chat-header-phase-redesign
qa_status: skipped
requires_qa: true
area_tag: gui-chat
---

# T-PATCH-053: PO chat 헤더 phase 표시 + status 위치 + 세션 초기화 버튼

## Request

현재 PO 채팅 상단은 PhaseStrip chip(현재 단계만 표시) + ctxCaption(상태) + 세션 재시작 아이콘 버튼. 개선:

1. **Phase 표시**: 현재 chip(단일 phase) → 전체 phase 순서대로 나열 + 현재 phase 강조 (`PRD > Design > Build > Deploy > Close` 형식, 이미 `PhaseBreadcrumb.tsx` 존재)
2. **Status(대기중 등)**: ctxCaption을 PO 채팅 title 우측으로 이동 (title row에 배치)
3. **세션 재시작 버튼**: 아이콘 버튼(RefreshCw) → `세션 초기화` 텍스트 버튼으로 변경

## Acceptance Criteria

- [ ] AC-1: ChatPanel header row에 `PO` 배지 + `PO 채팅` title + [status badge] 순서로 배치
- [ ] AC-2: title 아래 row에 `PhaseBreadcrumb` 컴포넌트 사용 — 현재 phase 강조(이미 구현됨)
- [ ] AC-3: ctxRow의 PhaseStrip chip 제거 (PhaseBreadcrumb로 대체) — ctxCaption은 title row 우측으로 이동
- [ ] AC-4: 세션 재시작 버튼 → `세션 초기화` 텍스트 버튼 (RefreshCw 아이콘은 제거하거나 텍스트 앞에 배치)
- [ ] AC-5: 세션 초기화 버튼 위치: title row 우측 또는 breadcrumb row 우측
- [ ] AC-6: locale key `workspace.chat.restartSession` → `세션 초기화` 로 업데이트

## Plan

- `packages/gui/src/components/workspace/ChatPanel.tsx`
  - header 구조 변경: title row에 ctxCaption(status) 추가
  - ctxRow: PhaseStrip chip → PhaseBreadcrumb 교체 (import 변경)
  - 세션 초기화 버튼: icon → text button
- `packages/gui/src/components/workspace/PhaseBreadcrumb.tsx` — 이미 전체 phase 표시 구현됨, 재사용
- `packages/gui/src/locales/ko.json` — `restartSession` key 업데이트
