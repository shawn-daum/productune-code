---
ticket_id: T-PATCH-148
version: v0.5
slug: persona-presence-activation-hover-cursor
title: PersonaPresenceBar sub-agent 활성화 + working hover tooltip + streaming 커서 복구
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: persona-presence
risk_flags: []
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-148 — PersonaPresenceBar sub-agent 활성화 + working hover + streaming 커서 복구

PersonaPresenceBar 가 PO 만 'working' 으로 표시되고 위임받은 sub-agent(designer/dev/qa)
는 idle 로 남는 버그(Q1), persona hover 시 working 작업내용이 안 뜨는 회귀/요청(Q2),
그리고 T-144 keyframe 교체로 깨진 MessageBubble 의 streaming 타이핑 커서(Q3)를 한 번에 복구한다.

세 항목 모두 PersonaPresenceBar / poEvents / personaPresence store / MessageBubble 라는
동일한 presence 표면을 건드리고, Q1·Q2 는 같은 delegating 이벤트 파이프라인을 공유하므로
한 티켓으로 묶는다. (Q3 는 결합도가 낮지만 같은 presence-bar 회귀 묶음이라 동봉 — 분리하지 않음.)

---

## 배경 / 현 상태 (read-only 조사 완료)

- `electron/po-runner.ts:591-595` — PO 가 `Task` 도구로 위임할 때 이미
  `emitHealth('delegating', { persona: part.input.subagent_type }, …)` 를 emit 한다.
  `part.input.subagent_type` = `pdt-designer` / `pdt-developer` / `pdt-qa` / `pdt-po`.
- `src/store/poEvents.ts:382-384` — `poOnHealth` 핸들러는 이 이벤트를
  `useSessionHealth.getState().setHealth(event)` 로만 넘기고
  `usePersonaPresence.setPersonaState(...)` 는 **호출하지 않는다.** → store 에서
  sub-agent 가 절대 'working' 이 되지 않음 (Q1 근본 원인).
- `src/components/workspace/PersonaPresenceBar.tsx` — PO chip 만
  `usePOPresenceDerive()`(workspace.streaming → po 'working') 로 구동된다.
  sub-agent 용 derive 경로가 없다.
- tooltip 은 `state === 'done'` 전용이며 `artifact` 만 노출. working hover 는 아무것도 안 뜸 (Q2).
- `PersonaEntry`(store) 에는 작업내용 필드가 `artifact` 뿐 (Q2 — `task` 필드 부재).
- `src/components/workspace/chat/MessageBubble.tsx:195` — cursorStyle 이
  `animation: 'persona-blink 0.8s ease infinite'` 에 의존하나, T-144 가
  PersonaPresenceBar 의 `persona-blink` keyframe 을 `persona-sprite` 로 교체하며 제거 →
  `persona-blink` 가 undefined keyframe 이 되어 커서 깜빡임이 깨졌다 (Q3).

### persona-id 매핑 단일 소스 결정 (key decision)

`pdt-*` → store `PersonaId` 매핑 로직(`pdt-` 접두 제거 + `developer`→`dev`)이 현재
`views/workspace/shell/helpers.ts:336-337`, `store/workspace.ts:726`,
`store/useBackgroundTasks.ts:138` 에 **3곳 중복**되어 있다. 이번에 단일 소스를 만든다.

- **결정**: `src/store/personaPresence.ts` 에 export 함수 추가 —
  `export function personaIdFromAgentType(agentType: string): PersonaId | null`.
  - 규칙: `pdt-po`→`po`, `pdt-designer`→`designer`, `pdt-developer`→`dev`, `pdt-qa`→`qa`.
  - 매핑 불가(알 수 없는 subagent_type)면 `null` 반환 → 호출부가 무시(no-op).
  - 구현은 명시적 `Record<string, PersonaId>` lookup 으로 한다 (문자열 slice 휴리스틱 금지 —
    `developer`→`dev` 예외 때문에 lookup 이 더 안전하고 단일 소스로 적합).
- personaPresence.ts 를 단일 소스로 두는 이유: PersonaId 타입의 정의처이고, poEvents 가
  이미 import 하므로 순환 의존이 생기지 않는다.
- **이번 티켓 범위**: poEvents 의 신규 호출부는 이 함수를 쓴다. 기존 3곳 중복 리팩터링은
  본 티켓 범위 밖(별도 chore) — 단, 새 함수에 "기존 helpers.ts:336 / workspace.ts:726 /
  useBackgroundTasks.ts:138 의 매핑을 향후 이 함수로 수렴" 주석을 남긴다.

---

## Q1 — sub-agent 'working' 활성화 + 라이프사이클

### 변경 범위
1. **`src/store/personaPresence.ts`**
   - `personaIdFromAgentType()` 추가(위 단일소스 결정).
   - `PersonaEntry` 에 `task?: string` 필드 추가(Q2 와 공용 — 아래 Q2 참조).
   - `setPersonaState` 시그니처에 working 작업요약을 받을 수 있게 확장(Q2 와 공용).

2. **`src/store/poEvents.ts` `poOnHealth` 핸들러(~382)**
   - 기존 `setHealth(event)` 호출은 **유지**(SessionHealth 표면은 그대로).
   - 추가로 event.state 에 따라 `usePersonaPresence` 를 갱신:
     - `event.state === 'delegating'` 이고 `event.detail?.persona` 가 매핑 가능하면:
       `setPersonaState(personaId, 'working', { task: event.detail.task })` 호출.
       (단, `po` 자신은 제외 — PO chip 은 `usePOPresenceDerive` 가 단독 소유하므로
       sub-agent 경로에서 `po` 로 매핑되면 no-op. PO 가 PO 에게 위임하는 케이스 방어.)
     - `event.state === 'healthy'` (위임 종료/복귀)일 때:
       그 시점 'working' 상태인 **모든 sub-agent(po 제외)** 를 라이프사이클 종료 상태로 전이.

### 라이프사이클 결정 (key decision: working → done)
- **healthy 복귀 시 working 인 sub-agent 는 'done' 으로 전이한다 (idle 아님).**
  - 근거: 기존 done flash/tooltip 정책이 "방금 무엇을 했는지"를 사용자에게 알려주는 장치인데,
    sub-agent 의 작업 완료야말로 그 신호가 가장 의미있는 순간이다. 곧장 idle 로 가면
    작업이 있었다는 사실 자체가 사라진다. PO chip 이 done 을 안 쓰는 것(artifact = chat 버블
    자체라 중복)과 달리, sub-agent 는 chat 에 자기 버블이 없으므로 done chip 이 유일한 완료 신호다.
  - done 전이 시 `artifact` 에는 해당 persona 의 `task`(작업요약)를 그대로 채운다 →
    done tooltip 이 "방금 한 작업"을 보여준다(기존 done tooltip 메커니즘 재사용).
  - done dismiss 는 기존 `dismissDone`(chip hover 후 바깥 클릭) 정책 그대로 → idle 복귀.
- **동시(병렬) 위임 고려**: PO 가 한 turn 에 여러 persona 를 병렬 디스패치할 수 있다.
  `emitHealth` 는 dedupe(`state === lastEmittedState` 면 skip) 가 있어 두 번째 `delegating`
  은 detail 만 다르면 묶여버릴 수 있으나, po-runner.ts:592-593 에서 위임마다
  `lastEmittedState = 'healthy'` 로 리셋 후 재emit 하므로 persona 별로 개별 delegating 이
  도착한다. 따라서 renderer 는 도착하는 delegating 마다 해당 persona 만 'working' 으로
  세팅하면 되고, 여러 persona 가 동시에 'working' 일 수 있다(store 는 persona 별 entry 라 OK).
  - **healthy 복귀 시 일괄 done 전이**: healthy 는 turn 단위 1회이므로, 그 순간 working 인
    sub-agent 전부를 done 으로 돌린다(개별 종료 신호가 없는 한계 — 현 emit 구조상
    persona 별 종료 이벤트는 없음). 이는 의도된 단순화이며 AC 에 명시.

### 검증 가능 AC (Q1)
- AC1-1: PO 가 `Task(subagent_type: pdt-designer)` 위임 → PersonaPresenceBar 의 Designer
  chip 이 sprite 애니(working)로 전환된다(스크린샷/관찰 가능).
- AC1-2: 같은 turn 에서 dev/qa 위임 시 각각 Developer/QA chip 도 working 으로 전환.
- AC1-3: PO turn 이 healthy 로 복귀(result 도착)하면, working 이던 sub-agent chip 들이
  done 상태(라벨 ✓ + 색상)로 전이된다.
- AC1-4: 알 수 없는 subagent_type(매핑 null)은 어떤 chip 도 바꾸지 않는다(no crash, no-op).
- AC1-5: PO chip 은 종전대로 `usePOPresenceDerive`(workspace.streaming) 로만 구동되며
  sub-agent 경로의 영향을 받지 않는다(po 매핑 시 no-op 가드 확인).

---

## Q2 — working hover 작업내용 tooltip

### 결정 (key decision: hover 내용 · idle 동작)
- **working hover**: 위임 시 PO 가 가진 작업 요약을 보여준다.
  - **소스**: po-runner 의 `Task` tool_use `part.input.description`(3-5 단어, Anthropic Task
    도구 표준 필드)을 1순위로 사용. `description` 부재 시 `part.input.prompt` 의 앞 60자 요약 fallback.
  - 이 값을 delegating health 이벤트의 `detail.task` 로 실어 보낸다(아래 emit 스펙).
  - renderer 는 `PersonaEntry.task` 에 저장하고, working chip hover 시 tooltip 에 노출.
- **idle hover**: **아무 tooltip 도 띄우지 않는다**(현행 유지). idle 은 "할 일 없음" 상태라
  보여줄 작업내용이 없고, 역할/이름은 이미 chip 라벨에 상시 노출되므로 tooltip 중복은 노이즈.
  (chip 라벨 자체가 역할 표시 역할을 한다.)
- **done hover**: 기존대로 artifact(=완료된 task 요약, Q1 에서 task 를 artifact 로 승계) 노출.

### emit 형식 변경 — `electron/po-runner.ts` (key decision: emit 스펙)
1. `sessionHealth.ts` `PoHealthDetail` 에 `task?: string` 필드 추가
   (`/** delegating — sub-agent 작업 요약(Task.description 또는 prompt 앞부분) */`).
2. po-runner.ts:591-595 Task 분기에서 `description`/`prompt` 추출:
   ```
   const taskSummary =
     typeof part.input?.description === 'string' && part.input.description.trim()
       ? part.input.description.trim()
       : typeof part.input?.prompt === 'string'
         ? part.input.prompt.trim().slice(0, 60)
         : undefined
   emitHealth('delegating', { persona: part.input.subagent_type, task: taskSummary }, hCtx, cb)
   ```
   (truncation/sanitize 는 detail 에서 최소화하고, 최종 길이 절단은 renderer tooltip 에서.)
3. `handleToolUseHealth` 내부의 무-detail `emitHealth('delegating', undefined, …)`
   (po-runner.ts:389) 는 그대로 둔다 — 그 직후 assistant 파싱 분기(591)에서
   persona+task detail 로 재emit 되므로 detail-rich 이벤트가 최종 도착한다.
   (단, 591 의 `lastEmittedState='healthy'` 리셋이 재emit 을 보장하는지 확인 — 현 코드 유지.)

### store 변경 — `src/store/personaPresence.ts`
- `PersonaEntry` 에 `task?: string` 추가.
- `setPersonaState(persona, state, opts?)` 를 다음과 같이 확장(하위호환):
  - working 전이 시 `opts.task` 를 entry.task 에 저장.
  - done 전이 시: artifact 미지정이면 직전 entry.task 를 artifact 로 승계(Q1 done tooltip 용).
  - idle 전이 시 task/artifact 모두 clear.
  - 기존 호출부(`usePOPresenceDerive` 의 `setPersonaState('po','working')` 등)는 opts 생략 가능해야 함.

### tooltip 렌더 — `PersonaPresenceBar.tsx` `PersonaChip`
- `onMouseEnter` 에서 `state === 'done'` 뿐 아니라 `state === 'working' && entry.task` 일 때도
  `setTooltipVisible(true)`.
- tooltip 본문: done → 기존 artifact 텍스트; working → `entry.task`(60자 절단 동일 규칙).
- idle 은 hover 해도 tooltip 안 띄움.
- tooltip 렌더 조건 `state === 'done' && tooltipVisible` 를
  `(state === 'done' || (state === 'working' && entry.task)) && tooltipVisible` 로 확장.
- 새 i18n 키 추가: `workspace.presence.workingNoTask` (working 인데 task 가 비었을 때
  fallback — 단, 위 가드로 task 없으면 애초에 tooltip 을 안 띄우므로 사실상 unused; AC 명료화용으로만 추가하거나 생략 가능. 추가 권장).

### 검증 가능 AC (Q2)
- AC2-1: Designer 가 working 일 때 chip hover → tooltip 에 `description`(예: "로그인 화면 리디자인")
  이 노출된다.
- AC2-2: `description` 부재(prompt only) 위임 → tooltip 에 prompt 앞 60자가 노출.
- AC2-3: idle chip hover → tooltip 이 뜨지 않는다.
- AC2-4: done chip hover → 완료된 작업 요약(승계된 task = artifact)이 노출.
- AC2-5: tooltip 텍스트는 60자 초과 시 `…` 로 절단된다(기존 규칙 유지).

---

## Q3 — PO streaming 타이핑 커서 복구

### 결정 (key decision: 커서 자급 + 스타일)
- **커서가 PersonaPresenceBar 의존 없이 자체적으로 동작**하도록 MessageBubble 에
  자체 keyframe once-guard 를 주입한다. (PersonaPresenceBar 가 mount 되지 않은 화면에서도
  streaming 커서가 동작해야 하므로 글로벌 keyframe 의존 제거가 핵심.)
- **keyframe 이름 충돌 방지**: `persona-blink`(T-144 가 제거) 대신 전용 이름
  `mb-cursor-blink` 사용. PersonaPresenceBar 의 `persona-sprite` 와 무관하게 독립.
- **주입 위치**: MessageBubble 모듈에 `ensureCursorKeyframe()` once-guard 함수
  (PersonaPresenceBar 의 `ensureSpriteKeyframe` 패턴 동일 — `document.getElementById(STYLE_ID)`
  존재 시 early-return, 없으면 `<style>` 1회 append). `PersonaBubble` 의 `useEffect(() => { ensureCursorKeyframe() }, [])` 로 호출.
  - `prefers-reduced-motion: reduce` 미디어쿼리로 깜빡임 비활성(접근성) — opacity 고정.
- **커서 스타일 결정**:
  - 색 = **PO violet `#8B5CF6` 유지**(현행). 단, persona 별 색을 따르도록 개선해도 좋으나
    범위 확대 방지를 위해 violet 고정(현 cursorStyle 그대로). → 추가 결정 불요.
  - 깜빡임 속도 = **1s step-end**(타이핑 커서 관용 속도; 기존 0.8s ease → 1s step-end 로
    또렷한 on/off blink). keyframe: `0%,49%{opacity:1} 50%,100%{opacity:0}`.
- "cursor 가 따라다니며 타이핑": 현 구조상 커서 `▋` 는 이미 `message.text` 끝에 append 되어
  렌더되므로(MessageBubble.tsx:82), 토큰이 append 될 때마다 자연히 텍스트 끝으로 따라간다.
  깨진 건 blink animation 뿐 → keyframe 복구로 "텍스트 끝에서 깜빡이는 커서"가 살아난다.
  추가 typewriter 연출(글자 단위 reveal)은 범위 밖(스트리밍 자체가 점진 reveal).

### 변경 범위
- **`src/components/workspace/chat/MessageBubble.tsx`**
  - `cursorStyle.animation` 을 `'mb-cursor-blink 1s step-end infinite'` 로 변경.
  - `ensureCursorKeyframe()` once-guard + `<style id="mb-cursor-keyframes">` 주입 추가.
  - `PersonaBubble` 에 `useEffect` 로 once 호출(effect cleanup 불요 — 글로벌 1회 주입,
    제거하면 다른 streaming 버블이 깨지므로 cleanup 에서 style 제거 금지).

### 검증 가능 AC (Q3)
- AC3-1: PO 응답 streaming 중 마지막 텍스트 끝에 `▋` 커서가 보이고 **깜빡인다**.
- AC3-2: 토큰이 append 될수록 커서가 텍스트 끝(최신 위치)으로 따라간다.
- AC3-3: 세그먼트 seal(tool trace 도착) 시 그 버블 status 가 'done' 으로 바뀌어 커서가
  사라지고(기존 sealActiveSegment 동작), 다음 세그먼트 끝에만 커서가 남는다.
- AC3-4: PersonaPresenceBar 가 화면에 없어도(또는 mount 전에도) 커서 blink 가 동작한다
  (글로벌 keyframe 의존 제거 확인).
- AC3-5: `prefers-reduced-motion: reduce` 환경에서 커서는 깜빡이지 않고 고정 표시된다.

---

## 개발자 노트 — react-best-practices 준수

- **effect cleanup**: keyframe 주입 effect 는 글로벌 1회 주입이므로 cleanup 에서 `<style>` 을
  제거하지 말 것(다른 마운트된 streaming 버블/sprite 가 깨짐). once-guard 가 idempotency 보장.
  poEvents 의 IPC 구독은 기존 offFns/HMR dispose 패턴 그대로 유지.
- **CSS-only 애니메이션**: 커서 blink·sprite 모두 CSS `@keyframes` 로(JS setInterval 금지).
  `prefers-reduced-motion` 미디어쿼리 포함(`rendering-*` 카테고리 접근성).
- **keyframe once-guard**: `ensureCursorKeyframe` 는 `ensureSpriteKeyframe`(PersonaPresenceBar)
  와 동일 패턴 — `getElementById(STYLE_ID)` 존재 검사 후 append. 두 STYLE_ID 는 서로 다름.
- **no inline component**: `PersonaChip` 등 컴포넌트를 다른 컴포넌트 본문 안에서 정의하지 말 것
  (현 구조 유지 — 모두 모듈 top-level). tooltip 분기 추가는 기존 컴포넌트 내부 조건으로만.
- **rerender**: store 신규 필드(`task`)는 persona 별 entry 에만 들어가므로 기존 selector 영향
  최소. `setPersonaState` 확장 시 불필요한 전체 entries 재생성 피하고 변경 persona 만 patch
  (기존 패턴 유지).
- **PoHealthDetail.task 추가**는 sessionHealth 표면(banner/statusbar)에는 미사용 — 그쪽
  렌더는 건드리지 말 것(delegating detail 의 persona 만 기존처럼 쓰임).

## 회귀 주의
- `poOnHealth` 에 persona-presence 갱신을 추가해도 기존 `setHealth(event)` 호출은 반드시 유지
  (SessionHealthBanner / StatusBar / PoFab 회귀 방지).
- PO 가 PO 에게 위임하는(po 매핑) 케이스는 sub-agent 경로에서 no-op — `usePOPresenceDerive`
  와 충돌 금지.
- `setPersonaState` 시그니처 확장은 하위호환(기존 3번째 인자 `artifact?: string` 호출부 점검:
  `dismissDone` 경로/done 직접세팅 호출부가 있다면 opts 객체 형태로 통일하거나
  오버로드로 호환 유지 — 개발자 판단, 단 기존 호출 깨짐 금지).

## 검증 방법(요약)
- 빌드/타입체크 통과 후 dev 앱에서 실제 위임 turn 1회 관찰(AC1/AC2),
  PO 텍스트 streaming turn 1회 관찰(AC3). 스크린샷 또는 화면 녹화로 chip 상태전이 +
  hover tooltip + 커서 blink 확인.
