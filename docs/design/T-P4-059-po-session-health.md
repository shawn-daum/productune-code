# T-P4-059 — GUI PO session health visibility

**Slug**: phase4-r4-po-session-health  **Round**: phase4-r4 (R4 enhancement bundle)  **Status**: design v1
**Ticket**: [`docs/tickets/phase4/T-P4-059.md`](../tickets/phase4/T-P4-059.md)
**PRD anchor**: [docs/prd/productune.md#phase-4--terminal-무의존-gui-풀-사이클-future](../prd/productune.md#phase-4--terminal-무의존-gui-풀-사이클-future)
**Discovered by**: PO (x) — paepyeong dogfood (2026-05-07) 중 PO 세션이 권한 deny 로 정지됐으나 GUI 에 visibility 없음. session restart 가 fix 였으나 그것조차 안내 X.
**Related**: T-P4-041 (PO Chat streaming, po-runner.ts), T-P4-049 (persona presence bar — 시각 통일성), T-P4-058 (settings hygiene — `permission-blocked` CTA 의 자연 해법 제공)

---

## 1. Context

paepyeong dogfood 동안 PO 가 `Write` 6 회 deny 받아 사실상 정지. 사용자는 (a) 정지된 사실 자체를 한참 못 알아챘고 (b) 권한 deny 가 원인임을 추론 후에도 (c) **session restart 가 fix** 라는 정보 없이 헤맸다. 진짜 root-cause 는 T-P4-058 이 다루는 settings hygiene 이지만, **그것이 있어도 다른 형태의 막힘 (rate limit / auto compact / 위임 대기 / spawn error) 은 계속 발생**. GUI 가 PO 세션의 health 를 사용자에게 노출해야 동일 페인이 재발하지 않는다.

본 design 의 범위는 **PO session 자체의 health surface** — T-P4-049 persona presence bar 가 다루는 "페르소나 활동 상태" 와 직교한다. T-P4-049 는 "지금 누가 일하는 중" 을, 본 ticket 은 "PO session 자체가 정상인가" 를 답한다.

---

## 2. Goals / Non-goals

### Goals

- PO 세션이 막힌 (또는 막힌 것처럼 보이는) 상태를 **GUI 에서 한눈에** 인지 가능.
- 6 종 health state (`healthy` / `permission-blocked` / `rate-limited` / `compacting` / `delegating` / `error-other`) 를 시각/문구로 구분.
- 각 state 마다 사용자가 즉시 취할 수 있는 **CTA 1 개** 명시 (재시작 / 가이드 / 대기 / 재시도).
- 감지 logic 은 `po-runner.ts` 의 stream-json envelope 패턴 + child process exit + IPC 이벤트 timing 으로 derive — 새 backend 의존성 X.
- i18n 통합 (T-P4-056 doctrine) — 영문 default + 한글 카탈로그 보강.
- 시각 토큰은 기존 stage / persona color 와 일관 — 새 surface 컬러 X, **state semantic** 토큰만 신규.

### Non-goals

- claude CLI 의 정확한 rate-limit reset epoch 추출 — metadata 가 stream 안 안 오면 "잠시 후 재시도" 정도로 표시.
- token usage meter / 사용량 그래프 — 별도 ticket 가치.
- auto compact 의 정확한 진행률 — claude CLI 가 progress emit 안 함. heuristic indicator 만 (long-running spinner).
- session crash 시 chat history 복구 / 재생 — T-P4-041 chat.json 영속화의 후속 ticket.
- 페르소나 (designer/dev/qa) 의 health — 본 ticket 은 PO session only. 페르소나 health 는 사용자가 PO 를 통해 위임하므로 PO health 가 사실상 cover.
- 다중 health state 동시 표시 — 하나만 (priority cascade). 동시 multi-state UI 는 복잡도만 늘림.

---

## 3. Health state 정의

### 3.1 6 state matrix

| State | Severity | Animation | Indicator | User action 가능? |
|---|---|---|---|---|
| `healthy` | none | none | 표시 X (또는 minimal dot) | n/a |
| `delegating` | info | pulse (slow) | spinner + persona name | wait or cancel |
| `compacting` | info | pulse (slow) | spinner + label | block (wait only) |
| `rate-limited` | warn | static | warn icon + countdown | wait / queue |
| `permission-blocked` | error | static | error icon | restart / guide |
| `error-other` | error | static | error icon | retry / log |

**Priority cascade** (동시 발생 시 표시 순):

```
permission-blocked > error-other > rate-limited > compacting > delegating > healthy
```

근거: 사용자 액션이 필수인 것이 우선. info-tier (compacting/delegating) 는 자연 해소.

### 3.2 사용자 메시지 (i18n keys: `workspace.sessionHealth.*`)

| Key | EN | KO |
|---|---|---|
| `healthy.label` | Ready | 준비됨 |
| `delegating.label` | Delegating to {{persona}}… | {{persona}} 위임 중… |
| `delegating.hint` | The product team is working on this. | 팀원이 작업 중이에요. |
| `compacting.label` | Compacting context… | 컨텍스트 정리 중… |
| `compacting.hint` | This can take 30–60 seconds. | 30–60 초 정도 걸려요. |
| `rateLimited.label` | Rate limit reached | 사용량 제한 도달 |
| `rateLimited.hintWithReset` | Resets at {{time}}. | {{time}} 에 풀려요. |
| `rateLimited.hintNoReset` | Try again in a few minutes. | 잠시 후 다시 시도하세요. |
| `permissionBlocked.label` | Permission denied | 권한 거부됨 |
| `permissionBlocked.hint` | The session was stopped by a permission rule. | 권한 규칙으로 세션이 멈췄어요. |
| `permissionBlocked.cta` | Restart session ↗ | 세션 재시작 ↗ |
| `errorOther.label` | Session error | 세션 오류 |
| `errorOther.hint` | The PO process didn't respond as expected. | PO 가 정상적으로 응답하지 않았어요. |
| `errorOther.cta` | Retry | 재시도 |
| `errorOther.logCta` | View log ↗ | 로그 보기 ↗ |

**보호어 유지** (T-P4-057 linter cover): `PO`, `Phase`, `productune`, persona ID 들. 위 표에서 한글 측에 `PO` 가 들어간 line 은 영문 그대로.

---

## 4. 표시 위치 — 3 후보 비교 + 권장

### Option A — StatusBar (bottom 28px) 한 자리 indicator

**장점**: 항상 보임. 페르소나 presence bar (T-P4-049) 와 영역 분리. 압축 (icon + 1 line text). 화면 점유 최소.
**단점**: severity 가 높을 때 (permission-blocked) 충분히 못 끌림 — 사용자가 못 보고 지나칠 수 있음. 작은 영역에 CTA 까지 욱여넣으면 truncate.

### Option B — ChatPanel rp-ctx 자체 augment

**장점**: PO Chat 안에 inline → 자연스러운 맥락. ctx chip 옆 자리 활용.
**단점**: chat 이 접혀있을 때 보이지 않음 (FAB 모드). 사용자가 PO 가 막힌 줄 모르고 다른 탭 보고 있으면 영영 못 봄.

### Option C — Sticky banner (위쪽 phase gate 위치)

**장점**: severity 높은 알림에 적합. 화면 차단 효과.
**단점**: 정보 밀도 낮은 경우 (delegating / compacting) 에는 과함. 항상 띄우면 banner 피로.

### 권장 — **A + C 조합**

- **A (StatusBar)** : 모든 health state 의 **default surface**. healthy 도 minimal dot (또는 아예 없음). info/warn/error 모두 한 줄 압축 표시.
- **C (Sticky banner)** : `permission-blocked` 와 `error-other` 만 추가 승격. severity == error 인 두 state 만 banner 까지 확장 — 사용자 주의 강제 필요.
- **B 는 채택 X** : chat 접힘 / 다른 탭에서 못 봄 위험이 결정타. 단, FAB 자체에 health badge 1 dot 정도 부착 (별도 sub-area, §5.4).

---

## 5. 시각 spec

### 5.1 StatusBar segment (always-on)

위치: `StatusBar` (28px height) 의 **left cluster** 끝, project name 다음. mockup 정합 위해 `.sb-segment.session-health` class.

```
[P]  paepyeong  •  ◉ Ready                   …  ⏵ deploy  ⚙
                   └─ session-health segment
```

anatomy:

- **dot** (8px circle) — state color
- **label** (11px caption, `--txt`) — state.label
- **optional CTA** (text button, 11px, `--accent`) — state.cta (if any)
- gap 6px between dot/label/cta
- 전체 segment hover → 더 자세한 hint (state.hint) tooltip — 위로 팝
- 세션 idle (healthy + 메시지 X) — segment 통째 hidden 가능 (옵션). default 는 minimal dot.

### 5.2 Sticky banner (severity == error 만)

위치: workspace shell 최상단, ActivityBar 우측, MainSplit/RightPanel 위. height 36px. project 가 없는 상태에서는 띄우지 않음.

```
┌────────────────────────────────────────────────────────────────────┐
│ ⚠  Permission denied — the session was stopped by a permission rule.  [Restart session ↗]  [Dismiss]  │
└────────────────────────────────────────────────────────────────────┘
```

- background: `--banner-error-bg` (`#2A1414`) — error tint subtle
- border-left: 3px `--health-error`
- text: `--text-primary` (`#E8E8EA`)
- CTA primary: filled button (state token)
- Dismiss: text button — 사용자가 "지금 안 본다" 명시. dismiss 시 banner 만 사라지고 StatusBar segment 는 유지.
- transition: slide-down 120ms ease-out (안 거슬리는 정도)

### 5.3 Color tokens (신규)

```css
:root {
  --health-info: #38BDF8;    /* delegating, compacting */
  --health-warn: #FBBF24;    /* rate-limited */
  --health-error: #EF4444;   /* permission-blocked, error-other */
  --health-ok: #22C55E;      /* healthy (사용 시) */

  --banner-error-bg: #2A1414;
  --banner-warn-bg: #2A2410;
  --banner-info-bg: #102228;
}
```

**기존 토큰 재사용**:
- `--success: #22C55E` (T-P4-049 keyframes 와 일관) → `--health-ok` 와 동일 값. alias 처리.
- `--text-primary: #E8E8EA` (T-P4-058) — banner / tooltip 본문.
- `--text-muted` — hint line.

### 5.4 Icon + motion

| State | Icon (lucide-react) | Motion |
|---|---|---|
| `healthy` | `Circle` (filled, 8px) | none |
| `delegating` | `Loader2` | spin 1.2s linear infinite |
| `compacting` | `Database` + outer pulse ring | pulse 1.5s ease infinite |
| `rate-limited` | `Hourglass` | none |
| `permission-blocked` | `ShieldAlert` | none |
| `error-other` | `AlertTriangle` | none |

motion 가이드라인: info 두 종만 motion. warn/error 는 색상 + 아이콘으로 충분 — 모션 누적 시 사용자 피로.

### 5.5 FAB (chat 접혔을 때) health badge

T-P4-041 의 FAB 우상단에 4px dot 부착:

- healthy → dot 없음
- info → `--health-info` 8px dot, slow pulse
- warn → `--health-warn` 8px dot, static
- error → `--health-error` 10px dot, **subtle blink** (1s 주기, opacity 1↔0.4)

목적: chat 닫혀있어도 "PO 에 뭔가 있다" 감지. clickthrough 로 chat 열기.

---

## 6. CTA 동작

### 6.1 `permission-blocked.cta` — Restart session

클릭 시 modal 노출:

```
┌──────────────────────────────────────────────┐
│ Restart PO session                            │
│                                                │
│ The current session was stopped by a          │
│ permission rule. Restarting will start a       │
│ new claude session — your chat history is     │
│ preserved on disk.                             │
│                                                │
│ Common cause: another user's path glob in      │
│ .claude/settings.local.json. See settings      │
│ hygiene (T-P4-058) for the auto-fix.           │
│                                                │
│   [Restart now]  [Open settings ↗]  [Cancel]  │
└──────────────────────────────────────────────┘
```

- **Restart now** → IPC `po:restartSession()` (신규) → renderer state `sessionId = null` → 다음 send 가 `--agent` 로 첫 turn. chat.json append 는 유지.
- **Open settings ↗** → Settings 탭의 Workspace / Permissions sub-tab 으로 이동. T-P4-058 land 시점부터 의미 있는 link 가 됨.
- **Cancel** → modal 닫힘. banner 는 유지 (사용자 명시 dismiss 만 banner 제거).

### 6.2 `error-other.cta` — Retry / View log

`Retry` 클릭 → 마지막 user 메시지 재전송 (chat.json 의 last user role message 를 `runPoTurn` 으로 다시 보냄). resume `sessionId` 유지.
`View log ↗` 클릭 → Main 탭에 새 `terminal` tab dispatch — `~/.productune/projects/<slug>/logs/po-session.log` (또는 stderr buffer dump) 표시. T-P4-046 dispatcher API 호출.

### 6.3 `rate-limited` — wait / queue

클릭 가능한 CTA 없음 (선택지 X). hint 만:

- reset 시각 추출 가능 → "Resets at 14:32" 형태 countdown.
- 추출 불가 → "Try again in a few minutes."

별도 옵션 (Phase 5 후속): "백그라운드 대기" 토글 — 한도 풀린 시점에 마지막 메시지 자동 재전송. 본 ticket 범위 X (Out of scope).

### 6.4 `compacting` / `delegating` — 사용자 액션 X

block 만. cancel 버튼 X (claude CLI 가 SIGTERM 대응 불확실 — 버튼 만들면 사용자가 누르고 hang 본다는 false signal).

---

## 7. 감지 logic

`packages/gui/electron/po-runner.ts` 에 health state machine 추가. 기존 IPC 채널 (`po:onToken` / `po:onAnnounce` / `po:onDone`) 은 그대로, **신규 채널 `po:onHealth`** 추가.

### 7.1 이벤트 스키마

```ts
type PoHealthState =
  | 'healthy'
  | 'delegating'
  | 'compacting'
  | 'rate-limited'
  | 'permission-blocked'
  | 'error-other'

type PoHealthEvent = {
  state: PoHealthState
  detail?: {
    persona?: string         // delegating
    resetAt?: string         // rate-limited (ISO, optional)
    errorMessage?: string    // error-other
    deniedPattern?: string   // permission-blocked
  }
  at: string                 // ISO
  msgId?: string
}
```

### 7.2 감지 매핑 (po-runner.ts 확장)

| Source | Pattern | → state |
|---|---|---|
| `result.subtype === 'error'` envelope | (any) | `error-other` |
| stderr line matches `/rate.?limit/i` 또는 `/quota/i` | regex | `rate-limited` (try parse `/resets? at ([0-9:T+\-Z]+)/i` for resetAt) |
| stderr line matches `/(permission|denied|deny)/i` AND tool was Write/Edit/Bash | regex | `permission-blocked` |
| assistant text matches `/^I (need|require) (your )?permission/i` AND tool_use immediately preceded | regex | `permission-blocked` |
| tool_use envelope: `name === 'Write' \|\| 'Edit' \|\| 'Bash'` 직후 30s 내 `result` envelope 없음 | timeout | `permission-blocked` (provisional — 60s 까지도 X 면 confirm) |
| `result.subtype === 'compact_pre'` 또는 envelope 의 `compact` flag | flag | `compacting` |
| `assistant` envelope 의 tool_use `name === 'Task'` (sub-agent invoke) | flag | `delegating` (extract `subagent_type`) |
| child `error` event (`spawn failed`) | event | `error-other` |
| child `close` with `code !== 0 && code !== null` AND no other state set | event | `error-other` |
| 일정 시간 (default 15s) 동안 token/announce 무이벤트 + result 미수신 | timeout | hint only — heuristic 으로 `compacting` 추정. confirm X — `compacting` 은 explicit envelope 우선. 본 분기는 fallback. |
| (none of above) + result 정상 | — | `healthy` (전이 시점에 emit) |

### 7.3 state machine

```
healthy ─turn start─▶ delegating? compacting? (info path)
       ─stderr/result error─▶ permission-blocked / rate-limited / error-other
delegating ─turn complete─▶ healthy
compacting ─turn complete─▶ healthy
permission-blocked ─session restart─▶ healthy
rate-limited ─next successful turn─▶ healthy
error-other ─retry success─▶ healthy
```

idempotent emission: 동일 state 연속 emit 시 dedupe (last emitted 기억). state 변할 때만 send.

### 7.4 timing 시퀀스 (예시)

```
t=0   user sends message
t=0   po-runner emit { state: 'delegating'? } — undecided yet, hold
t=0.3 first system.init envelope → emit { state: 'healthy' } (turn started)
t=2   tool_use Task → emit { state: 'delegating', persona: 'designer' }
t=42  assistant text starts streaming → still delegating until done
t=58  result envelope → emit { state: 'healthy' }
```

permission-blocked 케이스:

```
t=0   user sends "patch file X"
t=0.5 system.init
t=2   tool_use Write
t=2.2 stderr: "permission denied for /Users/other/..."
       → emit { state: 'permission-blocked', detail: { deniedPattern: 'Write' } }
t=2.3 child close code=1
       → emit { state: 'permission-blocked' }  (dedupe — same state)
       → onDone fires
```

UI 는 `po:onHealth` 받아 zustand store update → StatusBar segment + (severity error 면) Sticky banner + FAB badge 동시 reflect.

### 7.5 healthy 복귀 trigger

- 사용자가 CTA 동작 (restart / retry) 하면 그 turn 의 첫 envelope 가 정상이면 `healthy` emit.
- rate-limited 의 경우 다음 send 가 성공하면 `healthy`.
- banner dismiss 만으로는 healthy 복귀 X — 상태는 유지, banner 만 닫힘. StatusBar segment 는 계속 노출.

---

## 8. Acceptance criteria 카테고리 (ticket 측 cover)

a) **state 감지** — po-runner.ts 가 6 state 모두 emit. dedupe 동작. 시간 기반 heuristic (timeout) 명시 threshold.
b) **StatusBar segment** — always rendered when not healthy. dot+label+cta 레이아웃. tooltip hover 동작.
c) **Sticky banner** — severity error 일 때만 노출. dismiss / CTA 동작. banner dismiss 후 StatusBar 유지 검증.
d) **CTA 동작** — Restart modal / Retry / View log / Open settings link. 4 흐름 모두.
e) **FAB badge** — chat 접힘 상태 시 dot 부착. 클릭 시 chat open + segment 강조.
f) **Auto recovery** — 사용자 액션 후 healthy 복귀가 즉시 (다음 turn 첫 envelope 기준).
g) **i18n** — `workspace.sessionHealth.*` 16 keys EN + KO. T-P4-057 linter pass (보호어 위반 X).

---

## 9. Open questions

- **timeout 임계값** : 30s tool_use → no-result = permission-blocked provisional, 60s = confirmed. 실제 paepyeong 같은 케이스에서 deny 가 stderr 에 즉시 오는지 / silent 인지 — dev R3 patch 시점에 실측. 결과를 본 doc §7.2 에 보강.
- **sub-agent (Task) state 분류** : sub-agent 가 Write deny 받으면 PO session 자체는 healthy 일 수 있음 (PO 는 그저 응답 받음). 그 deny 가 `permission-blocked` 인지 sub-agent 내부 문제로 격리할지 — MVP 는 PO 의 stderr/result 만 보고 sub-agent 는 PO 가 자연어로 통보하게 둠. 추후 페르소나-level health 가 필요해지면 별도 ticket.
- **compacting 의 명시 envelope** : claude CLI 의 `stream-json` 에서 compact 가 explicit envelope 인지 / silent 한지 미확인. dev 단계에서 확인 후 §7.2 의 row 갱신. silent 면 heuristic timeout fallback 만.
- **rate-limit reset 시각 포맷** : 응답 stderr/error 에 reset 시각이 어떻게 들어오는지 (epoch / ISO / wall-clock) 미확인. 실측 후 parser 한 줄 추가.
- **session restart 후 chat history 재 streaming** : restart 시 chat.json 이력은 disk 에 있으나 claude session 은 새 sessionId. T-P4-041 의 `--agent` 첫 turn 으로 시작 → 직전 user 메시지를 새 session 에 inject 해서 conversation continuity 가져갈지 / 사용자가 그냥 다시 묻게 둘지 — MVP 는 후자. 전자 옵션은 Phase 5 후속.

---

## 10. Implementation notes

본 doc 은 design 산출물 — 코드는 dev 가 land. 그래도 dev 가 빠르게 잡을 수 있게 핵심 hook 만:

- `packages/gui/electron/po-runner.ts` 에 `inferHealth(envelope, context)` 함수 추가. context = `{ lastToolUse, lastToolUseAt, lastEmittedState }`.
- `RunCallbacks` 에 `onHealth: (event: PoHealthEvent) => void` 추가. `emitToWebContents` 에 `po:onHealth` 채널 한 줄.
- preload 에 `onHealth` listener 노출 (`window.api.po.onHealth(cb)`).
- renderer 에 `useSessionHealth()` zustand store — `state, detail, lastUpdatedAt, dismissed`.
- `StatusBar` 컴포넌트에 `<SessionHealthSegment />` 추가 (left cluster, project name 다음).
- 신규 컴포넌트 `<SessionHealthBanner />` — workspace shell `MainSplit` 위 sticky. state severity==error 일 때만 mount.
- `<FabPoChat />` (T-P4-041 산물) 에 health dot 추가.
- 모든 신규 컴포넌트는 `packages/gui/src/locales/{en,ko}.json` `workspace.sessionHealth.*` 사용.
- 신규 IPC: `po:restartSession()` — main 측에서 capturedSessionId reset + child kill.

---

## 11. References

- T-P4-041 (PO Chat streaming) — `packages/gui/electron/po-runner.ts` L156-200 envelope handler 가 본 ticket 확장 지점.
- T-P4-049 (persona presence bar) — 시각 토큰 (`--success`, persona color) 일관성 출처.
- T-P4-058 (init hygiene) — `permission-blocked` 의 root-cause fix. CTA 의 "Open settings ↗" 가 그 ticket land 시 의미.
- ROADMAP §313 Open questions: rate-limit reset metadata — 본 doc §9 가 동일 OQ 의 detail-level 후속.
