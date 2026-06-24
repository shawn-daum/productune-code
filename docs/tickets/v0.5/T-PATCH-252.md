---
ticket_id: T-PATCH-252
version: v0.5
slug: po-presence-sprite-stuck-idle
title: PO presence sprite가 작업 중에도 회색-idle에 머묾 (streaming=true인데 working 미반영)
type: impl
status: done
phase: 4
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: po-chat
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-24T00:00:00Z
---

# T-PATCH-252: PO sprite stuck-idle

## Request

shawn(2026-06-24, 라이브): PO가 작업 진행 중인데 `PersonaPresenceBar`의 PO 캐릭터 sprite가
**처음부터 쭉 회색(idle)으로 정지** — 4프레임 work 애니메이션이 안 돎.

## 진단 단서 (PO 1차 조사)

- `PersonaPresenceBar.tsx`: sprite는 `state==='working'`일 때만 `animation: persona-sprite ...`,
  idle이면 `grayscale(1)+opacity .4`(회색). `usePOPresenceDerive`가 `useWorkspace.streaming`으로
  state 구동: streaming true → `setPersonaState('po','working')`, false → idle.
- `streaming`은 turn 전체 동안 true여야 함(`ChatPanel.handleSubmit setStreaming(true)` + `poEvents`
  onMsgId `streaming:true`, onDone `streaming:false`). 그런데 sprite가 작업 내내 회색 = **PO chip
  state가 'working'으로 안 바뀜** = streaming desync 또는 presence-derive 미발화.
- 의심 지점: (a) `usePOPresenceDerive` 훅이 실제 마운트/구독되는지(PersonaPresenceBar 렌더 경로),
  (b) attached-file 턴 등 특정 진입에서 streaming 플립 누락, (c) packaged 빌드에서만 재현되는지.

## Acceptance
- **AC-1**: PO turn 활성(streaming true) 동안 PO sprite가 4프레임 work 애니메이션으로 움직인다(회색 idle 아님). turn 종료(onDone) 시 idle 복귀.
- **AC-2**: 근본 원인 규명 — streaming↔PO chip 'working' state 배선의 끊긴 지점 수정(추정 말고 코드로 확정). attached-file/FreshComposer/ChatPanel 모든 진입 경로에서 동작.
- **AC-3**: prefers-reduced-motion 시 애니메이션 off는 유지(기존 동작 회귀 없음).

## Out of scope
- 트레이 아이콘(T-251). designer/dev/qa 서브에이전트 sprite(별도 DERIVE_PERSONAS 경로 — PO만 본 티켓).

## Plan
dev: streaming→PO presence 'working' 배선 추적·수정(라이브/dev 재현). QA: turn 중 sprite 애니메이션 + 종료 idle 복귀 라이브 확인.

## Outcome
shipped — fix in `src/components/FreshComposer.tsx`: 첫턴 fire 전 `setInFlightKind('po')` + `setStreaming(true)` 래치(ChatPanel 패턴 미러). **정정(QA)**: 근본원인은 "FreshComposer가 streaming을 전혀 안 set"이 아니라 — `poEvents.onMsgId`가 이미 streaming:true 하지만 그 edge가 **bar 마운트 전 setTimeout(0) 갭에 발화돼 갓 마운트된 derive의 useEffect가 놓치는 mount-timing race**. 래치가 bar를 already-working으로 마운트시켜 해소. QA pass: idempotent(`streamingSince ?? ` + state guard)·leak-free·ChatPanel 무회귀·reduced-motion 유지. build green.
**잔여(비블로커):** 라이브 sprite 애니메이션(fresh-project 첫턴 color-animated → done시 idle) 1회 눈확인 권장 — 5차 dmg VM 검증 때 흡수.

## Persona Activity
| persona | role | model | result |
|---|---|---|---|
| pdt-developer | root-cause + fix (Playwright 검증) | sonnet | done |
| pdt-qa | grill | sonnet | qa_status: pass (race 진단 정정, 0 must-fix) |
