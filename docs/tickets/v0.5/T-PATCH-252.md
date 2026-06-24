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

## ⚠️ RE-OPEN (2026-06-24) — 1차 fix(FreshComposer) 실효 0 for user's case

shawn 5차(Productune.app, fix 포함)에서 **여전히 sprite 회색**. 그의 repro = **기존 프로젝트
ChatPanel에서 "Attached files" 전송**(FreshComposer 첫턴 아님). `ChatPanel.handleSubmit:163`은
첨부 전송도 `setStreaming(true)` 함 → streaming은 true로 가는데도 sprite 회색 = 1차 fix가 건드린
FreshComposer 경로와 무관. 공통 증상(image #2·#4): 첨부전송 → "도구 N개" → **응답 버블 없이
"대기 중"** → sprite 회색 내내.
가설(택1 규명 필요): (a) tool-only 턴이 응답 없이 조기 done → streaming true→false 너무 빨라 sprite
미인지, (b) **streaming이 turn 활성 중 false로 desync**(status 대기중과 sprite회색이 둘 다 잘못 — T-221류 work-state desync), (c) packaged 빌드에서 usePOPresenceDerive/sprite keyframe 미작동(dev 하니스는 통과). → **cua-VM 라이브 repro로 (a/b/c) 확정 후 재수정.**

## cua 재현 결론 (2026-06-24) — sprite 버그 아님, 진짜 원인 = TCC-denied Read silent-fail

5차 dmg(Productune.app) cua 재현:
- plain-text PO 턴 → **sprite 정상 활성화**(주황 work-sprite, 스트리밍 내내; 종료 idle 복귀). 배선 OK.
- 파일 Read 턴(user repro) → **macOS TCC 다이얼로그** "Productune … access Downloads folder". user 첨부가 `~/Downloads`라 발생. **Allow 시 PO 정상 응답 완료.**
- ∴ user의 "응답없음+회색" = Downloads 첨부 → PO Read에 TCC 프롬프트 → 미허용/거부 → **Read 거부 → 턴이 응답 없이 즉시 종료** → "도구 1개"+대기중+회색(턴 종료라 회색이 정상). "처음부터 회색"=턴이 1초내 실패 종료.

→ **sprite 자체는 정상.** 1차 FreshComposer 래치 fix는 별개 minor race 교정(유효, 유지). **진짜 버그 = tool(Read) TCC-거부/실패 시 턴 silent 종료(사용자 무안내)** → 신규 T-PATCH-255로 분리. 본 티켓(sprite)은 **재현 불가(정상)로 close**.

## Out of scope
- 트레이 아이콘(T-251). designer/dev/qa 서브에이전트 sprite(별도 DERIVE_PERSONAS 경로 — PO만 본 티켓).

## Plan
dev: streaming→PO presence 'working' 배선 추적·수정(라이브/dev 재현). QA: turn 중 sprite 애니메이션 + 종료 idle 복귀 라이브 확인.

## Outcome
shipped — fix in `src/components/FreshComposer.tsx`: 첫턴 fire 전 `setInFlightKind('po')` + `setStreaming(true)` 래치(ChatPanel 패턴 미러). **정정(QA)**: 근본원인은 "FreshComposer가 streaming을 전혀 안 set"이 아니라 — `poEvents.onMsgId`가 이미 streaming:true 하지만 그 edge가 **bar 마운트 전 setTimeout(0) 갭에 발화돼 갓 마운트된 derive의 useEffect가 놓치는 mount-timing race**. 래치가 bar를 already-working으로 마운트시켜 해소. QA pass: idempotent(`streamingSince ?? ` + state guard)·leak-free·ChatPanel 무회귀·reduced-motion 유지. build green.
**잔여(비블로커):** 라이브 sprite 애니메이션(fresh-project 첫턴 color-animated → done시 idle) 1회 눈확인 권장 — 5차 dmg VM 검증 때 흡수.

**최종(2026-06-24 cua 재현):** sprite **정상 동작 확인**(5차 VM, plain-text 턴 활성화·종료 idle). FreshComposer race fix는 유효해 5차에 반영·유지. user가 본 "회색+무응답" 증상의 진짜 원인은 sprite가 아니라 **Downloads 첨부 파일 Read의 macOS TCC 거부로 인한 턴 silent 종료** → **T-PATCH-255**로 분리. 본 sprite 티켓은 정상으로 close.

## Persona Activity
| persona | role | model | result |
|---|---|---|---|
| pdt-developer | root-cause + fix (Playwright 검증) | sonnet | done |
| pdt-qa | grill | sonnet | qa_status: pass (race 진단 정정, 0 must-fix) |
