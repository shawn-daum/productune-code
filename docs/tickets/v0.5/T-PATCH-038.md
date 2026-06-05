---
ticket_id: T-PATCH-038
version: v0.5
phase: 3
type: bug
status: done
assignee: pdt-developer
qa: false
slug: cursor-active-only
---

# T-PATCH-038 — sealed PO 말풍선 blinking cursor 제거 (T-036 followup)

## BUG
T-036 텍스트 segmentation 도입 후, 한 turn 이 여러 text segment 로 쪼개지면서
**모든 sealed(이전) PO 말풍선 끝에 blinking cursor(▋)** 가 남았다. 현재
streaming 중인 맨 아래 segment 하나만 cursor 를 보여야 한다.

## 원인
`MessageBubble.tsx:70` 의 cursor 는 `message.status === 'streaming'` 으로만
gating 된다. T-036 의 seal 로직은 segment 경계(`tool` trace / AskUserQuestion
card)에서 `segSealed = true` 만 세팅하고, **sealed segment 의 `status` 는
`onDone` 까지 `'streaming'` 으로 방치**했다. 따라서 한 turn 안의 모든 sealed
segment 가 동시에 cursor 를 렌더했다.

## FIX
`store/poEvents.ts` 에 `sealActiveSegment()` 헬퍼 추가. seal 시점에
`segSealed = true` 와 함께 해당 active segment 의 `status` 를
`'streaming' → 'done'` 으로 flip → MessageBubble 이 그 말풍선의 cursor 를
즉시 끈다. 두 seal 진입점에 적용:
- `onAnnounce` 의 `tool` trace
- `onAskUserQuestion` card

seal 후 `onToken` 이 여는 새 segment 만 `status:'streaming'` → 한 시점에
살아있는 cursor 는 맨 아래 1개. cursor render(MessageBubble) 자체는 per-message
status 에만 의존하므로 무변경. `onDone` 은 기존대로 모든 segment 를 done 처리/
persist (idempotent — 이미 done 인 sealed segment 도 그대로 통과).

## files_changed
- `packages/gui/src/store/poEvents.ts`

## verify
1. tool 을 여러 번 쓰는 PO turn 진행 → 중간 sealed 말풍선에 cursor 없음,
   맨 아래 streaming segment 에만 ▋ 1개.
2. AskUserQuestion card 직전 prose 말풍선도 cursor 사라짐.
3. all-text turn(tool 없음) → 단일 말풍선, streaming 중 cursor 1개, done 시 제거.
4. `node_modules/.bin/tsc --noEmit` green, `pnpm --filter @productune/gui lint` green.
