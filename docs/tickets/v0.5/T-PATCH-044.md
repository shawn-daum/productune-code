---
ticket_id: T-PATCH-044
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-05T12:00:00Z
estimated_complexity: L3
risk_flags: tab-ui, overflow-scroll
slug: tab-overflow-fix
qa_status: skipped
requires_qa: true
area_tag: gui-main-panel
---

# T-PATCH-044: 탭 오버플로우 처리 — fit-content 너비 + 횡슬라이드

## Request

현재 TabBar 두 가지 문제:
1. **탭이 적을 때** — 탭이 container 전체 width를 채우도록 벌어짐(flex-grow). 탭 width는 내부 텍스트에 맞게 fit-content 이어야 함.
2. **탭이 많을 때** — 우측 X 버튼이 밀려서 보이지 않게 됨. 탭 overflow 시 횡스크롤(horizontal scroll)이 가능해야 하며 각 탭의 텍스트/X 버튼은 잘리지 않아야 함.

## Acceptance Criteria

- [ ] AC-1: 탭 2~3개일 때 각 탭 width = 탭 텍스트 + 아이콘/X 패딩만큼만 차지 (stretch 없음)
- [ ] AC-2: 탭이 TabBar 가용 width를 초과할 때 가로 스크롤 가능 (scrollbar는 thin/overlay style)
- [ ] AC-3: 스크롤 상태에서도 각 탭의 X 버튼 노출 (잘리지 않음)
- [ ] AC-4: 탭 텍스트 고정 (shrink 없음) — 탭이 늘어나도 텍스트 wrap/truncate 없이 whitespace nowrap
- [ ] AC-5: 활성 탭이 스크롤 밖에 있을 경우 자동 scrollIntoView

## Plan

- `packages/gui/src/components/workspace/main/TabBar.tsx`
- 탭 컨테이너를 `display: flex; overflow-x: auto; scrollbar-width: thin;` 로 변경
- 각 탭 item: `flex-shrink: 0; width: fit-content;` (flex-grow 제거)
- 활성 탭 변경 시 `scrollIntoView({ inline: 'nearest', behavior: 'smooth' })`
