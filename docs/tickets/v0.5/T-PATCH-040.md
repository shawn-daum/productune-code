---
ticket_id: T-PATCH-040
version: v0.5
phase: 3
type: impl
status: done
assignee: pdt-developer
estimated_complexity: L4
risk_flags:
  - threshold-metric-undecided-turn-vs-context
  - safe-boundary-signal-detection-heuristic
  - chat-stream-continuity-across-sid-rotation
  - doctrine-mtime-watch-optional-scope
qa: true
qa_status: pending
slug: po-session-cycle
---

# T-PATCH-040 — PO session fresh-cycle at safe boundaries (ephemeral session, po-state SoT)

## Request

PO claude 세션이 resume 로 길게 이어지면 두 가지 실패가 난다: (a) doctrine 갱신이 안 실린다 (resume 세션이 옛 시스템 프롬프트/메모리 유지 — caveman 사건), (b) 컨텍스트가 비대해져 compaction 으로 spec 토큰이 깎인다.

해결: PO 세션을 **주기적으로 fresh-cycle** 한다. fresh-cycle = 다음 turn 에서 `claude_session_id` 를 drop → resume 대신 `claude --agent pdt-po` 로 새 세션 시작 → doctrine 재독 + po-state 재오리엔트. po-state 가 work-state SoT(이미 정리됨)라 세션은 ephemeral — 끊어도 연속성 손실 없음.

대응 doctrine: `packages/core/doctrine/persona/po/bookshelf/lifecycle/index.md` "Session is ephemeral — po-state is the SoT" (T-PATCH-040). 이 ticket 은 그 원칙의 GUI 메커니즘 구현.

핵심 제약:
- cycle 은 **안전 경계에서만** — ticket-done / dev-QA loop 종료. **mid-work 절대 cut 금지.**
- 임계(turn/context)는 compaction 한계 **아래**로 잡아 compaction 은 최후 안전망으로만 닿는다.
- chat.json 스트림은 **연속 유지** — session id 만 rotate, 화면상 대화는 안 끊긴다.
- 트리거: phase 경계(base) + 세션 임계 초과(다음 안전 경계에서) + 수동 "새 세션" + doctrine 변경(알림/cycle, optional).

이 ticket 은 plan-first investigate 후 구현. 아래 key sites 는 조사 완료분(file:line) — plan 단계에서 검증하고 정확한 삽입점을 확정할 것.

## Acceptance

- [AC1] **안전점에서만 cut**: 세션 임계를 넘어도 cycle 은 ticket-done 또는 dev-QA loop 종료 신호에서만 발생. mid-turn / mid-loop 에서는 절대 SID drop 하지 않는다.
- [AC2] **mid-work 금지** (negative test): 임계 초과 + 진행중 task(current_task status 가 done/blocked 아님) 상태에서 turn 을 보내면 resume 가 유지되고 SID 가 drop 되지 않음을 검증.
- [AC3] **fresh 세션이 새 doctrine 읽음**: cycle 후 다음 turn 은 `--agent pdt-po` 로 spawn (args 에 `--resume` 부재). doctrine 파일을 수정한 뒤 cycle 을 강제하면 새 내용이 반영됨.
- [AC4] **chat 표시 연속**: cycle 전후로 `chat.json` messages 배열이 보존됨 (clearSession 호출 안 함). `claude_session_id` 만 제거/교체. 렌더러 대화 표시 안 끊김.
- [AC5] **po-state 재오리엔트**: fresh 세션 첫 turn 의 input/시스템 컨텍스트가 po-state(version/phase/current_task/persona_sessions/recent_turns)에서 재구성됨.
- [AC6] **phase 경계 cycle**: phase 전환(`po:` 전환 write 시점 또는 pending_gate 승인) 시 SID drop.
- [AC7] **수동 새 세션 유지**: 기존 `po:restartSession` (chat-store reset + capturedPoSessionId=null) 동작 회귀 없음.
- [AC8] `tsc` + lint 통과.

## Out of scope

- doctrine mtime watch (변경 자동 감지 → 알림/cycle) 는 **optional** — open question 해소 후 별 ticket 으로 분리 가능. 본 ticket 의 baseline 은 phase-boundary + threshold + manual.
- compaction 자체 튜닝 (임계는 compaction 아래로 두는 것까지만; compaction 동작 변경 X).
- non-GUI / CLI PO 세션 (이 메커니즘은 GUI po-runner 한정; doctrine 원칙은 공통).

## Plan

### Investigate-first (plan 단계에서 확정)

조사 완료한 key sites (file:line). 구현 전 검증할 것:

- **`packages/gui/electron/ipc/po.ts:16`** — `capturedPoSessionId: string | null` (module-scope). 매 turn `withSessionCapture`(:23-32) 의 `onDone` 에서 채워짐. `po:sendMessage`(:135) 가 `opts.resume ?? null` 로 resume(:147). `po:restartSession`(:161) 가 이미 `capturedPoSessionId = null`(:168) 로 fresh 강제 — **cycle 의 SID-drop 메커니즘은 여기 재사용**.
- **`packages/gui/electron/po-runner.ts:344-350`** — args 빌드. `opts.resume` 있으면 `--resume`, 없으면 `--agent PO_AGENT`(:34 = `pdt-po`). **fresh 세션 = resume 를 null 로 넘기면 자동으로 `--agent` 경로**.
- **`packages/gui/electron/po-runner.ts:420`** — `onDone(msgId, { sessionId: capturedSessionId })` — turn 종료 시 SID 회수 지점. turn-count 증분 / 임계 평가의 hook 후보.
- **`packages/gui/electron/chat-store.ts:132`** — `setClaudeSessionId` (resume 용 SID 저장). **:146 `clearSession`** = messages+SID 전부 drop (수동 "새 세션"용). **cycle 은 clearSession 을 쓰면 안 됨** (AC4 위반) — SID 만 비우는 경로 필요. 신규 `clearClaudeSessionId(projectDir)` (messages 보존, claude_session_id 만 제거) 추가 검토.
- **`packages/core/src/lint/po-deploy-guard.ts:19,24`** — `markPoTurnStart` / `markPoTurnEnd`. `po.ts` 가 매 turn 호출(:94/106, :141/156). **turn-count proxy 의 자연스러운 증분점**. 단 deploy-guard 의 의미(in-flight 표식)와 분리할지 판단 — turn 카운터는 별 모듈/필드로.
- **po-state `current_task`** (`.productune/po-state.json`) — `current_task` 의 status (done/blocked/abandoned) 변화가 **안전 경계 신호 후보**. state-hygiene.md turn-open sweep 이 done/blocked 시 persona_sessions clear → 이 전이를 cycle 의 ticket-done 신호로 감지 가능. `current_task` 가 PO turn 결과로 갱신되는 경로를 plan 에서 확인.
- **`packages/gui/src/store/poEvents.ts`** — 렌더러측 turn/이벤트 추적. turn-count 또는 안전경계 신호를 여기서 관측해 main 에 전달할지, main-only 로 둘지 plan 에서 결정.

### Build (확정 후)

1. **Turn/threshold 추적**: po-runner 또는 po.ts 에 turn 카운터(또는 context-size proxy) 도입. 임계값은 compaction 한계 아래 상수 + 추후 튜닝 가능하게. (metric 선택 = open question.)
2. **안전 경계 감지**: turn 종료(:420 onDone) 시점에 (a) 임계 초과 여부 + (b) 안전 경계 신호(current_task status done/blocked, or QA-loop terminal: po-runner 의 `onQaLoopUpdate` status `pass`/`capped`/`auth-required`) 를 평가. 둘 다 참이면 "cycle pending" 플래그 set.
3. **SID drop at safe point**: cycle pending 이면 `capturedPoSessionId = null` + chat-store 의 신규 `clearClaudeSessionId` (messages 보존). 다음 `po:sendMessage` 가 resume=null → `--agent` fresh 세션.
4. **Phase-boundary cycle**: phase 전환 write 경로(pending_gate 승인 / `po:` phase write)에서 즉시 SID drop.
5. **재오리엔트**: fresh 세션 첫 turn 에 po-state 기반 컨텍스트가 PO 시스템 프롬프트/initial input 으로 주입되는지 확인 (PO habit 이 turn-open 에 po-state 읽으면 자동; 아니면 명시 주입).
6. **수동 새 세션 회귀**: `po:restartSession` 기존 동작 유지.
7. (optional, OOS 후보) doctrine mtime watch → 변경 감지 시 알림/cycle.

### Verify

- AC2/AC4 negative test (mid-work 비-cut, messages 보존) 우선.
- AC3: doctrine 파일 touch → cycle 강제 → 새 내용 반영 확인.
- echo-mode (claude CLI 부재) 에서도 SID-drop 로직이 안전하게 noop 되는지.

## Open questions

- **임계 측정 방식**: turn count (단순, 결정적) vs context size (정확하지만 stream-json 토큰/usage 집계 필요). turn count baseline + context proxy 보강이 현실적인가?
- **안전 경계 감지 신호**: `current_task` status 전이(done/blocked) 가 ticket-done 의 신뢰 가능한 신호인가, 아니면 po-runner 의 `onQaLoopUpdate` terminal status(pass/capped) / `onTicketFocus` 와 조합해야 하는가? 어느 신호가 PO turn 결과로 결정적으로 발생하는지 확인 필요.
