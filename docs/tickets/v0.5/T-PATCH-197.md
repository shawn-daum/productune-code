---
ticket_id: T-PATCH-197
version: v0.5
slug: oq-resume-invalid-params-hardening
title: OQ 답변 재개 — answerText 살균 + 침묵 타임아웃 OQ 대기 면제
type: chore/bugfix
status: done
phase: 3
assignee: pdt-developer
requires_qa: false
qa_status: pending
requires_user_gate: false
area_tag: po-runner
risk_flags: >
  (b) armSilenceTimeout 게이팅: 오탐 억제 로직이 oqPending 플래그를 잘못 세트할
  경우 정상적인 stall을 놓칠 수 있음. oqPending은 AskUserQuestion Path A
  tool_use 감지 시에만 세트, 턴 시작(makeHealthCtx) + onDone 후 즉시 해제 —
  비OQ 턴은 항상 oqPending=false이므로 기존 침묵-타임아웃 동작 그대로 유지.
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T00:00:00Z
duration_min: 30
---

## 배경 및 목적

AskUserQuestion(OQ) 다이얼로그에 사용자가 답한 직후, `claude --resume` 재개
시점에 Claude Code 코어가 "Invalid tool parameters" (InputValidationError)를
간헐적으로 발생시키는 현상이 보고됐다.

근본 원인은 upstream(코어 CLI)에 있어 productune 단에서 직접 수정할 수 없다.
진단에서 식별된 두 가지 productune 측 방어 완화를 적용한다:

1. **answerText 살균**: `opts.answerText`에 C0/C1 제어문자, 복수 줄바꿈, 우발적
   JSON이 섞여 있으면 `boundText` 문자열이 손상돼 코어 재검증 시 오류를 유발할
   수 있다. 삽입 전에 표준화한다.

2. **OQ 대기 중 침묵 타임아웃 억제**: OQ `tool_use`를 내보낸 뒤 CLI는 사용자
   입력을 기다리며 stdout이 완전히 멈춘다. 기존 15초 `SILENCE_TIMEOUT_MS`가
   이 구간에 발동해 거짓 'compacting' 상태를 내보내고("세션이 멈췄어요" 오보),
   타임아웃↔재개 레이스를 만들었다. OQ 대기 창에서만 타이머 장전을 억제한다.

---

## 패치 (a) — `ipc/po.ts` answerText 살균

`chat:answerQuestion` 핸들러 내 `boundText` 보간 직전에 `opts.answerText`를
살균한다:

```
const sanitizedAnswerText = opts.answerText
  .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')  // 제어문자 → 공백
  .replace(/\s+/g, ' ')                     // 공백 연속 → 단일 스페이스
  .trim()
const boundText = `[직전 AskUserQuestion에 대한 사용자 선택]\n선택: ${sanitizedAnswerText}`
```

- 정상 레이블("예", "A안", "계속")은 통과 무변.
- Korean wrapper 텍스트(직전 OQ 컨텍스트 바인딩) 유지.

---

## 패치 (b) — `po-runner.ts` OQ 대기 침묵 타임아웃 면제

### 감지 메커니즘

`HealthContext`에 `oqPending: boolean` 플래그 추가.

- **세트 시점**: `handleStreamJsonLine`의 `type === 'assistant'` 브랜치,
  `part.name === 'AskUserQuestion'` Path A 처리 직후. 동시에 이미 장전된
  타이머(`clearSilenceTimeout`)를 즉시 해제.
- **해제 시점**: `makeHealthCtx`(터n 시작 시 false 초기화) + `close` 핸들러
  `cb.onDone()` 직후.
- **억제 방식**: `armSilenceTimeout()` 첫 줄에 `if (ctx.oqPending) return` 추가.
  OQ 비대기 턴(`oqPending=false`)은 기존 동작 그대로.

### 보존된 동작

- 비OQ 턴(정상 작업 중 stall)의 침묵 타임아웃 → 변경 없음.
- `compacting` / `healthy` / `delegating` / `rate-limited` / `error-other`
  상태머신 → 변경 없음.
- `subagent-done` 직접 emit(`emitHealth` 우회) → 변경 없음.

---

## Acceptance Criteria

### AC-A: answerText 살균

- [x] `opts.answerText`가 정상 단어(제어문자 없음)인 경우 `sanitizedAnswerText`
  === `opts.answerText.trim()` — 동작 변화 없음.
- [x] `opts.answerText`에 `\n`, `\r`, `\x00` 등 C0 제어문자가 포함된 경우
  공백으로 치환 후 trim — `boundText`에 제어문자 미포함.
- [x] Korean wrapper 텍스트 `[직전 AskUserQuestion에 대한 사용자 선택]\n선택: …`
  형태 유지.

### AC-B: OQ 대기 침묵 타임아웃 억제

- [x] `AskUserQuestion` tool_use가 감지되면 `hCtx.oqPending = true` 세트,
  기존 타이머 즉시 해제.
- [x] `oqPending = true` 동안 `armSilenceTimeout()`이 호출돼도 타이머가 장전되지
  않음 → 15초 후 거짓 'compacting' 미발생.
- [x] 비OQ 턴(`oqPending = false`)에서 `armSilenceTimeout()` 동작 변화 없음.
- [x] `onDone` 후 `oqPending = false` 복원 — 다음 턴 침묵 감지 정상.
- [x] `makeHealthCtx`에서 `oqPending: false` 초기화 — 매 spawnClaude 호출마다
  클린 상태 보장.

### AC-C: core-upstream 주의사항 (확인 필요)

- [ ] **shawn의 다음 발생 캡처**에서 "Invalid tool parameters" / InputValidationError
  가 사라짐을 확인해야 완전 검증 완료. 이 두 패치는 productune 측 방어막이며,
  코어 CLI가 실제로 어떤 입력 형태를 거부하는지는 런타임 재현 없이는 단정 불가.

---

## 자기검증 워크스루 (Self-verify walkthrough)

OQ 전체 흐름 추적:

1. **PO turn 실행** → `spawnClaude()` → `makeHealthCtx` (`oqPending=false`)
2. **stdout 데이터 도착** → `armSilenceTimeout()` 호출 (oqPending=false → 정상 장전)
3. **AskUserQuestion tool_use 파싱** (Path A) →
   `hCtx.oqPending = true` + `clearSilenceTimeout(hCtx)` →
   `cb.onAskUserQuestion(msgId, payload)` 발화
4. **사용자 OQ 다이얼로그 대기**: stdout 침묵. 이후 stdout 데이터 없으므로
   `armSilenceTimeout()`이 호출될 여지가 없음. 설령 호출돼도 `oqPending=true`
   → 즉시 return → 타이머 미장전.
   → **거짓 'compacting' 이벤트 없음** ✓
5. **사용자 선택** → `chat:answerQuestion` IPC 도착 →
   `sanitizedAnswerText` 계산 (제어문자 제거, 공백 정규화) →
   `boundText = "[직전 AskUserQuestion에 대한 사용자 선택]\n선택: …"` 구성
   → `runPoTurn({ text: boundText, resume: sessionId })` 호출
6. **새 spawnClaude** → `makeHealthCtx` (`oqPending=false` 재초기화) →
   `claude --resume $SID --agent pdt-po --print --output-format stream-json "${boundText}"` 실행
   → 이전 OQ 턴의 `close` 핸들러가 `hCtx.oqPending = false` 세트했으므로
   state 오염 없음.

**코어 오류가 사라지는지는 shawn의 다음 발생 캡처로만 확인 가능**: 살균된
`answerText`가 코어의 재검증을 통과하는지, 또는 오류가 다른 원인(예: 코어가
pending AskUserQuestion tool_use를 다르게 처리)인지는 productune 단에서
재현 불가.

---

## shawn 캡처 지침

다음 발생 시:
1. `~/.productune/chat.json`의 해당 OQ 세션 직후 상태 스냅샷.
2. productune GUI 콘솔 로그 (`po:onHealth` 이벤트 포함).
3. `claude --resume` 실행 직후의 stderr/exit code.
4. "Invalid tool parameters" 오류 메시지 전문 (코어 스택 트레이스 포함).

오류가 사라지면: 두 패치 중 어느 쪽이 효과를 냈는지는 별도 단일-패치 bisect로
확인 가능하나, 재발 없으면 양쪽 모두 유지.

---

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `packages/gui/electron/ipc/po.ts` | `chat:answerQuestion` — `sanitizedAnswerText` 살균 추가 (line 105 근처) |
| `packages/gui/electron/po-runner.ts` | `HealthContext.oqPending` 필드; `makeHealthCtx` 초기화; `armSilenceTimeout` 게이팅; AskUserQuestion Path A에서 세트+타이머 해제; `close` 핸들러에서 해제 |
