---
ticket_id: T-PATCH-065
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-08T00:00:00Z
estimated_complexity: L5
risk_flags: chat-panel, ask-user-question, modal-overlay, embedded-chat
slug: ask-user-question-full-modal-with-chat
qa_status: skipped
requires_qa: true
area_tag: gui-chat
parent_ticket: T-PATCH-062
---

# T-PATCH-065: AskUserQuestion 전체 오버레이 모달 + 내장 채팅 입력 + X 닫기

## Context

T-PATCH-062 후속 재설계. 현재 구현은 input창 위에 작은 팝업 카드만 표시. 

요구사항:
- 모달이 ChatPanel 전체 영역(메시지 목록 + 입력창)을 덮음
- 모달 내부에 질문 카드 + 채팅 입력창 UI 포함 (Claude Code UI와 동일한 패턴)
- 모달 우상단 X 버튼 클릭 시 PO가 문맥에 맞는 반응 전송

## Acceptance Criteria

- [ ] AC-1: pendingQuestion 있을 때 ChatPanel 전체를 덮는 모달 표시
- [ ] AC-2: 모달 내부에 AskUserQuestionCard(질문+선택지) 표시
- [ ] AC-3: 모달 내부 하단에 채팅 입력창 표시 (기존 ChatPanel textarea와 동일 동작)
- [ ] AC-4: 모달 안 채팅으로 전송한 메시지는 일반 채팅과 동일하게 처리됨 (api.poSendMessage)
- [ ] AC-5: 모달 우상단 X 버튼 클릭 시 모달 닫히고 PO가 문맥적 응답 전송
- [ ] AC-6: 옵션 선택(handleSelect) 후 질문 resolved → 모달 자동 닫힘
- [ ] AC-7: 모달 닫힌 후 메시지 목록에서 unresolved 카드는 숨김 (기존 T-062 AC-2 유지)
- [ ] AC-8: resolved 질문은 메시지 목록에서 chip으로 표시 (기존 T-062 AC-3 유지)

## Plan

### Step 1: ChatPanel.tsx — dismissedQuestionId 상태 + 모달 오버레이

```tsx
// 새 state
const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(null)

// pendingQuestion: dismissed 된 것 제외
const pendingQuestion = useMemo(() => {
  return [...messages].reverse().find(
    (m) =>
      m.kind === 'ask-user-question' &&
      !(m.payload as any)?.resolved &&
      m.id !== dismissedQuestionId,
  )
}, [messages, dismissedQuestionId])
```

X 버튼 핸들러:
```tsx
const handleDismissQuestion = useCallback(async () => {
  if (!pendingQuestion || !project) return
  setDismissedQuestionId(pendingQuestion.id)
  // PO에게 문맥적 응답 유도
  const api = (window as any).api
  const dismissText = '이 질문은 잠시 보류하겠습니다.'
  const userMsg = {
    id: Date.now().toString(),
    kind: 'user' as const,
    text: dismissText,
    ts: new Date().toISOString(),
  }
  appendMessage(userMsg)
  try { await api.chatAppendMessage(project.projectDir, userMsg) } catch { /* noop */ }
  useWorkspace.getState().setInFlightKind('po')
  setStreaming(true)
  try {
    await api.poSendMessage({
      projectDir: project.projectDir,
      text: dismissText,
      resume: claudeSessionId,
    })
  } catch (e) {
    setStreaming(false)
    useWorkspace.getState().setInFlightMsgId(null)
  }
}, [pendingQuestion, project, claudeSessionId, appendMessage])
```

### Step 2: 모달 JSX — ChatPanel 전체 오버레이

기존 `{pendingQuestion && <div style={questionPopover}>...}` 블록을 제거하고, ChatPanel 최상위 컨테이너 안에 아래 구조 추가 (position: absolute, inset: 0):

```tsx
{pendingQuestion && (
  <div style={questionModal}>
    {/* 우상단 X */}
    <button style={modalCloseBtn} onClick={handleDismissQuestion}>
      <X size={16} strokeWidth={2} />
    </button>

    {/* 질문 카드 (스크롤 가능) */}
    <div style={modalBody}>
      <AskUserQuestionCard message={pendingQuestion} />
    </div>

    {/* 내장 채팅 입력창 */}
    <div style={modalInputArea}>
      <textarea
        style={modalTextarea}
        value={modalDraft}
        onChange={(e) => setModalDraft(e.target.value)}
        onKeyDown={onModalKeyDown}
        placeholder={t('workspace.chat.inputPlaceholder')}
        rows={1}
        disabled={streaming || !project || rateLimited}
      />
      <button style={modalSendBtn} onClick={handleModalSend} disabled={streaming || !modalDraft.trim()}>
        {t('workspace.chat.send')}
      </button>
    </div>
  </div>
)}
```

`modalDraft` state, `handleModalSend`, `onModalKeyDown` (Cmd+Enter) 추가. `handleModalSend`는 기존 ChatPanel의 `handleSend` 와 동일 로직 (api.chatAppendMessage + api.poSendMessage).

### Step 3: 스타일 상수

```ts
const questionModal: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 100,
  background: '#111111',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const modalCloseBtn: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  background: 'transparent',
  border: 'none',
  color: '#707070',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 4,
  zIndex: 1,
}

const modalBody: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '20px 16px 8px',
}

const modalInputArea: React.CSSProperties = {
  borderTop: '1px solid #2A2A2A',
  padding: '8px 12px',
  display: 'flex',
  gap: 8,
  alignItems: 'flex-end',
  flexShrink: 0,
}

const modalTextarea: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: '#E5E5E5',
  fontSize: 13,
  resize: 'none',
  lineHeight: 1.5,
}

const modalSendBtn: React.CSSProperties = {
  background: '#7C3AED',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  borderRadius: 6,
  padding: '6px 14px',
  fontSize: 13,
  flexShrink: 0,
}
```

### Step 4: ChatPanel 컨테이너에 `position: relative` 확인

questionModal이 `position: absolute; inset: 0`으로 전체를 덮으려면 부모 컨테이너에 `position: relative` 또는 `relative`가 설정되어 있어야 함. ChatPanel의 최상위 div 스타일을 확인하고 없으면 추가.

### Note

- `questionPopover` 스타일 및 기존 T-062의 `{pendingQuestion && <div style={questionPopover}>...}` 렌더 블록은 이 티켓에서 제거(대체됨)
- `X` icon: lucide-react에서 import (이미 import되어 있을 가능성 있음, 없으면 추가)
- 모달 안 채팅 입력은 기존 ChatPanel input과 동일한 api.poSendMessage를 사용하므로 메시지가 PO에게 정상 전달됨
