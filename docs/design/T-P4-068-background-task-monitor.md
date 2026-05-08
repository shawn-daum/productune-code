---
doc: design-plan
ticket: T-P4-068
title: BackgroundTaskMonitor (PresenceBar count badge + StatusBar BackgroundTaskSegment)
owner: pdt-designer
assignee: pdt-developer
qa_required: true
status: ready-for-dev
round: R5 (ad-hoc patch)
date: 2026-05-08
related_tickets:
  - T-P4-049  # PersonaPresenceBar (보강 대상)
  - T-P4-059  # SessionHealthSegment (StatusBar 정합)
  - T-P4-058  # modal/popover surface tokens
  - T-P4-057  # i18n linter (보호어)
  - T-P4-046  # WorkspaceShell grid
supersedes: []
out_of_scope:
  - persona session output 직접 view (Phase 5)
  - task cancel UI (별 ticket)
  - task progress bar (claude CLI progress emit X)
---

# T-P4-068 — BackgroundTaskMonitor design plan

> 사용자 dogfood 발견: PO 가 designer/dev/qa sub-agent 동시 백그라운드 호출 시 GUI
> visibility 부족. 어떤 작업 진행 중인지 사용자가 모름. 사용자 directive (2026-05-08):
> **C 채택 — PersonaPresenceBar 보강 + StatusBar 신 segment 둘 다**.

## §1 Decision

두 영역 분리 (사용자 directive C):

| 영역 | axis | 책임 |
|---|---|---|
| **PersonaPresenceBar** | session 내 페르소나 상태 (기존) | chip idle/working/done + **count badge 신규** |
| **BackgroundTaskSegment** (StatusBar 신 segment) | 동시 진행 sub-agent task 모니터 | 압축 표시 + hover popup detail |

**StatusBar height** 28px → **36px** 로 확대 (사용자 directive: 시각적으로 잘 보이게).
`SessionHealthSegment` (T-P4-059) + `BackgroundTaskSegment` 둘 다 들어가면서 28px 는
정보 밀도 한계.

---

## §2 Ticket 번호 정합

사용 중: 040~049, 051, 055~059, 065, 066. T-P4-067 폐기됨 (사용자 확인).
**본 plan = T-P4-068** 사용. dev 호출 시 acceptance 도 동일 ID.

---

## §3 감지 mechanism

po-runner stream-json envelope 활용 (T-P4-059 detection logic 와 동일 source,
다른 slice).

| envelope event | 의미 | task store 액션 |
|---|---|---|
| `assistant.tool_use` (Task tool) | sub-agent invocation 시작 | `addTask({ id, persona, description, started_at, status:'running' })` |
| `result` event (해당 tool_use_id 매칭) | sub-agent 결과 반환 | `completeTask(id, { status:'done', completed_at })` |
| `assistant.tool_use` 실패 envelope | 에러 종료 | `completeTask(id, { status:'error' })` |

**id 매칭**. `tool_use_id` (Anthropic stream-json 표준) 로 spawn ↔ result pair.
po-runner.ts 에서 이미 envelope parse 중 — 신규 hook 추가만 필요 (코드 변경은 dev 가).

**persona 추출**. `tool_use.input.subagent_type` (예: `pdt-designer`) → store 의
`persona: 'designer'` 로 정규화. 알 수 없는 subagent → `persona: 'unknown'` (fallback).

**description 추출**. `tool_use.input.prompt` 첫 줄 또는 `tool_use.input.description`
필드. 80 chars truncate + `…`.

---

## §4 PersonaPresenceBar 보강

**기존 유지**. 4 페르소나 chip / idle/working/done / 마지막 dispatch 표시 / blink 애니.
T-P4-049 그대로.

**신규 — count badge**.
- `working` 상태 task 수 ≥ 2 인 페르소나 chip 우상단에 작은 숫자 배지
- 0 / 1 → 배지 X (chip 자체 working 색만)
- 2+ → 배지 표시 (예: `2`, `3`, `9+`)

**시각 spec**.
- 배지 size: 14px × 14px circle, 우상단 -2px / -2px offset
- 배지 bg: chip 의 persona token 와 동일 hex (`--persona-designer` 등) — 채도 유지
- 배지 text: `--text-emphasis` (#F0F0F0), 10px / weight 600
- 배지 border: 2px `--surface-body` (#0F0F0F) outline — chip 위에 떠 있는 느낌
- chip 자체는 기존 working 색 + blink 유지. 배지 전용 motion X.

**상호작용**.
- chip click → BackgroundTaskSegment 의 hover popup 강제 open + 해당 페르소나
  task list 만 filter (popup 상단에 "designer (2)" 헤더 + close affordance).
- chip click 은 기존 동작 (없으면 신규) 과 정합 — 기존 click 동작 있으면 dev
  검토 후 결정. 없으면 신규 추가.

**i18n**. 배지는 숫자만 — 어휘 영향 X.

---

## §5 BackgroundTaskSegment (StatusBar 신 segment)

### 5.1 위치

StatusBar 안. 권장 순서 (왼쪽 → 오른쪽):

```
[ workspace name ] | [ SessionHealthSegment ] | [ BackgroundTaskSegment ] | [ ... ]
```

`SessionHealthSegment` 우측. 둘 다 stream-json 에서 도출되는 정보라 인접 배치 =
mental model 정합.

### 5.2 default (compact) 표시

| 동시 task 수 | 표시 |
|---|---|
| 0 | "Idle" placeholder (muted, dim) — §7 Predictability 권장 |
| 1 | `<persona icon> designer working…` |
| 2~3 | `designer × 2 + dev × 1` (count + persona 압축) |
| 4+ | `4 tasks running` (총 count 만) + hover 시 detail |

**시각 spec**.
- height: parent StatusBar (36px) 에 맞춰 통째로 차지, vertical center.
- horizontal padding: 12px
- font: 12px / `--text-secondary` (idle 시 `--text-muted`)
- persona icon: 6px circle dot, `--persona-*` 토큰 hex
- divider: 좌우에 `--border-subtle` 1px vertical (StatusBar 내 segment 관례)
- running 시 미세 dot blink (1.5s loop, 0.6 → 1.0 opacity, reduced-motion 시 stop)

### 5.3 hover popup

T-P4-058 modal/popover surface 토큰 정합.

```
┌──────────────────────────────────────────────┐
│ Background tasks (3)                    [×] │
├──────────────────────────────────────────────┤
│ ● designer  Critique R3 PRD draft            │
│             3m 12s · running                 │
├──────────────────────────────────────────────┤
│ ● designer  Add T-P4-068 plan                │
│             1m 04s · running                 │
├──────────────────────────────────────────────┤
│ ● dev       Implement T-P4-066 IPC           │
│             0m 22s · running                 │
├──────────────────────────────────────────────┤
│ Recent (last 10)                             │
│ ◌ qa        Run regression suite             │
│             completed 12s ago                │
└──────────────────────────────────────────────┘
```

**spec**.
- portal positioning: StatusBar segment 우측 정렬, 위로 펼침 (StatusBar 가 화면 하단)
- bg: `--surface-modal` (#1C1C20)
- border: 1px `--border-strong` (#2A2A2A)
- border-radius: 8px
- shadow: T-P4-058 modal shadow 토큰
- max-width: 360px / max-height: 320px (overflow scroll)
- row gap: 8px / row internal padding: 8px 12px
- row hover: `--surface-subpanel` (#1A1A1A) bg

**row anatomy**.
- left dot: 6px persona color
- center: description (1줄, ellipsis) + sub-row (duration · status, `--text-muted`)
- click row: dismiss only (Phase 5 에서 chat jump 검토 — out of scope)

**완료된 task 처리**.
- `status: 'done'` 전이 시 row → "Recent" 섹션으로 이동
- auto-fade: 완료 후 **5s** 후 fade-out 200ms → "Recent" 로 이동 (compact 표시에서는 즉시 제거)
- "Recent" 섹션 = 최근 10 개 done/error task. session 종료 시 reset.
- 사용자 click dismiss 가능 (row 우측 hover 시 작은 × 노출)

**dismiss 정책**.
- running task 는 dismiss 불가 (sub-agent 끝까지 기다려야 정합)
- done/error 만 dismiss

### 5.4 빈 상태 (Idle)

`--text-muted` 톤으로 "Idle" 텍스트만. clickable 하지만 popup 은 비어 있음 (
"No background tasks." empty state 메시지).

§7 Predictability 권장 — 사용자가 "어디 있는지" 항상 인지.

### 5.5 error 상태

task `status: 'error'` 시:
- compact: 해당 persona dot → `--health-error` (#EF4444) 로 일시 (5s) 변경 후 done 과 동일 처리
- popup row: status 라벨 "error" + `--health-error` 텍스트
- 별도 toast X (StatusBar 내에서 self-contained)

---

## §6 StatusBar height 변경

### 6.1 spec

| 항목 | 현재 | 신규 |
|---|---|---|
| WorkspaceShell `gridTemplateRows` | `44px / 1fr / 28px` | `44px / 1fr / 36px` |
| StatusBar height | 28px | **36px** |
| StatusBar font | 11px | 12px (한 단계 상승, height 증가에 맞춰) |
| StatusBar segment vertical padding | 6px / 4px | 8px / 6px |

### 6.2 영향 검토 (dev 검증 항목)

- `WorkspaceShell` (T-P4-046) grid template 1줄 변경 + 인접 컴포넌트 sticky offset 재계산
- `PhaseTransitionGate` sticky offset (만일 bottom 기준 sticky 면 재계산)
- 모든 modal / popover 의 viewport 계산이 `100vh - statusBar` 식으로 짜여 있다면 수정
- e2e snapshot 갱신 (height 변화로 다수 snapshot 변동 예상)
- 회귀: SessionHealthSegment (T-P4-059) 시각 정합 — 36px 안에서 vertical center 재확인

### 6.3 alternatives 검토

| 옵션 | 장점 | 단점 | 결정 |
|---|---|---|---|
| 28px 유지 + segment 좁게 | 다른 컴포넌트 영향 X | 사용자 directive 정면 위반 (잘 안 보임) | ✗ |
| **36px** | 본 두 segment 둘 다 충분 + StatusBar 정보 밀도 향상 | 다른 컴포넌트 영향 검토 필요 | ✓ |
| 40px+ | 매우 넉넉 | viewport 1080p 에서 chat pane 압박 | ✗ |

---

## §7 Design system 정합 (§1.5 UX principles self-check)

| sub-rule | 적용 | 비고 |
|---|---|---|
| 2-1 Few Things | StatusBar 안 segment 압축 표시. 한 segment = 한 책임. detail 은 hover 단계화. | OK |
| 2-2 익숙한 경험 | VSCode StatusBar segment + GitHub task badge 패턴 차용. 한국어 본문 + 페르소나 영문 보존 (T-P4-057). | OK |
| 3-1 Predictability | Idle placeholder 권장 — segment 가 task 0 시에도 항상 같은 위치. 사라지는 UI = 예측 불가 안티패턴. | **권장: visible + "Idle"** |
| 3-2 Feedback | task spawn 시 segment 텍스트 즉시 갱신 + dot blink. complete 시 fade transition. error → 색 변화. | OK |
| 3-3 Escape | hover popup → Esc 닫기 + 외부 click 닫기 + 우상단 × 버튼. dismiss 가능 (done/error). running task dismiss 불가 = 사용자에게 명시 (row 위 hover 시 × 비활성 + tooltip "still running"). | OK |

---

## §8 i18n

key prefix: `workspace.backgroundTasks.*`

| key | en | ko |
|---|---|---|
| `idle` | "Idle" | "대기 중" |
| `running` | "running" | "진행 중" |
| `done` | "done" | "완료" |
| `error` | "error" | "오류" |
| `nTasksRunning` | "{count} tasks running" | "{count}개 작업 진행 중" |
| `recent` | "Recent" | "최근" |
| `empty` | "No background tasks." | "백그라운드 작업이 없습니다." |
| `stillRunning` | "still running" | "진행 중 — 종료 대기" |
| `popupTitle` | "Background tasks ({count})" | "백그라운드 작업 ({count})" |
| `dismiss` | "Dismiss" | "닫기" |

**보호어**. 페르소나 이름 (`designer`/`dev`/`qa`/`PO`) 영문 보존 (T-P4-057). 본문
한국어 모드에서도 chip / row 의 persona 라벨은 영문.

---

## §9 IPC / store 구조

### 9.1 신규 store slice

`src/store/useBackgroundTasks.ts` (zustand) — 별 slice, SessionHealth 와 충돌 X.

```ts
type BackgroundTask = {
  id: string;            // tool_use_id from envelope
  persona: 'po' | 'designer' | 'dev' | 'qa' | 'unknown';
  description: string;   // truncated 80 chars
  started_at: number;    // epoch ms
  completed_at?: number;
  status: 'running' | 'done' | 'error';
};

type Store = {
  tasks: BackgroundTask[];      // running + recent (last 10 done/error)
  addTask(task: BackgroundTask): void;
  completeTask(id: string, status: 'done' | 'error', completed_at: number): void;
  dismissTask(id: string): void;       // done/error only — running 무시
  selectors: {
    running(): BackgroundTask[];
    recent(): BackgroundTask[];        // done/error, last 10
    countByPersona(): Record<Persona, number>;  // running only
  };
};
```

### 9.2 po-runner integration

`src-tauri/src/po_runner.rs` (또는 `po-runner.ts` Node 측) 의 stream-json parser:
- `assistant.tool_use` → emit IPC event `background-task:start`
- `result` (tool_result) → emit `background-task:complete`
- React 측 `useBackgroundTasks.ts` 가 listen → store 업데이트

**기존 SessionHealth detection 과 충돌 X** — 별 event channel.

### 9.3 cleanup

session 종료 (PO chat reset) 시 store reset. Recent 도 clear.

---

## §10 Acceptance criteria (다음 dev 호출용)

- [ ] StatusBar height 36px 적용 + WorkspaceShell grid 변경 + 인접 컴포넌트 위치 회귀 X
- [ ] `BackgroundTaskSegment` 신규 컴포넌트 — compact 표시 (0/1/2-3/4+ 4 케이스) + Idle placeholder
- [ ] portal hover popup — running list + Recent 섹션 + auto-fade 5s + dismiss (done/error only)
- [ ] `PersonaPresenceBar` count badge — working ≥ 2 시 우상단 14px 배지
- [ ] chip click → popup 강제 open + 해당 persona filter
- [ ] `useBackgroundTasks` store + po-runner stream-json integration (`tool_use_id` 매칭)
- [ ] i18n key 10 개 (`workspace.backgroundTasks.*`) en/ko 둘 다
- [ ] T-P4-057 보호어 linter 통과 (페르소나 이름 영문 보존)
- [ ] 회귀: T-P4-049 PresenceBar 기존 동작 / T-P4-059 SessionHealthSegment 위치 / T-P4-046 split-pane height 계산
- [ ] reduced-motion 모드에서 dot blink / fade transition 비활성
- [ ] e2e: 동시 sub-agent 2 회 dispatch → segment count 표시 / popup 안 row 2 개 / complete 시 Recent 이동

---

## §11 Out of scope

- task 의 persona session output 직접 view (Phase 5 에서 popup row click → chat jump 검토)
- task cancel UI (사용자가 진행 중 중단) — 별 ticket
- task progress bar (claude CLI progress emit 안 함)
- light theme

---

## §12 Open questions (사용자 confirm 가치 — but ad-hoc 진행)

1. **StatusBar height 36px 정합?** — 본 plan default. 다른 값 (32px / 40px) 원하면 dev call 전 알림.
2. **Idle placeholder 노출?** — 본 plan default = 노출 ("Idle"). 숨김 원하면 dev call 전 알림.
3. **task done auto-fade 시간?** — 본 plan default = 5s. 3s / dismiss-only 원하면 알림.
4. **chip click 기존 동작?** — T-P4-049 PresenceBar chip 의 기존 click 동작 정의 여부 — dev 가 코드 확인 후 정합 결정.

> 사용자 redirect 없으면 default 로 dev 호출 진행.

---

## §13 Review checklist (designer self-check)

- [x] §1.5 5 sub-rule 모두 명시적 적용
- [x] design-system §2 token 만 참조 (hex 직접 명시는 spec 표 안에서만)
- [x] T-P4-049 / T-P4-059 / T-P4-058 / T-P4-046 관계 명시
- [x] i18n 보호어 (페르소나 영문) 강제
- [x] reduced-motion 정합
- [x] out-of-scope 명시
- [x] acceptance criteria 12 개 dev 가 바로 ticket 화 가능한 수준
