---
ticket_id: T-PATCH-075
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
created_at: 2026-06-09T00:00:00Z
estimated_complexity: L1
risk_flags: chat-store, react-keys, message-dedupe
slug: appendmessage-dedupe-by-id
qa_status: pending
requires_qa: false
area_tag: gui-chat
---

# T-PATCH-075: appendMessage id 중복 제거 (React duplicate-key 경고)

## Context

shawn DevTools 콘솔: `Warning: Encountered two children with the same key, 'm-<...>'` 다수. ChatPanel 메시지 리스트가 `key={item.message.id}` 인데 같은 id 메시지가 두 번 들어가 중복 키 → React 가 children 중복/누락 가능(unsupported).

근본: `store/workspace.ts:357` `appendMessage: (message) => set((s) => ({ messages: [...s.messages, message] }))` — **id 중복 체크 없이 무조건 append.** 같은 id 메시지가 두 번 append(낙관적 추가 + 스트림/persist 재추가, 또는 reload 머지)되면 중복. (store 의 tab append 는 이미 id-dedupe 패턴 있음 — L242.)

## Acceptance Criteria

- [ ] AC-1: 같은 id 의 메시지를 append 하면 중복 추가되지 않음 (기존 항목 교체 또는 무시)
- [ ] AC-2: ChatPanel 메시지 리스트에서 duplicate-key 경고 사라짐
- [ ] AC-3: 정상 메시지 흐름(신규 메시지 append, 스트리밍 업데이트) 회귀 없음

## Plan

**File: `packages/gui/src/store/workspace.ts` (`appendMessage`, L357)**

id-dedupe: 이미 같은 id 가 있으면 그 항목을 교체(최신 내용 반영, 스트리밍 업데이트에도 안전) 또는 무시. 예:
```ts
appendMessage: (message) =>
  set((s) => {
    const idx = s.messages.findIndex((m) => m.id === message.id)
    if (idx !== -1) {
      const next = s.messages.slice()
      next[idx] = message            // replace (idempotent; streaming-safe)
      return { messages: next }
    }
    return { messages: [...s.messages, message] }
  }),
```
(교체 vs 무시는 dev 판단 — 스트리밍 청크가 같은 id 로 갱신되면 replace 가 맞고, 순수 중복이면 무시도 OK. replace 가 더 안전.)

스트리밍 업데이트가 appendMessage 가 아닌 별도 updater 를 쓰면 이 변경이 그 경로에 영향 없는지 확인.

## Note

L1 mechanical. dev self-verify(tsc) + shawn 콘솔에서 경고 소멸 확인.
