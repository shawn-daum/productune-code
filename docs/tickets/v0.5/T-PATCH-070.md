---
ticket_id: T-PATCH-070
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L1
risk_flags: tabbar
slug: tabbar-hide-close-on-last-tab
qa_status: pending
requires_qa: false
area_tag: gui-main-panel
---

# T-PATCH-070: 탭 그룹 마지막 1개일 때 X(닫기) 버튼 숨김

## Context

shawn: "탭 그룹은 마지막 하나만 있을때에는 x버튼이 없어야해." 탭 그룹(leaf pane 의 tab strip)에 탭이 하나만 남았을 때, 그 탭의 per-tab 닫기(×) 버튼이 보이면 안 됨. 이미 shipped 된 T-PATCH-055 "last-pane no-X"(pane 이 하나면 pane 닫기 숨김)와 같은 패턴을 tab 단위에 적용.

마지막 탭은 cmd+W 로 닫으면 useKeyboardShortcuts 가 closePane 으로 폴백하므로(빈 그룹 방지), ×로 직접 닫는 affordance 는 불필요/혼란.

## Acceptance Criteria

- [ ] AC-1: tab strip 에 탭이 1개(`tabCount === 1`)일 때 그 탭의 × 버튼 미표시
- [ ] AC-2: 탭이 2개 이상일 때 기존 × 표시 로직(`isActive || overflow.density === 'comfortable'`) 유지
- [ ] AC-3: pane 닫기 버튼(onClosePane, splitBtn) 동작은 무관 — 건드리지 않음

## Plan

**File: `packages/gui/src/components/workspace/main/TabBar.tsx` (L297)**

`showClose` 조건에 `tabCount > 1` 을 AND:

```tsx
// 기존
const showClose = isActive || overflow.density === 'comfortable'
// 수정
const showClose = (isActive || overflow.density === 'comfortable') && tabCount > 1
```

`tabCount` 는 이미 L179 에 `const tabCount = leaf.tabs.length` 로 존재. 1줄 변경.
