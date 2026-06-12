---
ticket_id: T-PATCH-132
version: v0.5
round: patch
type: fix
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: medium
estimated_complexity: L2
qa_status: self-verify
qa_loops: 0
slug: fresh-composer-first-turn-streaming-state
area_tags: [gui]
created_at: 2026-06-12
---

# T-PATCH-132 — FreshComposer 첫 PO 턴의 streaming 상태 누락 수정

## §1. Request

shawn (대화, 2026-06-12): 아이디어 입력 화면(FreshComposer)에서 PO 대화를 시작하고 전체 UI가 나타난 후, PO가 작업 중이라는 신호가 없었다 — PersonaPresenceBar의 PO 칩이 켜지지 않고, 채팅에는 보라색 커서 블록만 있는 빈 버블만 보여서 멈춘 것처럼 보였다.

**파일**: `packages/gui/src/store/poEvents.ts`

**근본 원인**: `workspace.streaming`은 유저 액션 핸들러(ChatPanel.handleSubmit, handleModalSend, AskUserQuestionCard, PendingGateChip, injectUserMessage)에서만 `true`로 설정된다. FreshComposer(첫 아이디어 입력 화면, `src/components/FreshComposer.tsx`)는 `api.poSendMessage`를 fire-and-forget으로 호출하며 `setStreaming(true)`를 호출하지 않는다. 또한 `poEvents.onMsgId`(스트리밍 placeholder 버블 생성)도 `streaming`을 설정하지 않았다.

결과적으로 FreshComposer에서 시작한 첫 PO 턴에서 `streaming`이 `false`로 유지 → `PersonaPresenceBar.usePOPresenceDerive`가 PO 칩을 idle로 유지(깜빡임/하이라이트 없음) → 커서 블록만 있는 빈 버블처럼 보임.

**수정 위치**: `poEvents.ts`의 `onMsgId` 핸들러의 `useWorkspace.setState`에서 `streaming: true` 추가. 모든 진입 경로(FreshComposer 첫 턴 포함)를 커버하는 범용 수정. `onDone`에서 이미 `streaming: false`로 되돌리므로 누수 없음.

## §2. Acceptance

- **BDD-1**: FreshComposer 아이디어 화면에서 새 프로젝트를 시작할 때, 첫 PO 턴이 시작되면(onMsgId placeholder 생성), `workspace.streaming`이 `true`가 되어 PersonaPresenceBar PO 칩이 working 상태(깜빡이는 보라색 점 + 보라색 라벨)로 진입한다.
- **BDD-2**: 해당 첫 턴이 완료되면(onDone), `streaming`이 `false`로 되돌아가고 PO 칩이 idle로 복귀한다.
- **BDD-3**: 정상 ChatPanel 시작 턴은 변경 없음 — handleSubmit이 이미 `streaming: true`를 설정하며 onMsgId의 set은 idempotent(이중 효과 없음, 컴포저/정지 버튼 동작 동일).
- **BDD-4**: 메시지 버블 렌더링 및 턴 세그멘테이션 변경 없음; 기존 스트리밍 커서가 활성 텍스트 세그먼트에 계속 표시된다.

## §4. Outcome

### 변경 코드 발췌 (`poEvents.ts`)

```ts
// ── po:onMsgId — placeholder bubble 생성 ─────────────────────────────────
offFns.push(api.poOnMsgId?.((msgId: string) => {
  const kind: MessageKind = useWorkspace.getState().inFlightKind ?? 'po'
  const placeholder: Message = {
    id: msgId,
    role: 'assistant',
    kind,
    text: '',
    status: 'streaming',
    created_at: new Date().toISOString(),
  }
  // T-PATCH-132: streaming:true를 여기서 설정하여 FreshComposer 첫 턴 포함
  // 모든 진입 경로에서 PersonaPresenceBar working 상태를 보장.
  useWorkspace.setState((s) => ({
    messages: [...s.messages, placeholder],
    inFlightMsgId: msgId,
    streaming: true,
  }))
  // ...
}))
```

### BDD 매핑 / 논증 (Electron 런타임 headless 불가 → 정적·타입·빌드 검증 + 코드 추적)

- **BDD-1 (FreshComposer 첫 턴 streaming:true)**: FreshComposer → `api.poSendMessage` → main-process `runPoTurn` → `cb.onMsgId(msgId)` → renderer `po:onMsgId` IPC → `poEvents.ts` onMsgId 핸들러 → `useWorkspace.setState({ ..., streaming: true })`. PersonaPresenceBar는 `useWorkspace(s => s.streaming)`을 구독하여 `streaming === true`일 때 working 상태를 렌더. PASS.
- **BDD-2 (onDone에서 streaming:false 복귀)**: `poEvents.ts` onDone 핸들러(line 315)에서 이미 `return { messages: next, streaming: false, inFlightMsgId: null }` 설정 — 기존 코드 미수정으로 누수 없음. PASS.
- **BDD-3 (ChatPanel 턴 idempotent)**: ChatPanel.handleSubmit이 `api.poSendMessage` 전에 `setStreaming(true)` 호출 → onMsgId에서 동일한 값으로 재설정 → Zustand 상태 변경 없음(동일 값 set은 no-op) → 기존 동작 완전 보존. PASS.
- **BDD-4 (버블 렌더링 / 세그멘테이션 무변경)**: `segActiveId`, `segSealed`, `turnSegIds`, `lastChunkBySeg` 초기화 코드 미수정. MessageBubble, onToken, onAnnounce, onDone 핸들러 미수정. PASS.

### self-verify 결과

- `pnpm --filter @productune/gui build` → **PASS** (tsc 타입체크 통과 + vite 3개 번들 `✓ built` in 3.80s/89ms/9ms).
