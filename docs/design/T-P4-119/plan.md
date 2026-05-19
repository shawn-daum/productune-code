---
ticket: T-P4-119
slug: freshcomposer-po-race-fix
version: v0.4-meta-dogfood
type: design-plan
status: planned
author: pdt-designer
date: 2026-05-15
---

# T-P4-119 — Plan: FreshComposer → PO response race-fix (renderer listener uplift)

## §1 Background — 정확히 무엇이 깨졌나

**증상 (사용자 dogfood):** 신규 프로젝트 onboarding 직후 FreshComposer 에서 typed text 전송 →
사용자 메시지는 `chat.json` 에 정상 persist 되지만, **PO 응답이 ChatPanel 에 절대 나타나지 않음**.

**Trace (`packages/gui/electron/main.ts` runPoTurn ↔ renderer):**

```
[FreshComposer.handleSend]
  ├─ await api.chatAppendMessage(...)            ✓ persist user msg
  ├─ api.poSendMessage({...})                    → main process runPoTurn 시작
  │   └─ cb.onMsgId(msgId)                       → wc.send('po:onMsgId', msgId)  ← 동기 발사
  │                                                ※ ChatPanel useEffect 아직 mount 안 됨
  │                                                  → Electron no-buffer → 이벤트 drop ❌
  ├─ await new Promise(setTimeout 0)             ← 1 tick yield (불충분)
  ├─ await api.onboardingSetDone(...)            ✓
  └─ onConfirm()                                 → EntryGate → WorkspaceShell mount
                                                   → ChatPanel mount → useEffect 실행
                                                   → 이때부터 poOnMsgId 구독 시작
                                                   (이미 발사된 onMsgId 는 영영 소실)

[main runPoTurn 계속]
  ├─ cb.onToken(msgId, chunk)                    → wc.send('po:onToken', ...)
  │   → ChatPanel 의 setState findIndex(m.id === msgId) → idx < 0 → return s
  │      (placeholder 없으니 매칭 실패, 토큰 무시)
  └─ cb.onDone(msgId, info)                      → 동일하게 매칭 실패, chat.json persist 도 누락
```

**결론:** `po:onMsgId` 가 **listener registration 보다 먼저** wc.send 되는 race window 가 존재하며,
이 window 는 FreshComposer 의 send → WorkspaceShell reveal → ChatPanel mount 까지 항상 열려 있음.
`setTimeout(0)` 한 tick yield 는 felt-fix 일 뿐 — Claude CLI 응답이 echo 모드처럼 빠르면 그 1 tick 안에 onMsgId 가 wc.send 됨.

---

## §2 Architecture decision — B안 채택 (대안 거부)

| 안 | 요지 | 채택 여부 | 거부 사유 |
|:--|:--|:--|:--|
| **A** | main process 에서 onMsgId 발사를 일정 ms 지연 (e.g. `setTimeout(150)`) | ❌ | race window 의 폭만 늘릴 뿐 **근본 fix 아님**. 빠른 머신 / Claude CLI echo 모드 / 짧은 응답에서 재발. main side 가 renderer mount lifecycle 을 추측해야 함 — 책임 역전. |
| **B** | renderer subscription 을 ChatPanel useEffect 에서 더 상위 (모듈 top-level / App.tsx) 로 uplift → **listener-before-send 보장** | ✅ | renderer 가 자기 lifecycle 만 책임. main 은 발사 시점 변경 없음. race window 자체가 사라짐. |
| **C** | FreshComposer 가 직접 poOnMsgId/Token 등 구독 | ❌ | 중복 구독 (FreshComposer + ChatPanel 양쪽), role 비대화, onboarding 이외 entry 화면이 늘어날 때마다 복붙 부채. 단일 책임 위반. |

### B안 — uplift 대상 위치 결정: **새 `store/poEvents.ts` 모듈 top-level**

후보 비교:

| 위치 | 장 | 단 | 결정 |
|:--|:--|:--|:--|
| App.tsx `useEffect(() => { ... }, [])` | React lifecycle 안에 있어 익숙 | StrictMode double-mount + App 자체가 envCheck wait gate 뒤에 mount → 여전히 mount 지연 race 가능 | ✗ |
| 기존 `store/poChat.ts` 확장 | 새 파일 안 만들어도 됨 | poChat 은 panel UI 상태 (panelVisible / draft / autoScrollLocked) — 책임이 다름. concerns mix. | ✗ |
| **새 `packages/gui/src/store/poEvents.ts`** (side-effect import 모듈) | JS load 시점 (App 컴포넌트 evaluate 이전) bind. listener-before-send 가 가장 강하게 보장. zustand store 의 `setState/getState` 로 React 외부에서도 mutate. 단일 책임 (IPC subscription) 으로 mental model 명확. | App.tsx 에 `import './store/poEvents'` 한 줄 추가 필요. HMR 시 stale listener 처리 1줄 hot.dispose 필요. | ✅ |

`store/poEvents.ts` 는 **state 가 없는** 부수효과 전용 모듈 (zustand `create` 호출 없음). 이름은 store 디렉터리에 둠으로써 "이 도메인의 IPC 진입점" 임을 코드 위치로 시그널.

---

## §3 File-by-file change list

### 3.1 신규: `packages/gui/src/store/poEvents.ts`

**책임:** renderer JS load 시점에 1회, 모든 PO/QA/Todo/Browser IPC 이벤트 subscribe.
이벤트 핸들러는 `useWorkspace.setState` / `useUserTodo.getState().pushItems` 등 store API 만 호출.
React component 마운트와 완전 독립.

```ts
// store/poEvents.ts — 단일 책임: main → renderer IPC 이벤트의 단일 구독 진입점.
// JS load 시점에 1회 등록 → FreshComposer/ChatPanel mount 와 무관하게
// 'po:onMsgId' 등 first wc.send 가 항상 listener-bound 상태에서 수신됨.
//
// StrictMode double-eval 가드: 모듈 스코프 'registered' flag.
// HMR 가드: import.meta.hot.dispose 에서 offFn 일괄 호출 후 'registered' 리셋.

import { useWorkspace } from './workspace'
import { useUserTodo } from './useUserTodo'
import { useQaLoop } from './useQaLoop'
import type { Message, MessageKind } from '../lib/types'

let registered = false
const offFns: Array<(() => void) | undefined> = []

function register() {
  if (registered) return
  registered = true
  const api = (window as any).api
  if (!api?.poOnToken) return  // browser dev mode — IPC bridge 부재

  // ── po:onMsgId — placeholder bubble 생성 ─────────────────────────────────
  offFns.push(api.poOnMsgId?.((msgId: string) => {
    const kind: MessageKind = useWorkspace.getState().inFlightKind ?? 'po'
    const placeholder: Message = {
      id: msgId,
      role: 'assistant',
      kind,
      text: '',
      status: 'streaming',
      created_at: new Date().toISOString(),
    }
    useWorkspace.setState((s) => ({
      messages: [...s.messages, placeholder],
      inFlightMsgId: msgId,
    }))
  }))

  // ── po:onToken — placeholder 에 chunk append ────────────────────────────
  offFns.push(api.poOnToken?.((msgId: string, chunk: string) => {
    useWorkspace.setState((s) => {
      const idx = s.messages.findIndex((m) => m.id === msgId)
      if (idx < 0) return s
      const updated = { ...s.messages[idx], text: s.messages[idx].text + chunk }
      const next = [...s.messages]
      next[idx] = updated
      return { messages: next }
    })
  }))

  // ── po:onAnnounce — system trace 메시지 ─────────────────────────────────
  offFns.push(api.poOnAnnounce?.((_msgId: string, payload: { level: string; text: string }) => {
    const trace: Message = {
      id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'system',
      kind: 'trace',
      text: payload.text,
      status: 'done',
      created_at: new Date().toISOString(),
    }
    useWorkspace.setState((s) => ({ messages: [...s.messages, trace] }))
  }))

  // ── po:onDone — done 표시 + chat.json persist + sessionId 갱신 ────────
  offFns.push(api.poOnDone?.(async (msgId: string, info: { sessionId?: string }) => {
    let finalMsg: Message | null = null
    useWorkspace.setState((s) => {
      const idx = s.messages.findIndex((m) => m.id === msgId)
      if (idx < 0) return s
      const updated = { ...s.messages[idx], status: 'done' as const }
      finalMsg = updated
      const next = [...s.messages]
      next[idx] = updated
      return { messages: next, streaming: false, inFlightMsgId: null }
    })
    const proj = useWorkspace.getState().project
    if (proj && finalMsg) {
      try { await api.chatAppendMessage(proj.projectDir, finalMsg) } catch { /* ignore */ }
    }
    if (proj && info.sessionId) {
      useWorkspace.setState({ claudeSessionId: info.sessionId })
      try { await api.chatSetClaudeSessionId(proj.projectDir, info.sessionId) } catch { /* ignore */ }
    }
  }))

  // ── po:onTodoItems / po:onTodoDismiss (T-P4-113) ────────────────────────
  offFns.push(api.poOnTodoItems?.((items: any[]) => {
    useUserTodo.getState().pushItems(items)
  }))
  offFns.push(api.poOnTodoDismiss?.((ids: string[]) => {
    useUserTodo.getState().dismissByIds(ids)
  }))

  // ── onBrowserOpen / onUserVerify / onQaLoopUpdate (T-P4-116) ────────────
  offFns.push(api.onBrowserOpen?.((payload: { url: string; ticketId: string; purpose: 'qa-smoke' | 'user-verify' }) => {
    const tabId = `browser:${payload.ticketId}:${payload.purpose}`
    useWorkspace.getState().openTab(tabId, 'browser', { url: payload.url }, 'Browser')
  }))
  offFns.push(api.onUserVerify?.((payload: { url?: string; description: string; ticketId: string }) => {
    if (payload.url) {
      useWorkspace.getState().openTab(
        `user-verify:${payload.ticketId}`, 'browser', { url: payload.url }, '확인 필요',
      )
    }
    useUserTodo.getState().pushItems([{
      id: `verify-${payload.ticketId}`,
      description: `${payload.description} 후 체크`,
      type: payload.url ? 'link' : 'check',
      href: payload.url,
    }])
  }))
  offFns.push(api.onQaLoopUpdate?.((payload: {
    ticketId: string; attempt: number; maxAttempts: number
    status: 'dev-running' | 'qa-running' | 'pass' | 'fail' | 'capped' | 'auth-required'
    lastFailReason?: string
  }) => {
    useQaLoop.getState().setEntry(payload)
  }))
}

register()

// ── Project 전환 시 inFlight 상태 reset ─────────────────────────────────────
// setProject(null) 또는 다른 projectDir → 진행 중이던 streaming 의 잔재 제거.
let prevProjectDir: string | null = useWorkspace.getState().project?.projectDir ?? null
useWorkspace.subscribe((s) => {
  const cur = s.project?.projectDir ?? null
  if (cur !== prevProjectDir) {
    prevProjectDir = cur
    useWorkspace.setState({ inFlightMsgId: null, inFlightKind: 'po', streaming: false })
  }
})

// ── HMR 가드 ────────────────────────────────────────────────────────────────
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const off of offFns) try { off?.() } catch { /* ignore */ }
    offFns.length = 0
    registered = false
  })
}
```

### 3.2 수정: `packages/gui/src/App.tsx`

`App.tsx` 최상단 import 블록에 **side-effect import** 1줄 추가:

```ts
import './store/poEvents'  // T-P4-119: PO IPC subscriptions registered at module load.
```

위치: `import EntryGate ...` 라인 인근 (다른 store import 아래). 다른 어떤 변경도 없음.

### 3.3 수정: `packages/gui/src/store/workspace.ts`

`WorkspaceState` 인터페이스 + initial state + setter 추가:

```ts
interface WorkspaceState {
  // ... 기존 필드 ...

  // ── In-flight assistant message tracking (T-P4-119 — ref→state uplift) ──
  inFlightMsgId: string | null
  inFlightKind: MessageKind

  setInFlightMsgId: (id: string | null) => void
  setInFlightKind: (kind: MessageKind) => void
}

// initial:
inFlightMsgId: null,
inFlightKind: 'po',

setInFlightMsgId: (inFlightMsgId) => set({ inFlightMsgId }),
setInFlightKind: (inFlightKind) => set({ inFlightKind }),
```

`resetSession` 도 갱신:

```ts
resetSession: () => set({
  messages: [], claudeSessionId: null, streaming: false,
  inFlightMsgId: null, inFlightKind: 'po',
}),
```

`MessageKind` import 가 아직 없다면 추가.

### 3.4 수정: `packages/gui/src/components/workspace/ChatPanel.tsx`

**제거:**

1. Line 65–66 의 `inFlightMsgIdRef` / `inFlightKindRef` useRef 선언 전체.
2. Line 82–160 의 두 번째 `useEffect` (poOnMsgId / poOnToken / poOnAnnounce / poOnDone subscribe) 전체.
3. Line 162–180 의 todo IPC `useEffect` (poOnTodoItems / poOnTodoDismiss subscribe) 전체.
4. Line 186–240 의 QA loop / browser-open / user-verify `useEffect` 전체 + `openTabFn` 변수.

**유지:**

- Line 69–80 의 `chatGetSession` load `useEffect` — 프로젝트별 세션 로드 (IPC subscription 이 아닌 fetch).
- Line 243–248 auto-scroll, Line 312–317 textarea autosize 등 순수 UI effect.

**수정:**

- `handleSubmit` (Line 258–299):
  - `inFlightKindRef.current = 'po'` → `useWorkspace.getState().setInFlightKind('po')`.
  - `catch { setStreaming(false); inFlightMsgIdRef.current = null }` →
    `catch { setStreaming(false); useWorkspace.getState().setInFlightMsgId(null) }`.

### 3.5 확인 작업 (touch 없음 — sanity check)

다음 listener 들이 다른 컴포넌트의 `useEffect` 에 등록돼 있는지 grep 확인 후, 있다면 동일하게 uplift 대상:

- `poOnHealth` — directive 에 언급. 현재 ChatPanel.tsx 에는 없음. WorkspaceShell / StatusBar 등 grep 필요.
- `poOnTicketFocus` — directive 에 언급. 동일.
- `poOnArtifactOpen` — directive 에 언급. WorkspaceShell (T-P4-114 §A 코멘트 참조) 에서 처리 추정.

→ 발견되는 모든 위치는 동일하게 `store/poEvents.ts` 로 이동. dev ticket 본문 §Scope 에 enumerate.

---

## §4 StrictMode 가드 전략

| 시나리오 | 방어 |
|:--|:--|
| **React StrictMode double-mount** | `store/poEvents.ts` 는 React component 가 아님 → StrictMode 의 effect double-fire 영향 없음. 모듈 평가 자체는 1회만 (Vite ES module 캐시). |
| **모듈 자체가 2번 평가되는 edge case** (예: 잘못된 dynamic import) | 모듈 스코프 `let registered = false` flag — `register()` 가 두 번 호출돼도 두 번째 호출은 no-op. |
| **Vite HMR — store/poEvents.ts 또는 의존성 변경 시** | `import.meta.hot.dispose` 에서 `offFns.forEach(off => off?.())` + `registered = false` 리셋 → 새 모듈 평가 시 fresh listener 등록. stale listener 누적 방지. |
| **App.tsx HMR** | `App.tsx` 의 side-effect import 는 모듈 cache 재사용 → poEvents 재평가 안 됨. 영향 없음. |

App.tsx `useEffect(()=>{}, [])` 방식 대비 강점: useRef + cleanup 패턴 없이도 double-fire 가 구조적으로 불가능 (모듈 평가는 1회).

---

## §5 inFlight ref → state 승격 spec

### Why
- ref 는 **컴포넌트 lifetime** 종속 — ChatPanel unmount/remount 시 reset 됨.
- module-level handler 가 ref 에 접근 불가 (closure 문제).
- store state 로 승격하면:
  1. module-level handler 가 `useWorkspace.getState()` 로 read, `setState()` 로 write 가능.
  2. 다른 컴포넌트 (e.g. StatusBar streaming dot, future "stop" 버튼) 가 reactive subscribe 가능.
  3. 단일 source of truth — 동기화 불일치 차단.

### Schema (store/workspace.ts 추가)

| Field | Type | Initial | 의미 |
|:--|:--|:--|:--|
| `inFlightMsgId` | `string \| null` | `null` | 현재 streaming 중인 assistant 메시지 id. `null` = idle. |
| `inFlightKind` | `MessageKind` | `'po'` | 다음 placeholder 가 가질 kind (현재는 항상 `'po'` — v2 sub-c). |
| `setInFlightMsgId(id)` | — | — | direct setter. |
| `setInFlightKind(kind)` | — | — | direct setter. |

### Lifecycle

| 시점 | 액션 |
|:--|:--|
| send 직전 (ChatPanel.handleSubmit) | `setInFlightKind('po')` — kind hint. msgId 는 아직 모름. |
| `po:onMsgId` 수신 (poEvents) | placeholder 추가 + `setInFlightMsgId(msgId)`. |
| `po:onDone` 수신 (poEvents) | done 표시 + persist + `setInFlightMsgId(null)`, `setStreaming(false)`. |
| send IPC throw (handleSubmit catch) | `setInFlightMsgId(null)` + `setStreaming(false)`. |
| 프로젝트 전환 | poEvents 의 zustand subscribe 가 reset (§3.1 마지막 블록). |

---

## §6 프로젝트 전환 reset 정책

`useWorkspace.subscribe` 로 `project.projectDir` 변경 감지:

| 변경 | 동작 |
|:--|:--|
| `null → projectA` | `inFlightMsgId: null`, `inFlightKind: 'po'`, `streaming: false` 로 set (이미 null 이지만 idempotent). |
| `projectA → projectB` | 동일 — projectA 에서 진행 중이던 streaming 의 잔재 (만약 있다면) 제거. `messages` 는 ChatPanel 의 `chatGetSession` load effect 가 새 프로젝트의 chat.json 으로 덮어씀. |
| `projectA → null` (HomeView 복귀) | 동일. |
| 같은 projectDir 로 setProject (re-set) | `cur !== prevProjectDir` 비교 → 동일하므로 no-op. |

`prevProjectDir` 클로저 변수로 last seen 보관 → 불필요한 reset 회피.

⚠️ 주의: zustand `subscribe` 는 selector 형이 아닌 callback 형 — 모든 store mutate 마다 호출됨. `cur === prevProjectDir` 비교는 따라서 필수.

---

## §7 단계별 migration

1. **`store/workspace.ts` 확장** — `inFlightMsgId`/`inFlightKind` state + setter 추가. 기존 사용처 없으므로 break 없음.
2. **`store/poEvents.ts` 신규 작성** — §3.1 그대로.
3. **`App.tsx` side-effect import 추가** — 1줄.
4. **`ChatPanel.tsx` 정리** — useRef 2개 + useEffect 3개 제거, `handleSubmit` 의 ref 접근 2곳을 store setter 로 교체.
5. **다른 컴포넌트의 IPC subscription 점검** — `poOnHealth` / `poOnTicketFocus` / `poOnArtifactOpen` grep → 발견되면 동일 패턴으로 poEvents 로 이동, 발견 안 되면 §3.5 노트만 남김.
6. **`build` + `tsc --noEmit` pass 확인**.
7. **§8 smoke 시나리오 수동 실행**.

각 단계는 독립 commit 가능. 단계 4가 가장 risky (대량 삭제) — 1–3 까지 먼저 commit 해 두면 4 단계 revert 만으로 롤백 가능.

---

## §8 Smoke test scenario

### S1 — 신규 프로젝트 first send (regression 핵심)

1. `~/.productune/po-state.json` 없는 fresh project 생성.
2. FreshComposer 표시 → "안녕, PRD 만들어줘" 타이핑 → 전송 (Cmd+Enter).
3. **Expected:**
   - `chat.json` 에 user 메시지 즉시 저장.
   - WorkspaceShell reveal (수백 ms 이내).
   - ChatPanel 의 message list 에 PO placeholder bubble (orange "P" badge + streaming dot) 1개 출현.
   - PO 응답이 토큰 단위로 점진 표시.
   - 응답 종료 시 streaming dot 사라짐, `chat.json` 에 assistant 메시지 persist.
4. **Fail signal (현재 bug 재현):** placeholder bubble 자체가 안 나오고 메시지 list 가 비어 있음.

### S2 — Cmd+R reload

1. S1 진행 중 또는 완료 후 Cmd+R 로 renderer reload.
2. **Expected:** `lastProject` lazy init → WorkspaceShell 즉시 mount → `chatGetSession` 으로 messages 복원. 진행 중이던 streaming 은 main process 가 죽지 않는 한 token stream 이어서 도착하지만, msgId 가 살아 있으니 poEvents 가 그대로 받아 placeholder 에 append.

### S3 — 프로젝트 전환

1. 프로젝트 A 에서 send 후 streaming 중 (placeholder bubble 보임) → HomeView 로 back → 프로젝트 B 열기.
2. **Expected:**
   - `inFlightMsgId` reset → null.
   - 프로젝트 B 의 `chat.json` 메시지로 list 교체.
   - 프로젝트 A 의 streaming 잔여 token 이 도착해도 (`messages.findIndex(id)` 매칭 실패 → return s) silently drop.

### S4 — StrictMode double-mount

1. Dev build (`pnpm dev`) 로 실행 (StrictMode 활성화 가정).
2. App mount → poEvents 모듈 1회만 평가됨을 console log (개발 중에만 `console.debug('[poEvents] registered')` 임시 삽입해 확인 가능).
3. **Expected:** "registered" 1회만 로그. listener 중복 등록 없음.

### S5 — HMR re-evaluate

1. dev mode 에서 `store/poEvents.ts` 의 console comment 한 줄 수정 후 저장.
2. Vite HMR 가 모듈 reload.
3. **Expected:** stale offFns 가 dispose 에서 모두 호출됨. 새 listener 등록. 이전 listener 누적 없음. send → response 1번만 placeholder 생성.

### S6 — Echo mode (claude CLI 없음)

1. PATH 에서 `claude` 미설치 환경.
2. FreshComposer send.
3. **Expected:** main process 가 echo fallback 으로 동작. onMsgId / onToken / onDone 동일 IPC flow → placeholder 정상 출현. (echo mode 자체 동작은 본 티켓 §Out of scope.)

---

## §Out of scope

- Main process `runPoTurn` 의 onMsgId 발사 시점 변경 (A안 — 거부됨).
- FreshComposer 의 직접 IPC subscription (C안 — 거부됨).
- Claude spawn / parsing 로직 변경.
- Health banner (`po:onHealth`) 의 표시 UX 변경 — listener 위치만 옮기고 동작 동일.
- `inFlightMsgId` 를 활용한 새 UX (e.g. "Stop generation" 버튼) — 별도 티켓.
- Streaming 도중 프로젝트 전환 시 main 측 abort — 현재는 silently drop, 추후 별도 검토.

---

## §Open Questions

| # | 질문 | 현재 결정 |
|:--|:--|:--|
| OQ1 | `store/poEvents.ts` 의 register() 호출이 SSR/Test 환경에서 문제 일으키나? | 현재 Electron renderer 외 환경 없음 + `window.api` 부재 시 early return → 안전. Jest 가 이 모듈 import 시에도 noop. |
| OQ2 | `poOnHealth` listener 가 WorkspaceShell 등 다른 곳에 있는가? | grep 결과로 결정. 발견 시 §3.5 따라 동일 이동. |
| OQ3 | StatusBar 같은 곳에서 `streaming` dot 외에 `inFlightMsgId` 자체를 reactive subscribe 하고 싶을 때 가독성? | store state 로 승격됐으므로 `useWorkspace(s => s.inFlightMsgId)` 자유. 별도 hook 불필요. |

---

## §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `store/poEvents.ts` 의 IPC subscription registration + `ChatPanel.tsx` 의 message list rendering (FreshComposer first-send race fix end-to-end) |
| **사용자 dogfood** | §8 의 S1 (신규 프로젝트 first send → placeholder bubble 출현 → streaming → chat.json persist) 사용자가 직접 verify. S3 (프로젝트 전환 reset) 가능하면 함께. |
| **regression check** | `packages/gui/src/components/workspace/ChatPanel.tsx` 의 기존 send/persist/auto-scroll/restart 동작; `store/workspace.ts` 의 `resetSession` 사용처 (있다면) |

---

## §UX Self-Check (§1.5 design-system)

| Principle | 상태 |
|:--|:--|
| **Few Things** | UI 변경 0. listener 위치만 이동. ✓ |
| **Familiar** | placeholder bubble / streaming dot / final persist 모두 기존 패턴 그대로. ✓ |
| **Predictability** | "send 한 메시지 → 응답이 화면에 뜬다" 라는 가장 기본 contract 가 깨져 있던 것을 복구. user mental model 일치. ✓ |
| **Feedback** | placeholder bubble 의 streaming dot — 발사 직후 즉시 시각 응답 (이전엔 0 응답). ✓ |
| **Escape** | 응답이 안 뜨면 사용자가 send 를 다시 누르거나 Restart session (Cmd+R) 으로 복구 가능 — 현재도 유지. ✓ |
