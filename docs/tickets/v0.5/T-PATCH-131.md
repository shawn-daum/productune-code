---
ticket_id: T-PATCH-131
version: v0.5
round: patch
type: fix
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: medium
estimated_complexity: L2
qa_status: skipped
qa_loops: 0
slug: po-runner-false-permission-blocked
area_tags: [gui]
created_at: 2026-06-12
---

# T-PATCH-131 — PO 러너 오탐 permission-blocked 수정 (KEYSTONE)

## §1. Request

shawn (대화, 2026-06-12): 새 프로젝트를 GUI에서 시작하니 PO가 AskUserQuestion 옵션 카드(OQ)를 표시한 뒤 잠시 기다렸더니 빨간 배너 "권한 규칙으로 세션이 멈췄어요"가 나타나면서 질문이 사라지고 PO가 텍스트로 다시 질문했다. 실제 권한 거부는 없었다 — 오탐(false positive).

**파일**: `packages/gui/electron/po-runner.ts`

**근본 원인**: `handleToolUseHealth()`는 Write/Edit/Bash tool_use 이후 30초 setTimeout(`toolUseTimeoutHandle`)을 걸어 두어 타임아웃 시 `permission-blocked`를 방출한다. 두 가지 경로에서 이 타이머가 잘못 발화할 수 있었다.

- **Gap (a)**: 이후 어시스턴트가 `AskUserQuestion` tool_use를 방출하면, `handleStreamJsonLine`의 AskUserQuestion 분기에서 타이머를 해제하지 않고 바로 `continue`를 호출한다. AskUserQuestion은 합법적인 유저 입력 대기 상태임에도 불구하고 30초 후 타이머가 발화 → 오탐 permission-blocked.
- **Gap (b)**: tool_result가 정상 반환되어도 타이머가 해제되지 않는다. tool_result는 `type === "user"` 라인으로 도착하는데, 이를 처리하는 핸들러가 없어 타이머가 살아 남아 이후 정지 구간에서 발화할 수 있다.

**보존 경로**: `handleStderrHealth`(stderr에서 permission/denied/deny + Write/Edit/Bash lastToolUse) 및 `handleTextHealth`("I need/require permission" 텍스트) — 이 정상 경로는 수정하지 않음.

## §2. Acceptance

- **BDD-1**: PO가 Write/Edit/Bash 실행 후 AskUserQuestion을 방출하고 유저가 >30초 동안 응답하지 않는 경우, permission-blocked 이벤트가 발화하지 않는다 (AskUserQuestion 분기에서 타이머 해제).
- **BDD-2**: Write/Edit/Bash의 tool_result가 같은 턴에 반환되면, `type === "user"` + tool_result 라인 파싱 시 30초 타이머가 해제된다 (이후 정지 구간에서 오탐 없음).
- **BDD-3**: 정상 권한 차단 신호는 여전히 permission-blocked를 방출한다 — stderr permission 라인 경로 및 "I need permission" 텍스트 경로 무회귀.
- **BDD-4**: rate-limited / delegating / compacting 헬스 전환 경로는 변경 없음.

## §4. Outcome

### 변경 코드 발췌 (`po-runner.ts`)

**Fix (a) — AskUserQuestion 분기에 타이머 해제 추가:**

```ts
if (part.name === 'AskUserQuestion') {
  const payload = normalizeAskUserQuestion(part.input)
  if (payload && !askEmitted) {
    askEmitted = true
    cb.onAskUserQuestion(msgId, payload)
  }
  // T-PATCH-131: AskUserQuestion은 합법적인 유저 입력 대기 — 타이머 해제
  clearToolUseTimeout(hCtx)
  continue
}
```

**Fix (b) — type === "user" 핸들러 추가 (handleStreamJsonLine 끝):**

```ts
if (type === 'user') {
  const content = obj?.message?.content
  if (
    Array.isArray(content) &&
    content.some((item: any) => item?.type === 'tool_result')
  ) {
    clearToolUseTimeout(hCtx)
  }
  return
}
```

### BDD 매핑 / 논증 (Electron 런타임 headless 불가 → 정적·타입·빌드 검증 + 코드 추적)

- **BDD-1 (AskUserQuestion 대기 중 오탐 없음)**: `handleStreamJsonLine` → `type === 'assistant'` 분기 → `part.name === 'AskUserQuestion'` 블록 실행 → `clearToolUseTimeout(hCtx)` 호출(toolUseTimeoutHandle null 처리 포함) → `continue`. 30초 타이머가 이 시점에 해제되어 발화 불가. PASS.
- **BDD-2 (tool_result 반환 시 타이머 해제)**: stream-json `type === "user"` 라인 도착 → 신규 핸들러 진입 → `obj.message.content` 배열에 `type === "tool_result"` 항목 존재 확인 → `clearToolUseTimeout(hCtx)` 호출. optional chaining + `Array.isArray` 가드로 malformed 입력에 안전. PASS.
- **BDD-3 (정상 권한 차단 무회귀)**: `handleStderrHealth`(line 360-395) 및 `handleTextHealth`(line 398-403) 미수정. 두 경로 모두 독립적으로 `emitHealth('permission-blocked', ...)` 호출. PASS.
- **BDD-4 (rate-limited / delegating / compacting 무회귀)**: rate-limited(`handleStderrHealth` + `type === 'result'` 오류 경로), delegating(`handleToolUseHealth` Task 분기), compacting(`armSilenceTimeout` + `type === 'system' compact_pre`) 모두 미수정. PASS.

### self-verify 결과

- `pnpm --filter @productune/gui build` → **PASS** (tsc 타입체크 통과 + vite 3개 번들 `✓ built` in 3.80s/89ms/9ms).
