---
ticket_id: T-PATCH-056
version: v0.5
phase: 3
type: build
status: open
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L2
risk_flags: tabbar-css, scrollbar, tab-x-button
slug: tabbar-scrollbar-bg-x-button-fix
qa_status: pending
requires_qa: true
area_tag: gui-main-panel
parent_ticket: T-PATCH-044
---

# T-PATCH-056: TabBar scrollbar background 제거 + X 버튼 항상 표시

## Context

T-PATCH-044 후속 QA. 두 가지 잔여 문제:
1. 수평 스크롤바의 track(배경)이 어두운 회색으로 보임 — 없애야 함
2. X(닫기) 버튼이 사라짐 — T-PATCH-055에서 `totalLeafCount > 1` 조건이 추가됐는데, 탭 X 버튼은 패인 수와 무관하게 항상 활성 탭에 보여야 함

## Acceptance Criteria

- [ ] AC-1: 탭 스트립 스크롤바 track 배경이 투명 (보이지 않음)
- [ ] AC-2: 활성 탭에는 X 버튼이 항상 표시됨 (패인 수 관계없이)
- [ ] AC-3: comfortable density일 때 비활성 탭에도 X 버튼 표시 (기존 동작 유지)
- [ ] AC-4: fit-content + X 버튼이 같이 표시됨 (X가 탭 너비에 포함됨)

## Plan

**File: `packages/gui/src/components/workspace/main/TabBar.tsx`**

1. `showClose` 조건에서 `totalLeafCount > 1 &&` 제거:
   ```ts
   // before
   const showClose = totalLeafCount > 1 && (isActive || overflow.density === 'comfortable')
   // after
   const showClose = isActive || overflow.density === 'comfortable'
   ```
   - `totalLeafCount` import/variable도 함께 제거

2. 스크롤바 배경 투명:
   - `tabStrip` 함수에 `scrollbarColor: 'transparent transparent'` 추가 (Firefox)
   - 글로벌 CSS(`packages/gui/src/index.css` 또는 `globals.css`)에 아래 추가:
     ```css
     /* TabBar thin scrollbar — transparent track */
     .tab-strip-scroll::-webkit-scrollbar { height: 3px; background: transparent; }
     .tab-strip-scroll::-webkit-scrollbar-track { background: transparent; }
     .tab-strip-scroll::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 2px; }
     ```
   - `tabStrip` div에 `className="tab-strip-scroll"` 추가
   - inline style의 `scrollbarWidth: 'thin'`은 유지
