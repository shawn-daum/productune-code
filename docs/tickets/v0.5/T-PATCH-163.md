---
ticket_id: T-PATCH-163
version: v0.5
slug: composer-working-indicator
title: PO 작업 중 composer를 CLI 스타일 라이브 인디케이터로 (spinner+동사+elapsed+~tokens)
type: code
status: review
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: composer-working-indicator
risk_flags: [design-needed]
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-163: composer 작업 중 인디케이터

## 동기 (user)
PO 작업(turn in-progress) 중엔 어차피 메시지 입력 불가 → 그 자리를 claude-code CLI 스타일 라이브 인디케이터로. "✶ Orchestrating… (4m 10s · ↓ 11.9k tokens)" 같은 "열심히 작업 중" 피드백. (persona bar=누가 / 이건=진행상황 — 보완.)

## 데이터 소스 (조사 완료)
- **작업 중 여부**: `workspace.streaming` (true=turn in-progress). composer가 이미 이걸로 disable.
- **활동 동사**: `sessionHealth` state로 구동 — `healthy/streaming`→"작업 중", `delegating`(+persona)→"Designer에게 위임 중", `compacting`→"정리 중" 등. (CLI의 whimsical 동사 대신 persona/health 기반 한국어 추천 — 정보성↑.)
- **elapsed**: streaming true 전환 시각을 캡처(workspace에 `streamingSince` 추가) → 1s tick로 "Nm Ns" 표시.
- **tokens(근사)**: exact count 미노출. `po:onToken` chunk 누적 텍스트 길이로 근사(chars/~4 → "↓ ~N.Nk"). 근사 표기(~) 또는 생략 선택. (exact 필요 시 po-runner가 usage 토큰 emit하는 별도 작업 — 본 티켓은 근사.)

## Designer plan-first 결정 (CLOSED — 아래 확정)

### D1. 레이아웃 (확정: replace, overlay 아님)
- **대상 컴포넌트**: `packages/gui/src/components/workspace/ChatPanel.tsx`. composer 는 `FreshComposer.tsx`(온보딩 전용)가 아니라 **ChatPanel 하단 `rp-input` 블록**(`pendingQuestion` ternary 의 else 가지, `<div style={inputArea}>` — 현 L504~628).
- **인디케이터 위치**: `inputArea` 내부, **`<textarea>`(현 L528~538) 를 streaming 중 인디케이터 row 로 교체**. textarea 는 streaming 시 `disabled`만 걸려 빈 칸으로 남는데(현 L537), 그 자리를 인디케이터가 대체한다. `inputRow`(현 L540~626: paperclip + 파일칩 + spacer + stop/send 버튼)는 **그대로 유지** → stop 버튼(현 L589~602, streaming 시 이미 빨강 Square)과 자연 공존. 즉 **textarea ↔ 인디케이터만 토글**하고 버튼 row 는 건드리지 않는다.
- 렌더 분기: `inputArea` 안에서 `{streaming ? <WorkingIndicator/> : <textarea …/>}`. 첨부 칩 row(현 L514~526)는 streaming 중 어차피 비어 있으니 그대로 둬도 무방(드물게 send 직후 잔존 → clearAttachments 가 이미 비움).
- **modal composer(질문 dock, 현 L469~502)에는 적용하지 않음** — 거긴 질문 답변 입력이 주목적이고 stop 버튼만으로 충분(범위 외, OQ 참고).
- 인디케이터 박스 스타일: `textarea` 와 같은 높이감(minHeight 36, border-radius 6) 유지하되 입력 가능 오인 방지를 위해 `border: none; background: transparent;` 권장. 한 줄: `[spinner] 동사 · elapsed · ~tokens` (가운데 점 구분).

### D2. 활동 동사 맵 (health state별 한국어 — 확정)
`useSessionHealth((s)=>s.state)` + `detail` 구독. 매핑(`verbForHealth(state, detail)`):
| health state | 표시 동사 |
|---|---|
| `healthy` | `작업 중` (streaming=true & healthy 가 기본 turn 상태) |
| `delegating` | `{personaLabel}에게 위임 중` |
| `compacting` | `대화 정리 중` |
| `rate-limited` | (인디케이터 미표시 — RateLimitBanner 가 소유, OQ 참고) |
| `permission-blocked` / `error-other` | `작업 중` 으로 폴백(에러는 SessionHealthBanner 소유) |
- **persona 라벨**: `delegating` 시 `detail.persona`(agentType 문자열) → `personaIdFromAgentType(detail.persona)` → `PERSONA_LABELS[id]` (`packages/gui/src/store/personaPresence.ts` L53/L61 재사용). 매핑 null 이면 `작업 중` 폴백. 예: `Designer에게 위임 중`, `Developer에게 위임 중`.
- 카피 키는 i18n(`workspace.chat.working.*`)로 — 아래 D7.
- **`subagent-done` state 무시**: poEvents L389 에서 setHealth 미호출이므로 health state 가 그 값이 될 일 없음. 방어적으로 default 폴백(작업 중)이면 충분.

### D3. elapsed (확정: workspace.streamingSince + 1s tick)
- 포맷: `Nm Ns`(1분 미만은 `Ns`만). 예: `4m 10s`, `42s`. CLI 톤.
- 기준 시각: `workspace.streamingSince`(아래 D6 store 변경). `Date.now() - streamingSince` → 초 → 분/초.

### D4. 근사 tokens (확정: per-turn 누적 char/~4 → `↓ ~N.Nk`)
- poEvents 에서 turn 동안 흐른 텍스트 길이를 누적 카운트 노출(D6 store 변경). chunk 의 `chunk.length` 합산 → `tokens ≈ chars/4`.
- 표기: `↓ ~N.Nk`(1000 이상은 `~N.Nk`, 1000 미만은 `~N`). 항상 `~` 근사 표기. 0 이면 토큰 segment 생략(첫 토큰 도착 전엔 `[spinner] 작업 중 · 0s` 만).
- exact 토큰(usage emit)은 후속 옵션 — 본 티켓 범위 밖(Note 참조).

### D5. spinner (확정: CSS-only, reduced-motion 가드 기존 인프라 재사용)
- glyph: `✶`(U+2736) 텍스트 글리프를 `display:inline-block` + 기존 `.pdt-spin` 클래스로 회전. (FreshComposer 의 SVG spinner 와 달리 CLI 톤의 별표.)
- **reduced-motion**: 신규 작업 불필요 — `packages/gui/src/styles/md-recipes.css` L494~499 의 `@media (prefers-reduced-motion: reduce){ .pdt-spin{animation:none} }` 가 이미 정지 처리. `.pdt-spin` 만 붙이면 자동 가드됨(L473~478 @keyframes pdt-spin + 1s linear infinite).
- 색: PO violet 계열(`#8B5CF6`) 또는 muted(`#A0A0A0`) — 입력 영역 톤에 맞춰 `#A0A0A0` 권장(작업 중 = 비활성 입력칸 느낌).

### D6. 역할 분담 (SessionHealth 배너 / PoFab / PersonaPresenceBar 와 중복 X — 확정)
- **PersonaPresenceBar**(rp-persona-bar, ChatPanel L408) = "누가"(PO/sub-agent chip). 그대로.
- **SessionHealthBanner / PoFab** = severity error/warn(`rate-limited`/`permission-blocked`/`error-other`) 만 표면. 인디케이터는 이걸 **건드리지 않음**.
- **WorkingIndicator(본 티켓)** = "진행상황"(spinner+동사+elapsed+~tokens), severity info/none(`healthy`/`delegating`/`compacting`) 구간만 담당. `rate-limited` 일 땐 인디케이터 대신 RateLimitBanner(L447~455)가 이미 입력칸 위에 뜨고 textarea 도 `disabled`(rateLimited) → 인디케이터는 `!rateLimited` 일 때만 렌더(중복 방지).

## 구현 (dev — file/line)

### 1) `packages/gui/src/store/workspace.ts` — streamingSince stamp + per-turn token count
- **State 추가**(인터페이스, 현 L95 `streaming: boolean` 바로 아래):
  ```
  /** ms epoch — streaming true 전환 시각. false 시 null. WorkingIndicator elapsed 기준. */
  streamingSince: number | null
  /** 현 turn 동안 흐른 누적 텍스트 char 수(근사 토큰 = chars/4). turn 시작 시 0. */
  turnCharCount: number
  addTurnChars: (n: number) => void
  ```
- **초기값**: `streaming: false`(L291) 인근에 `streamingSince: null, turnCharCount: 0` 추가. resetSession(L400) 에도 `streamingSince: null, turnCharCount: 0` 추가. workspace 의 project-switch 리셋 분기(L332, L350) 에도 `streamingSince: null, turnCharCount: 0` 동봉.
- **setStreaming 변경**(L395): stamp 로직 추가 —
  ```
  setStreaming: (streaming) => set((s) => ({
    streaming,
    streamingSince: streaming ? (s.streamingSince ?? Date.now()) : null,
    turnCharCount: streaming ? s.turnCharCount : 0,   // false 전환 시 리셋
  })),
  ```
  (`?? Date.now()` 로 ChatPanel handleSubmit 의 setStreaming(true) 와 poEvents onMsgId 의 streaming:true 가 중복 호출돼도 최초 stamp 유지 — 멱등.)
- **addTurnChars**: `addTurnChars: (n) => set((s) => ({ turnCharCount: s.turnCharCount + n })),`
- **주의**: poEvents 는 `useWorkspace.setState((s)=>({…streaming:true}))`(L112~116) 와 onDone 의 `streaming:false`(L321) 를 **setState 직접 호출**로 한다 → setStreaming action 을 안 거침. 따라서 streamingSince stamp 도 거기서 같이 set 해야 함(아래 2번). setStreaming action 변경만으론 부족.

### 2) `packages/gui/src/store/poEvents.ts` — stamp + char 누적
- **onMsgId**(L112~116 `useWorkspace.setState`): `streaming: true` 와 함께 `streamingSince: (현재값 ?? Date.now())`, `turnCharCount: 0` 추가. 구현:
  ```
  useWorkspace.setState((s) => ({
    messages: [...s.messages, placeholder],
    inFlightMsgId: msgId,
    streaming: true,
    streamingSince: s.streamingSince ?? Date.now(),
    turnCharCount: 0,
  }))
  ```
- **onToken**(L128~168): chunk 가 실제 append 되는 두 경로에서 char 누적.
  - 신규 segment 경로(L152 `setState((s)=>({messages:[...s.messages, seg]}))`)와 기존 segment append 경로(L160~167)에 `turnCharCount: s.turnCharCount + chunk.length` 를 같은 setState 객체에 합쳐 넣는다(별도 addTurnChars 호출보다 단일 setState 가 리렌더 1회로 효율적).
  - dup-guard drop(L158 `return`) 경로는 누적하지 않음(중복 chunk).
- **onDone**(L307~322 `setState`): `streaming: false, inFlightMsgId: null` 와 함께 `streamingSince: null`(turnCharCount 는 여기선 굳이 0 안 만들어도 됨 — 다음 onMsgId 가 0 으로 리셋; 단 인디케이터가 사라지므로 무관). 명시적으로 `streamingSince: null` 추가 권장.
- **handleAbort 경로**(ChatPanel L279~285): `setStreaming(false)` 호출 → 위 1)의 action 이 streamingSince:null + turnCharCount:0 처리. 추가 작업 불필요.

### 3) `packages/gui/src/components/workspace/ChatPanel.tsx` — WorkingIndicator 렌더
- **import 추가**: `import { personaIdFromAgentType, PERSONA_LABELS } from '../../store/personaPresence'` (sessionHealth 는 이미 import 됨, L34).
- **store 구독 추가**(컴포넌트 상단, healthState 인근 L79~82): `const streamingSince = useWorkspace((s)=>s.streamingSince)`, `const turnCharCount = useWorkspace((s)=>s.turnCharCount)`. `healthState`/`healthDetail` 는 이미 구독 중(L79~80).
- **elapsed 1s 타이머**: 컴포넌트 내부에 `const [nowMs, setNowMs] = useState(() => Date.now())` + effect —
  ```
  useEffect(() => {
    if (!streaming || streamingSince == null) return
    setNowMs(Date.now())                       // 즉시 1회
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)             // cleanup — react-best-practices
  }, [streaming, streamingSince])
  ```
  deps 에 streaming/streamingSince → turn 종료 시 effect 정리 + interval clear. (elapsed 표시값 = `nowMs - streamingSince`.)
- **인디케이터 컴포넌트**: 같은 파일 하단에 `function WorkingIndicator(props: { sinceMs: number; nowMs: number; charCount: number; healthState: PoHealthState; healthDetail: PoHealthDetail })` 추가, 또는 inline JSX. 순수 표시용 — 타이머 없음(부모가 nowMs 주입). 내부:
  - `const elapsed = formatElapsed(props.nowMs - props.sinceMs)` (helper, 아래)
  - `const verb = verbForHealth(props.healthState, props.healthDetail)` (helper, 아래)
  - `const tokens = formatApproxTokens(props.charCount)` ('' 면 segment 생략)
  - JSX: `<div style={workingRow}><span className="pdt-spin" style={spinnerGlyph} aria-hidden>✶</span><span>{verb}</span><span style={dot}>·</span><span>{elapsed}</span>{tokens && <><span style={dot}>·</span><span>{tokens}</span></>}</div>`
  - a11y: 바깥 div 에 `role="status"` + `aria-live="polite"` (스크린리더가 동사/진행 읽되 1s 마다 폭주 않게 polite). spinner 글리프는 `aria-hidden`.
- **렌더 분기**(현 L528~538 textarea): `{streaming && !rateLimited ? (<WorkingIndicator …/>) : (<textarea …/>)}`. rateLimited 분기는 D6(RateLimitBanner 소유). textarea 의 기존 `disabled={streaming || !project || rateLimited}` 는 그대로(인디케이터 분기에서 textarea 자체가 안 그려지므로 무해).
- **helpers**(파일 하단, basename 인근 L910):
  ```
  function formatElapsed(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(s / 60)
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
  }
  function formatApproxTokens(chars: number): string {
    const tok = Math.round(chars / 4)
    if (tok <= 0) return ''
    return tok >= 1000 ? `↓ ~${(tok / 1000).toFixed(1)}k` : `↓ ~${tok}`
  }
  function verbForHealth(state: PoHealthState, detail: PoHealthDetail): string {
    if (state === 'delegating' && detail.persona) {
      const id = personaIdFromAgentType(detail.persona)
      if (id) return i18next.t('workspace.chat.working.delegating', { persona: PERSONA_LABELS[id] })
    }
    if (state === 'compacting') return t('workspace.chat.working.compacting')
    return t('workspace.chat.working.default')
  }
  ```
  (verbForHealth 가 컴포넌트 밖이면 t 대신 i18next.t 사용 — poEvents L172 패턴 참조. 컴포넌트 안 closure 로 두면 useTranslation 의 t 사용 가능.)
- **styles**(파일 하단 styles 섹션): `workingRow`(display:flex, alignItems:center, gap:6, minHeight:36, padding:'8px 10px', color:'#A0A0A0', fontSize:12, fontFamily mono 권장 — statusBadge L794 의 ui-monospace 재사용), `spinnerGlyph`(display:inline-block, color:'#8B5CF6', fontSize:13, lineHeight:1), `dot`(color:'#505050').

### react-best-practices note (TSX 변경분)
- **1s 타이머 cleanup**: setInterval 은 effect 에서 생성, return cleanup 으로 clearInterval — deps `[streaming, streamingSince]` 가 turn 경계마다 정리/재설정 보장. unmount 시에도 cleanup.
- **CSS-only spinner**: `.pdt-spin`(md-recipes.css) 재사용 — JS rAF/setInterval 회전 금지.
- **reduced-motion**: 기존 `@media (prefers-reduced-motion: reduce)` 가 `.pdt-spin` 정지 → 신규 가드 불필요.
- **불필요 리렌더 억제**: 인디케이터는 1s 마다 nowMs 갱신으로 리렌더되지만 ChatPanel 전체가 아니라 — 가능하면 WorkingIndicator 만 nowMs 를 받는 별도 컴포넌트로 분리해 메시지 리스트 리렌더 비용과 분리(deps 최소화). (현 구조상 nowMs state 가 ChatPanel 에 있으면 전체 리렌더 — 1s 주기라 허용 가능하나, 분리 권장.)
- selector 구독은 원자값(streamingSince:number|null, turnCharCount:number, healthState:string)으로 — 객체 구독 회피.

## Acceptance
- AC-1: streaming 중 composer textarea 자리에 `✶ 작업 중 · Nm Ns · ↓ ~N.Nk` 라이브 표시, elapsed 1s 갱신. (rateLimited 아닐 때.)
- AC-2: 동사가 health state 반영 — `delegating` 시 `{PERSONA_LABEL}에게 위임 중`, `compacting` 시 `대화 정리 중`, 그 외 `작업 중`.
- AC-3: turn 종료(streaming false) 시 인디케이터 사라지고 textarea 입력칸 복귀. setInterval cleanup. stop 버튼(inputRow) 동작·렌더 유지(미변경).
- AC-4: reduced-motion 시 spinner 정지(`.pdt-spin` 기존 가드). build PASS(tsc + vite).
- AC-5: 근사 토큰은 첫 chunk 도착 전 segment 생략, 도착 후 `↓ ~N.Nk` 누적 표시. 항상 `~` 근사 표기.
- AC-6: rate-limited 구간엔 인디케이터 미표시(RateLimitBanner 가 소유) — 중복 없음.

## Note
- design-first(레이아웃/카피/spinner) → dev(streamingSince+turnCharCount store + 타이머 + 인디케이터). exact 토큰(usage emit)은 후속 옵션(po-runner usage 토큰 emit 별도 티켓).
- modal composer(질문 dock) 인디케이터는 범위 밖(OQ).
