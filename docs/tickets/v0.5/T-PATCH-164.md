---
ticket_id: T-PATCH-164
version: v0.5
slug: subagent-presence-auto-idle
title: subagent 완료 후 idle 복귀 — done 무한 잔류 제거 (작업 끝나면 회색으로)
type: code
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: persona-presence
risk_flags: [design-needed, presence-lifecycle]
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-164: subagent 완료 후 idle 복귀

## 증상 (user, repro)
QA가 grill 다 하고 PO가 작업물 검토 중인데 **QA/Developer 캐릭터가 안 꺼지고 계속 full-color로 살아있음**. subagent 작업 끝나면 idle(회색)로 돌아가야 함.

## Root (조사 완료)
1. **`done` = full-color + 무한 잔류**: personaPresence "done: frame-01 stop, full color"; idle만 grayscale+dim. done은 수동 dismiss(hover+바깥클릭) 전까지 안 사라짐 → "살아있어" 체감. (T-148 결정: working→done 잔류 = "뭘 했는지 보이게" — 그런데 user는 잔류 싫고 idle 원함.)
2. **완료 전이가 턴 경계에서만**: poEvents의 `healthy→(working subagent들)done` 전이(T-148)가 turn 시작 'healthy'에서만 발화. subagent가 **턴 중간에 끝나도**(PO가 같은 턴에서 결과 검토) 다음 turn 전까지 'working' 잔류. → 끝났는데도 계속 active.

## 결정 (designer 확정 — A 채택)
**기대 동작**: subagent 작업 끝나면 idle(회색). 잔류 X. ("4명 항상 표시, 일할때만 움직임"과 정합 — 사실상 working(full-color anim) / idle(회색) 2-state.)
- **A 채택**: working → **짧은 done flash → 자동 idle(회색)**. 완료를 잠깐 보여주되 잔류 X.
- 대안 B(working→바로 idle, flash 없음)는 기각 — 완료 피드백(QA가 끝났다는 신호)이 사라져 user의 "끝났는지 모르겠다" 불만을 다른 방향으로 재생산.

### 확정 lifecycle 파라미터
- **flash 지속시간 = 2000ms.** done state로 머무는 시간. (2.5s는 4명 병렬 완료 시 시야에 너무 오래 남음. 2.0s가 "✓ 한 번 인지 → 사라짐" 리듬에 적정. ✓ 글리프 + full-color stop frame로 충분히 읽힘.)
- **시각**: done = 현행 그대로(frame-01 stop, full-color, 라벨에 ` ✓`). 변경 없음. 2.0s 후 idle(grayscale+dim)로 전이.
- **reduced-motion**: flash 자체는 애니메이션이 아니라 정적 state 노출이므로 reduced-motion에서도 done→idle 전이는 유지(2.0s 동일). 단 idle↔done 사이에 CSS transition(예: filter/opacity fade)을 **추가하지 않는다** — 즉시 스왑. (working sprite 애니는 기존 `@media (prefers-reduced-motion: reduce)` 가드로 이미 멈춤. 신규 transition을 안 넣으므로 reduced-motion 추가 처리 불필요 = "no new motion" 원칙.)
- **수동 dismiss(hover+바깥클릭)**: 유지하되 이제 backstop 역할. 2.0s 타이머가 먼저 도달하면 자동 idle; user가 그 전에 dismiss하면 즉시 idle(타이머는 dismiss/state-change 시 cleanup).

## 코드 확인 결과 (완료 신호 경로 — dev 결정 근거)
- `tool_use` 블록(po-runner.ts:593)은 stream-json상 표준 `id` 필드를 항상 가진다. 현재 코드는 `part.input.subagent_type`만 읽고 **`part.id`는 캡처 안 함**.
- `tool_result`는 `type === 'user'` 메시지 안에 `content[].tool_use_id`로 짝지어 도착. T-PATCH-147에서 이 핸들러를 "효과 없음"으로 제거(po-runner.ts:764-767 주석) — **envelope 자체는 여전히 도착**, 그냥 unknown으로 fall-through 중. 재활성화는 분기 1개 추가로 끝남(저비용).
- 따라서 **per-subagent 정밀 완료(옵션 i)가 가능하고 비용도 낮다**: delegating emit 시점에 `part.id → personaId` 맵을 HealthContext에 적재 → tool_result 도착 시 `tool_use_id`로 역참조해 해당 persona만 done.

## 완료 신호 결정: **옵션 (i) per-subagent 정밀** 채택
근거: 옵션(ii) healthy 재emit은 "그 시점 working 전부 done" → 병렬 위임(QA+Dev 동시)에서 하나만 끝나도 둘 다 꺼져 AC-2 위반. tool_use_id 매핑이 stream-json에 이미 존재 + 핸들러 재활성 비용이 낮으므로 정밀안의 추가비용이 미미. (만약 tool_result envelope이 일부 CLI 버전에서 누락되면 §3 healthy backstop이 그대로 받쳐준다.)

## Fix 범위 (파일·라인 수준 — dev 바로 구현 가능)

### Fix-1 — po-runner.ts: tool_use_id→persona 맵 + tool_result 완료 emit
1a. `HealthContext`(po-runner.ts:295-311)에 필드 추가:
   ```ts
   /** T-PATCH-164: 진행 중 위임의 tool_use.id → subagent_type(원본 문자열). per-subagent 완료 매핑용. */
   delegatedByToolUseId: Map<string, string>
   ```
   `makeHealthCtx()`(:320-330)에서 `delegatedByToolUseId: new Map()` 초기화.
1b. delegating emit 분기(po-runner.ts:620-636)에서, `emitHealth('delegating', …)` 직후 `part.id` 적재:
   ```ts
   if (typeof part.id === 'string') hCtx.delegatedByToolUseId.set(part.id, part.input.subagent_type)
   ```
   (`part.input.subagent_type`은 이미 string 가드 통과한 값.)
1c. `parseStreamLine`의 envelope 분기 끝(현 po-runner.ts:764-767의 제거-주석 자리)에 **`type === 'user'` tool_result 핸들러를 신규 추가**:
   ```ts
   if (type === 'user') {
     const content = obj?.message?.content
     if (Array.isArray(content)) {
       for (const part of content) {
         if (part?.type === 'tool_result' && typeof part?.tool_use_id === 'string') {
           const agentType = hCtx.delegatedByToolUseId.get(part.tool_use_id)
           if (agentType) {
             hCtx.delegatedByToolUseId.delete(part.tool_use_id)
             cb.onHealth({ state: 'subagent-done', detail: { persona: agentType }, at: new Date().toISOString(), msgId: hCtx.msgId })
           }
         }
       }
     }
     return
   }
   ```
   - **dedupe 우회 주의**: `emitHealth()`(:332-352)는 state 기반 dedupe라 per-subagent 완료에는 부적합(같은 'subagent-done'이 연속 도착 시 둘째가 드롭됨). 따라서 위처럼 `emitHealth`를 거치지 않고 `cb.onHealth(...)`를 **직접** 호출한다. `lastEmittedState`는 건드리지 않는다(delegating/healthy 상태머신과 독립).
1d. `PoHealthState` 유니온(po-runner.ts:71-77)에 `'subagent-done'` 추가. `PoHealthDetail.persona`(:79-88)는 그대로 재사용.
   - **sessionHealth 표면 회귀 방지**: poEvents.ts:385 `useSessionHealth.getState().setHealth(event)`가 모든 health 이벤트를 banner/statusbar/PoFab에 반영. `subagent-done`은 그 표면에 노출되면 안 됨 → §Fix-3에서 poEvents 핸들러가 `subagent-done`을 setHealth보다 먼저 분기해 presence-only로 처리(setHealth 호출 제외). 또는 sessionHealth store가 모르는 state를 무시하도록 확인. dev는 sessionHealth.ts의 setHealth가 unknown state에서 무해한지 확인 후, 안전을 위해 poEvents에서 early-return으로 격리할 것.

### Fix-2 — personaPresence.ts: done 자동 idle 타이머 (persona별 관리 + cleanup)
2a. store 모듈 스코프에 persona별 타이머 핸들 맵(컴포넌트 밖, store 밖 모듈 변수):
   ```ts
   const autoIdleTimers: Partial<Record<PersonaId, ReturnType<typeof setTimeout>>> = {}
   const AUTO_IDLE_MS = 2000  // T-PATCH-164: done flash 지속
   function clearAutoIdle(persona: PersonaId) {
     const h = autoIdleTimers[persona]
     if (h) { clearTimeout(h); delete autoIdleTimers[persona] }
   }
   ```
2b. `setPersonaState`(:111-130) 마지막에 분기 추가 — 모든 전이에서 먼저 해당 persona의 기존 타이머 cleanup(상태 충돌/중첩 방지), 이어서 `state === 'done'`이면 새 타이머 arm:
   ```ts
   // (set(...) 호출 이후)
   clearAutoIdle(persona)
   if (state === 'done') {
     autoIdleTimers[persona] = setTimeout(() => {
       delete autoIdleTimers[persona]
       // 타이머 만료 시점에 여전히 done일 때만 idle 전이(그 사이 working 재진입/수동 dismiss 보호)
       const cur = usePersonaPresence.getState().entries[persona]
       if (cur.state === 'done') usePersonaPresence.getState().dismissDone(persona)
     }, AUTO_IDLE_MS)
   }
   ```
   - 병렬 충돌 없음: 타이머가 persona별 키로 독립 관리되고, 매 전이마다 자기 persona 타이머만 clear→re-arm.
   - `dismissDone`(:132-142) 재사용으로 idle 전이(artifact/task clear까지 일관). dismissDone은 done이 아니면 no-op이므로 race-safe.
2c. `dismissDone`(:132-142)과 `resetAll`(:144) 진입 시에도 해당 persona(또는 전체) 타이머 cleanup — 수동 dismiss가 backstop 타이머보다 먼저 와도 leak 없게. dismissDone에 `clearAutoIdle(persona)`, resetAll에 모든 persona `clearAutoIdle` 추가.
   - react-best-practices(타이머 cleanup): store는 컴포넌트 unmount 훅이 없으므로 "전이마다 clear→arm + dismiss/reset 시 clear"로 cleanup 보장. 타이머 콜백 내부는 `getState()`로 최신 state 재확인(stale closure 방지) 후 조건부 전이.

### Fix-3 — poEvents.ts: subagent-done 이벤트 → 해당 persona done
poOnHealth 핸들러(:383-411) 안에서, 기존 delegating/healthy 분기 **앞**에 `subagent-done` 분기 추가하고, 이 state는 sessionHealth 표면에서 격리:
```ts
offFns.push(api.poOnHealth?.((event: any) => {
  // T-PATCH-164: subagent-done 은 presence 전용 — sessionHealth 표면에 노출 X.
  if (event?.state === 'subagent-done') {
    const personaId = personaIdFromAgentType(event?.detail?.persona ?? '')
    if (personaId && personaId !== 'po') {
      const cur = usePersonaPresence.getState().entries[personaId]
      if (cur.state === 'working') usePersonaPresence.getState().setPersonaState(personaId, 'done')
    }
    return  // setHealth 미호출 — banner/statusbar/PoFab 회귀 방지
  }
  useSessionHealth.getState().setHealth(event)
  // …기존 delegating/healthy 분기 그대로…
}))
```
- done 진입 → Fix-2 타이머가 2.0s 후 idle. working이 아닐 때(이미 done/idle)는 no-op으로 중복 done 방지.

### Fix-4 — healthy backstop 유지 (변경 없음, AC-3)
poEvents.ts:400-410의 `healthy → 잔류 working 전부 done` 전이는 **그대로 유지**. tool_result envelope이 누락되는 CLI 버전/엣지에서 다음 턴 시작 시 정리하는 안전망. 이 경로로 done 진입한 persona도 Fix-2 타이머가 idle로 마무리하므로 잔류 X.

### Fix-5 — PersonaPresenceBar.tsx (변경 최소)
- done 시각/✓/tooltip 모두 현행 유지 — **수정 불필요**. idle↔done CSS transition 신규 추가 금지(reduced-motion no-new-motion 원칙).
- PO chip 무관(usePOPresenceDerive가 streaming→idle 즉시, done 미사용 — :61 주석대로). 변경 없음.

## Acceptance
- AC-1: subagent 위임 완료 후(tool_result 도착) 해당 캐릭터가 working→done flash(2.0s, full-color+✓)→idle(grayscale+dim)로 자동 복귀. PO가 같은 턴에서 결과 검토 중에도 full-color 잔류 X.
- AC-2: 병렬 위임(예: QA+Dev 동시) 시 각 persona가 자기 tool_result 시점에 **개별** done→idle. 하나 끝났다고 나머지가 꺼지지 않음(옵션(i) per-subagent 매핑 채택으로 보장).
- AC-3: 다음 turn 시작('healthy') 시에도 잔류 working 없음(healthy backstop 유지) — tool_result 누락 엣지 안전망.
- AC-4: 모든 done→idle 타이머가 persona별 독립 관리·cleanup(전이 시 clear→re-arm, dismiss/reset 시 clear) — 누수/중첩 없음. 수동 dismiss는 타이머보다 먼저 와도 idle 즉시 + 타이머 cleanup.
- AC-5: `subagent-done` 이벤트가 sessionHealth 표면(banner/statusbar/PoFab)에 노출되지 않음(presence 전용 격리).
- AC-6: reduced-motion에서 idle↔done 신규 CSS transition 없음(즉시 스왑), working sprite 애니는 기존 가드로 정지. build(tsc + vite) PASS.

## Note
- T-148 lifecycle("working→done 잔류")을 "working→done flash(2.0s)→idle"로 정정. design 확정 완료 → dev 구현(Fix-1 tool_result 신호 + Fix-2 auto-idle 타이머).
- T-148의 `healthy→working전부done` 단순화는 폐기가 아니라 **backstop으로 강등**(Fix-4). 평시 완료는 Fix-1 정밀 경로가 담당.

## Open Questions (dev 구현 중 확인)
- OQ-1: 실제 Claude CLI(`--print --output-format stream-json`)가 sub-agent 종료 시 `type:'user'` + `tool_result`(`tool_use_id` 포함) envelope을 PO 스트림에 실제로 내보내는지 1회 실측 필요. 안 나오면 Fix-1 정밀 경로가 비활성(AC-2 미달)되고 Fix-3/4 healthy backstop만 동작(mid-turn 잔류는 남음). dev가 stream-json 1턴 덤프로 검증 권장. (envelope 자체가 과거 핸들러에 도달했었던 점(T-147 주석)으로 보아 도착 가능성 높음 — 다만 `tool_use_id`/`type` 정확 키명 실측.)
- OQ-2: flash 2.0s는 designer 확정값이나 dev 구현 후 4명 병렬 완료 시나리오에서 너무 빠르거나 느리면 QA 단계에서 ±0.5s 미세조정 가능(상수 1곳 AUTO_IDLE_MS).
