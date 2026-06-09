---
ticket_id: T-PATCH-061
version: v0.5
phase: 3
type: build
status: open
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L3
risk_flags: usage-bar-layout, chat-panel
slug: usage-bar-horizontal-above-input
qa_status: pending
requires_qa: true
area_tag: gui-chat
parent_ticket: T-PATCH-051
---

# T-PATCH-061: UsageBar 수평 배치 (input창 위)

## Context

T-PATCH-051 후속 QA. 현재 구현이 UsageBar를 textarea 옆에 배치했음 (usageInline / inputWithUsageRow flex row). 요구사항: 5h / 7d 두 막대를 같은 가로줄(horizontal)에 배치하고, input창 바로 위에 고정 표시.

## Acceptance Criteria

- [ ] AC-1: UsageBar가 항상 input textarea 위에 표시됨 (너비 조건 없음)
- [ ] AC-2: 5h막대와 7d막대가 같은 수평 row에 나란히 표시됨
- [ ] AC-3: 기존 vertical(stacked) 레이아웃에서 사용하는 UsageBar는 영향 없음 (prop 없을 때 기본 동작 유지)

## Plan

### Step 1: UsageBar에 horizontal prop 추가

`packages/gui/src/components/workspace/chat/UsageBar.tsx`:

1. `horizontal?: boolean` prop 추가
2. `containerHorizontal` 스타일 추가:
   ```ts
   const containerHorizontal: React.CSSProperties = {
     display: 'flex',
     flexDirection: 'row',
     gap: 16,
     padding: '4px 12px',
     alignItems: 'center',
     borderTop: '1px solid #1C1C1C',
     background: '#0F0F0F',
     flexShrink: 0,
   }
   ```
3. render: `horizontal` prop이 true이면 `containerHorizontal`, 아니면 기존 `container` 사용
   ```tsx
   <div style={horizontal ? containerHorizontal : container}>
     <UsageRow axis="5h" ... />
     <UsageRow axis="7d" ... />
   </div>
   ```

### Step 2: ChatPanel 정리

`packages/gui/src/components/workspace/ChatPanel.tsx`:

1. `usageInline` state, `panelWidth` state, `ResizeObserver` 로직 전체 제거
2. `inputWithUsageRow` style 변수 제거, `usageInlineSide` div 제거
3. inputArea 내부 최상단에 `<UsageBar horizontal />` 배치:
   ```tsx
   <div style={inputArea}>
     <UsageBar horizontal />
     {/* existing: textarea, send button, etc. */}
   </div>
   ```
4. 사용하지 않게 된 import/type도 함께 정리
