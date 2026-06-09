---
ticket_id: T-PATCH-062
version: v0.5
phase: 3
type: build
status: done
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L4
risk_flags: ask-user-question, chat-panel, popover, ipc
slug: ask-user-question-popup-above-input
qa_status: skipped
requires_qa: true
area_tag: gui-chat
---

# T-PATCH-062: AskUserQuestion 카드 → input 위 팝업/모달

## Context

현재 PO의 질문 카드(ask-user-question kind)가 채팅 메시지 목록 인라인에 렌더됨. 요구사항: Claude Code UI처럼 input창 위에 팝업으로 표시.

## Acceptance Criteria

- [ ] AC-1: 미답변 ask-user-question이 있을 때 input창 위에 팝업 카드 표시
- [ ] AC-2: 채팅 메시지 목록에서 미답변 ask-user-question은 숨김 (카드 미표시)
- [ ] AC-3: 답변 후(resolved) 메시지 목록에서는 기존 resolved chip 표시 유지
- [ ] AC-4: 기존 handleSelect IPC(api.chatAnswerQuestion) 동작 유지
- [ ] AC-5: 팝업 카드 스타일은 AskUserQuestionCard 기존 스타일과 일관성 유지

## Plan

### Step 1: ChatPanel에서 pendingQuestion 계산

`packages/gui/src/components/workspace/ChatPanel.tsx`:

```tsx
const pendingQuestion = useMemo(() => {
  return [...messages].reverse().find(
    (m) => m.kind === 'ask-user-question' && !(m.payload as any)?.resolved
  )
}, [messages])
```

### Step 2: input창 위에 팝업 렌더

inputArea div 바로 위에 (형제 element로):
```tsx
{pendingQuestion && (
  <div style={questionPopover}>
    <AskUserQuestionCard message={pendingQuestion} />
  </div>
)}
<div style={inputArea}>
  ...
</div>
```

`questionPopover` 스타일:
```ts
const questionPopover: React.CSSProperties = {
  background: '#1A1A1A',
  borderTop: '1px solid #2A2A2A',
  borderRadius: '8px 8px 0 0',
  padding: '12px 16px 8px',
  flexShrink: 0,
}
```

### Step 3: 메시지 목록 인라인 렌더 조건부 숨김

`packages/gui/src/components/workspace/chat/MessageBubble.tsx` (또는 해당 렌더 위치):

`ask-user-question` kind 렌더 시:
- `resolved` 상태면 → 기존처럼 resolved chip/bubble 표시
- `resolved` 아닌데 pendingQuestion인 경우 → null 반환 (팝업으로 대체됨)

방법: MessageBubble에 `suppressIfUnresolved?: boolean` prop 추가하거나, ChatPanel 메시지 목록 렌더에서 `pendingQuestion?.id === item.message.id && !resolved` 조건으로 skip.

**ChatPanel 메시지 루프 쪽이 더 단순함**:
```tsx
// 메시지 목록 렌더 시
if (
  msg.kind === 'ask-user-question' &&
  !(msg.payload as any)?.resolved &&
  pendingQuestion?.id === msg.id
) {
  return null  // popup에서 렌더하므로 목록에선 숨김
}
```

### Note

- `AskUserQuestionCard` import, `handleSelect`, `api.chatAnswerQuestion` 로직은 변경 없음
- 팝업 포지셔닝: absolute/fixed portal 불필요. ChatPanel 하단 flex column 안에서 inputArea 바로 위 형제 div면 충분 (Claude Code UI와 동일한 방식)

## Close note (PO 2026-06-09)

Superseded by T-PATCH-065 — small input-popup redesigned into full ChatPanel overlay modal. Implemented in T-065 (questionModal/dismissedQuestionId/modalCloseBtn).
