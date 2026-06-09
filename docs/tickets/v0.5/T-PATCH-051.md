---
ticket_id: T-PATCH-051
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-05T12:00:00Z
estimated_complexity: L2
risk_flags: po-chat-layout, usage-bar
slug: po-chat-usage-row-layout
qa_status: skipped
requires_qa: true
area_tag: gui-chat
---

# T-PATCH-051: PO chat panel — 세션 사용량 + 채팅 same-row 레이아웃

## Request

PO chat panel이 충분히 넓어지면(예: 세로 레이아웃 고려) 세션 사용량(UsageBar) 영역과 chat 영역이 같은 row에 들어가도록 해서 공간 활용 효율화.

## Acceptance Criteria

- [ ] AC-1: ChatPanel의 UsageBar 위치를 재검토 — 패널 너비 >= 400px 이상이면 UsageBar를 chat 입력 영역 우측 또는 좌측 인라인에 배치
- [ ] AC-2: 패널 너비 < 400px이면 기존처럼 별도 row (stack 레이아웃 유지)
- [ ] AC-3: UsageBar가 없는 경우(non-subscriber) 레이아웃 영향 없음
- [ ] AC-4: 기존 UsageBar 기능(5h/7d 진행률, 리셋 시간) 동작 유지

## Plan

- `packages/gui/src/components/workspace/ChatPanel.tsx` — UsageBar 위치 조정
- `packages/gui/src/components/workspace/chat/UsageBar.tsx` — 인라인 레이아웃 variant 추가 (optional prop)
- CSS: `display: flex; flex-direction: row` + `@container` 또는 inline width-check
