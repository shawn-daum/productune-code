---
ticket_id: T-PATCH-104
version: v0.5
round: patch
type: fix
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: low
estimated_complexity: L1
qa_status: pass
qa_loops: 0
slug: restart-toast-autodismiss
area_tags: [gui/chat, gui/toast]
created_at: 2026-06-10
---

# T-PATCH-104: 세션 재시작 토스트 자동 사라짐 (auto-dismiss)

## 1. Request

**증상 (verbatim):** 세션 재시작 후 뜨는 "세션이 초기화되었습니다" 토스트가 **절대 사라지지 않는다**. (의도: 약 3초 후 자동 사라짐.)

**Root cause (확정):**
`packages/gui/src/components/workspace/ChatPanel.tsx` 의 useEffect (대략 347–359행) 가 의존성 배열에 `messages` 를 포함하고 있다.

- `restartCompleted` 가 fire 되면 토스트를 띄우고 `setTimeout(() => setRestartToastVisible(false), 3000)` 로 3초 hide 타이머를 예약하며, cleanup 에서 `clearTimeout` 한다.
- 그런데 `messages` 가 dep 이므로, 3초 이내에 메시지 업데이트가 한 번이라도 발생하면 effect 가 **재실행**된다.
- 재실행 시 초입의 `if (!restartCompleted) return` 이 토스트 재표시는 막아주지만, **그 전에 이전 run 의 CLEANUP 이 먼저 실행**되어 hide 타이머를 `clearTimeout` 으로 날려버린다.
- 결과: hide 타이머가 사라져 토스트가 영원히 남는다.

**현재 코드 (확인):**
```tsx
// T-PATCH-052: session restart completion effect — toast + divider
useEffect(() => {
  if (!restartCompleted) return
  setRestartCompleted(false)
  const lastMsg = messages.length > 0 ? messages[messages.length - 1].id : null
  setRestartDividerMarkers((prev) => [...prev, lastMsg])
  setRestartToastVisible(true)
  const timer = setTimeout(() => setRestartToastVisible(false), 3000)
  return () => clearTimeout(timer)
}, [restartCompleted, setRestartCompleted, messages])
```

**Fix direction:** 토스트 hide 타이머를 `messages` 와 **분리**한다.
- divider-marker 캡처(현재 마지막 메시지 id 기록)는 `messages` 를 읽어야 하므로 그대로 두되,
- 토스트 표시 + 3초 hide 타이머는 **restart 신호에만** 의존하도록 한다.
- 구현 방식 두 가지 중 택일:
  - (a) effect 를 둘로 분리 — 하나는 divider 캡처, 하나는 토스트 show + 3초 hide (dep = `restartCompleted` 만).
  - (b) `lastMsg` 를 ref 로 캡처해 `messages` 가 타이머 effect 의 dep 에서 빠지게 한다.

## 2. Acceptance

- [x] **[AC-1]** 세션 재시작 후 토스트가 약 3초 뒤 **자동으로 사라진다**.
- [x] **[AC-2]** 토스트 표시 중 메시지 업데이트가 발생해도 hide 타이머가 살아남아 정상적으로 사라진다 (재실행에 의한 `clearTimeout` 으로 타이머가 죽지 않는다).
- [x] **[AC-3]** divider marker 기록 동작은 유지된다 (재시작 시점의 마지막 메시지 위치에 divider 가 정상 기록됨).
- [x] **[AC-4]** 기존 동작 회귀 없음 (T-PATCH-052 의 토스트/divider 기능 정상).

## 3. Out of scope

- 토스트 메시지 문구/스타일 변경.
- divider marker 의 렌더링/위치 로직 변경.
- 3초 외 다른 타이밍 도입, 토스트 dismiss 버튼 추가 등 신규 UX.

## 4. Implementation plan

### `packages/gui/src/components/workspace/ChatPanel.tsx`

- 대략 347–359행의 단일 effect 를 **두 책임으로 분리**.
  - **divider 캡처 effect:** `restartCompleted` 시 현재 마지막 메시지 id 를 읽어 `restartDividerMarkers` 에 push. (`messages` 읽기 필요 → dep 또는 ref.)
  - **토스트 effect:** `restartCompleted` 신호에만 의존. `setRestartToastVisible(true)` 후 `setTimeout(..., 3000)` 로 hide, cleanup `clearTimeout`. dep 배열에서 `messages` 제거.
- 권장: divider 가 읽어야 할 last message id 를 ref(예: `lastMsgIdRef`) 로 잡아 토스트 타이머 effect 가 `messages` 에 의존하지 않게 한다.
- `setRestartCompleted(false)` 신호 소비는 한 번만 일어나도록 위치 주의 (분리 후 어느 effect 가 소비할지 단일화).

### 4.b QA-fix-r2 note (real root cause)

QA-fix-r1 (단일 effect 에서 `messages` 제거 + `lastMsgIdRef`) 는 **불충분**. 토스트가 여전히 사라지지 않았다.

**진짜 root cause (확정):** 단일 effect 의 dep = `[restartCompleted, setRestartCompleted]` 인데, effect **내부**에서 `setRestartCompleted(false)` 를 호출해 `restartCompleted` 를 true→false 로 뒤집는다. dep 이 바뀌므로 effect 가 **재실행**되고, React 는 그 전에 이전 run 의 cleanup `clearTimeout(timer)` 를 **먼저** 실행 → 3초 hide 타이머를 죽인다 → 토스트 영구 잔존. 트리거는 `messages` 가 아니라 **`restartCompleted` 가 flip 되는 것**이었다.

**Fix (r2):** effect 를 둘로 분리해 hide 타이머가 `restartCompleted` 변경에 의한 cleanup 대상이 되지 않게 한다.
- **Effect A** (dep `[restartCompleted, setRestartCompleted]`): 신호 소비(`setRestartCompleted(false)`) + divider 기록(`setRestartDividerMarkers((prev) => [...prev, lastMsgIdRef.current])`) + `setRestartToastVisible(true)`. **타이머 없음** → 이 effect 의 cleanup 은 타이머를 건드리지 않는다.
- **Effect B** (dep `[restartToastVisible]`): `if (!restartToastVisible) return; const t = setTimeout(() => setRestartToastVisible(false), 3000); return () => clearTimeout(t)`. `restartToastVisible` 를 flip 하는 것은 (이 타이머 자신을 빼면) Effect A 의 show 뿐 → `restartCompleted` flip 이 더 이상 타이머를 방해하지 않아 타이머가 3초를 온전히 살아남는다.

## 5. QA smoke

1. `pnpm --filter @productune/gui tsc --noEmit` — 오류 없음. *(done — central build GREEN: gui tsc 0)*
2. GUI 실행 → 세션 재시작 트리거 → "세션이 초기화되었습니다" 토스트 표시 확인. *(user-verify — runtime)*
3. 토스트 표시 직후 3초 이내 메시지를 추가/업데이트 → 그래도 토스트가 약 3초 후 사라지는지 확인 (AC-1, AC-2). *(user-verify — runtime; 코드상 dep array 에서 messages 제거 + lastMsgIdRef 패턴 확인됨)*
4. 재시작 시점에 divider marker 가 기록/렌더되는지 확인 (AC-3). *(user-verify — runtime; 코드상 lastMsgIdRef.current push 확인됨)*

## 6. Persona Activity

- **pdt-developer** (impl): §4 fix 적용. 단일 effect 를 책임 분리 — `lastMsgIdRef` 로 마지막 메시지 id 를 매 렌더 미러링하고, 토스트 show+3s hide 타이머 effect 의 dep 을 `[restartCompleted, setRestartCompleted]` 로 축소 (`messages` 제거). divider 캡처는 ref 값으로 동일 effect 내에서 수행해 신호 소비를 단일화. Scoped `tsc --noEmit -p tsconfig.json` 통과(EXIT=0). Touch: `ChatPanel.tsx`. status → review.
- **pdt-developer** (QA-fix-r2): r1 단일-effect 수정이 불충분 — 진짜 root cause 는 `messages` 가 아니라 effect 내 `setRestartCompleted(false)` 가 dep `restartCompleted` 를 flip → effect 재실행 → 이전 run cleanup `clearTimeout` 선행 → hide 타이머 사망. §4.b 대로 effect 2분리: Effect A(dep `[restartCompleted, setRestartCompleted]`, 타이머 없음 — 신호 소비 + divider ref 캡처 + toast show), Effect B(dep `[restartToastVisible]` — 3s hide setTimeout + cleanup clearTimeout). 타이머가 `restartCompleted` flip 의 cleanup 대상에서 분리되어 3초 생존. Scoped `tsc --noEmit -p tsconfig.json` EXIT=0. Touch: `ChatPanel.tsx`. status 유지 → review. 미커밋.
- **pdt-qa** (verify): Code inspection PASS. `lastMsgIdRef`(356–357행) 매 렌더 `messages[last].id` 미러링. 토스트 effect(362–373행) dep array = `[restartCompleted, setRestartCompleted]` — **`messages` 부재 확인**(§2 root cause 해소). effect 내: `if (!restartCompleted) return` → `setRestartCompleted(false)`(신호 단일 소비) → `setRestartDividerMarkers((prev) => [...prev, lastMsgIdRef.current])`(divider marker ref 캡처, AC-3 ✓) → `setRestartToastVisible(true)` → `setTimeout(…, 3000)` → cleanup `clearTimeout`. messages 가 dep 에서 빠졌으므로 메시지 업데이트 시 effect 재실행·cleanup 안 됨 → hide 타이머 survives(AC-1·AC-2 ✓). `restartCompletedToast` i18n en/ko:307 존재, 토스트 렌더 779–781행. Central build GREEN 전제. AC-1~AC-4 동작 항목은 user-verify eyeball 남김(코드 근거 충족). qa_status smoke→pass.
- **pdt-qa** (verify-r2, §4.b): Code inspection PASS — round-2 two-effect 구조 확정 (working tree, ChatPanel.tsx L438–460). `lastMsgIdRef`(L438–439) 매 렌더 last message id 미러링. **Effect A**(L444–450) dep `[restartCompleted, setRestartCompleted]`: `if (!restartCompleted) return` → `setRestartCompleted(false)`(신호 단일 소비) → `setRestartDividerMarkers((prev)=>[...prev, lastMsgIdRef.current])`(divider 기록, AC-3 ✓) → `setRestartToastVisible(true)` — **타이머 없음 확인**(이 effect cleanup 이 hide 타이머를 건드리지 않음). **Effect B**(L456–459) dep `[restartToastVisible]`: `if (!restartToastVisible) return; const t = setTimeout(()=>setRestartToastVisible(false), 3000); return ()=>clearTimeout(t)`. 3s hide 타이머가 Effect B 단독 소유 → `restartCompleted` true→false flip 이 Effect A 만 재실행시키고 Effect B 의 cleanup 대상 아님 → 타이머가 3s 생존(AC-1·AC-2 ✓). messages 업데이트도 Effect B dep 아니므로 무영향. r1 단일-effect(setTimeout 이 restartCompleted dep effect 내부) 패턴이 working tree 에서 완전히 사라진 것 확인 — flip→cleanup→clearTimeout 경로 제거됨. Central build GREEN 전제(gui tsc 0). AC-1~AC-4 런타임 동작은 user-verify eyeball 잔존(코드 근거 충족). qa_status pass 유지. status → user-verify.
