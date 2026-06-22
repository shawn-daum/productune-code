---
ticket_id: T-PATCH-072
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L1
risk_flags: tabbar, pane-close
slug: tabbar-hide-pane-close-on-lone-pane
qa_status: pending
requires_qa: false
area_tag: gui-main-panel
---

# T-PATCH-072: 마지막(유일한) pane 일 때 pane 닫기(×) 버튼 숨김

## Context

shawn hands-on (#4, 이미지): 탭 그룹(pane)이 하나뿐인데 우상단 컨트롤 클러스터의 pane 닫기 × 가 여전히 보임. 유일한 pane 은 닫을 수 없으므로(닫으면 pane 0개) × affordance 가 없어야 함. T-PATCH-070(마지막 1탭이면 per-tab × 숨김)은 per-tab × 였고, 이 건은 **pane-level × (`splitButtons` 우상단)**.

`packages/gui/src/components/workspace/main/TabBar.tsx` 의 `splitButtons` 에 있는 closePane `TooltipButton`(`<X/>`, onClosePane, ~L206-208)은 현재 pane 개수와 무관하게 항상 렌더됨(empty-bar 경로 L212-219 + 일반 경로 둘 다).

## Acceptance Criteria

- [ ] AC-1: 전체 pane(leaf) 이 1개뿐일 때 pane 닫기 × 버튼 미표시 (empty 상태 pane 포함)
- [ ] AC-2: pane 이 2개 이상이면 기존대로 pane 닫기 × 표시
- [ ] AC-3: split(좌우/상하) 버튼은 항상 유지 — 변경 없음
- [ ] AC-4: T-PATCH-070 per-tab × 동작(tabCount>1) 회귀 없음

## Plan

**File: `packages/gui/src/components/workspace/main/TabBar.tsx`**

전체 leaf(pane) 개수를 store 에서 도출(`useWorkspace` panes 트리에서 leaf count — 기존 helper `findLeafByIdLocal`/panes 순회 패턴 참고, 또는 store 에 leaf count selector 가 있으면 사용). `splitButtons` 의 closePane `TooltipButton` 을 `totalLeafCount > 1` 일 때만 렌더:

```tsx
{totalLeafCount > 1 && (
  <TooltipButton label={closePaneLabel} style={splitBtn} onClick={onClosePane}>
    <X size={14} strokeWidth={1.75} />
  </TooltipButton>
)}
```

split 버튼 2개(SplitSquareHorizontal/Vertical)는 그대로. `splitButtons` 는 empty-bar 경로(L217)와 일반 경로 양쪽에서 쓰이므로 한 곳 수정으로 둘 다 적용됨.

## Note

이전(T-055 시절) per-tab `showClose` 가 `totalLeafCount > 1` 게이팅이었다가 T-070 에서 `tabCount > 1` 로 교체됨 → `totalLeafCount` 도출 로직이 현재 TabBar 에 없을 수 있으니 panes 순회로 재도출 필요.
