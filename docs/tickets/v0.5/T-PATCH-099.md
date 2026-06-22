---
ticket_id: T-PATCH-099
title: "Dispatch Progress 영역 재기획 — dash-rail 제거, 단일 progress 레인으로 통합"
version: v0.5
round: patch
type: impl
status: done
phase: 3
assignee: pdt-developer
estimated_complexity: L3
model: sonnet
effort: high
risk_flags: none
slug: dispatch-progress-redesign
qa_status: pass
qa_loops: 1
area_tags: [gui/ticket-detail, gui/dispatch, design/redesign]
created_at: 2026-06-10
---

| T-PATCH-099 | dispatch-progress-redesign | user-verify |

# T-PATCH-099: Dispatch Progress 영역 재기획 — dash-rail 제거, 단일 progress 레인으로 통합

> GUI fix batch #4. `TicketDetailTab` 의 "Dispatch Progress" 섹션을 처음부터 다시 기획한다.
> 구현은 dev. 본 티켓은 design spec(레이아웃 + 변경점)을 확정한다.

## §1 Request

### 1.1 유저 지시 (verbatim)

> "Ticket dispatch progress ui 정리. Po des dev qa 모두 - 이렇게 되어있는데.. 필요없는 영역같은데."
>
> (clarification) "그냥 이 영역만 새로 기획해서 작업해줘. 뭔가 우당탕돼서 섞인느낌이야."

### 1.2 현재 상태 분석 — 왜 '우당탕 섞임' 인가

대상: `packages/gui/src/components/workspace/main/panes/TicketDetailTab.tsx` `§2b DispatchProgress`
(`<section style={dispatchWrap}>`, 약 341–409행). 현재 한 섹션 안에 **세 덩어리**가 쌓여 있다.

1. **meta row** (`dpMeta`, 354–386행) — `status` / `assignee`(컬러 dot + persona) / `qa_status`(+`qa_loops`)
   을 key-value 로 나열.
2. **4-column persona rail** (`railGrid` + `PersonaCard`, 389–393행) — po / designer / developer / qa
   네 칸. 각 칸 = 컬러 dot + persona 이름 + state 라벨. `buildRail()`(125–172행)이 state 를
   `poState.persona_sessions` 와 `current_task.ticket_id`/`assignee` 에서 파생.
   - 한 티켓에 동시에 active 인 persona 는 사실상 1명 → 나머지 3칸은 `idle` 또는 `—`(dash).
   - `persona_sessions` 가 비어있으면 **네 칸 전부 `—`** → 유저가 본 "PO des dev qa 모두 -".
3. **next-action row** (`nextActionRow`, 396–408행) — `deriveNextAction()` 파생 텍스트 + `(status: …)`.

**핵심 문제 — 정보 중복 + 신호 부재:**

- **assignee 가 2번 표현된다.** meta row 의 `assignee` dot/라벨과, rail 에서 active 로 칠해지는
  칸이 같은 사실(지금 누구 차례인지)을 두 번 말한다.
- **rail 의 4칸은 대부분 빈칸(dash)** 이다. "이 티켓에 4 persona 가 다 관여한다"는 잘못된 기대를
  주는 grid 인데, 실제로 채워지는 건 1칸뿐이라 나머지는 noise. 유저가 "필요없는 영역"이라 부른 부분.
- **rail 의 `idle · 세션 live`** 는 "그 persona 의 세션이 살아있다"는 *런타임 세션* 신호로,
  *티켓 진행 단계* 와 무관하다. 티켓 상세 화면에서 섞여 들어와 의미 혼선을 만든다.
- **진짜 useful 한 신호** — 이 티켓이 po → designer → developer → qa 파이프라인의 **어디까지 왔나**
  (어느 단계가 done, 지금 어느 단계, 남은 단계) — 는 *어디에도* 깔끔하게 표현돼 있지 않다.
  dash-rail 은 "관여 여부"만 흐리게 보여줄 뿐 "진행 위치"를 못 보여준다.

→ 결론: meta row 의 일부(assignee/qa) + dash-rail + next-action 이 **같은 사실을 셋으로 쪼개
중복 표현**하면서 정작 "파이프라인 진행 위치"라는 핵심은 비어 있다. 이걸 **하나의 비중복
progress 레인**으로 재기획한다.

## §2 Acceptance

- [x] 4-column dash-filled persona rail (`railGrid` + `PersonaCard` grid)이 **제거**된다.
      "PO des dev qa 모두 —" 표시가 더는 나타나지 않는다.
- [x] Dispatch Progress 섹션이 **단일 가로 progress 레인** 1개 + 보조 메타 1줄 + next-action 1줄,
      총 3개 요소로 정리된다 (현재 meta row / rail / next-action 의 중복 없는 재배치).
- [x] 같은 사실(지금 누구 차례)이 **한 번만** 표현된다. assignee 는 progress 레인의 current 노드에서
      읽히며, 별도 `assignee` key-value 중복 표기는 없앤다.
- [x] progress 레인이 **파이프라인 진행 위치**를 보여준다: po → designer → developer → qa 4단계 중
      done / current / upcoming 을 시각적으로 구분.
- [x] `qa_status` + `qa_loops` 는 유지하되 qa 단계 노드에 종속된 형태로 표현 (별도 떠다니는 줄 제거).
- [x] next-action(파생 텍스트)은 유지하되 한 줄로 정리, 중복 `(status: …)` tag 정돈.
- [x] 런타임 *세션* 신호(`idle · 세션 live` / `persona_sessions` 기반 idle 표시)는 티켓 진행
      레인에서 **분리/제거** — 진행 단계와 세션 생존을 섞지 않는다.
- [x] design-system 토큰 준수: persona 색 = `--persona-*`, 텍스트 recipe(`label`/`metadata`),
      dot 8px `--radius-full` (§4.b 정본; 기존 6px → 8px ring 균형), icon lucide stroke 2. 컬러 emoji 금지.
- [x] `current` 단계 dot 의 motion 은 §9 허용 목록 내(`persona-blink`)만 사용,
      `prefers-reduced-motion` 정합.
- [x] read-only 성격 유지(`derivedReadOnly` 마커), 파생 데이터이므로 action 버튼 없음.
- [x] i18n: 기존 `workspace.ticketDetail.*` 키 재사용, 신규 키는 ko/en parity. 보호어
      (`PO`/`designer`/`developer`/`qa`/`status`/`qa_status`) 영문 보존(§10).
- [x] `pnpm tsc --noEmit` green. dead code(`buildRail`/`PersonaCard`/관련 style/type) 제거.

## §3 Out of scope

- `poState.persona_sessions` 의 데이터 모델/수집 로직 변경 (read-only 소비만).
- `deriveNextAction()` 의 *판정 로직* 변경 — 표현만 정리, 분기 규칙은 그대로.
- KR body / full-spec collapsible / breadcrumb / header region 등 섹션 외 영역.
- 티켓 상세 화면 밖의 PersonaPresenceBar(§8.6) 본체 — 그건 워크스페이스 전역 컴포넌트로 별개.
- 신규 액션(재할당, 단계 강제 이동 등) — 본 영역은 끝까지 read-only.

## §4 Implementation plan / Design spec

### 4.1 컨셉 — "Pipeline Lane"

dash grid 를 버리고, 티켓의 4단계 파이프라인을 **한 줄의 수평 레인**으로 표현한다.
각 단계는 노드(dot + persona 라벨)이고, 노드 사이는 connector 선으로 잇는다.
한 티켓은 항상 이 4단계 위 *한 지점*에 있으므로, "지금 어디" 가 한눈에 들어온다.

단계 상태는 3가지(파생):

| state | 판정 | 시각 |
|---|---|---|
| `done` | current 단계보다 앞선 단계 | dot = persona색 filled, connector = persona색 solid, 라벨 `--text-secondary` |
| `current` | 지금 차례 (= assignee 의 persona 단계; `deriveNextAction` 가 가리키는 단계) | dot = persona색 + `persona-blink`, 라벨 `--text-emphasis` bold, 노드에 underline 2px `--accent` |
| `upcoming` | current 이후 단계 | dot = `--border-default` outline(빈 원), connector = `--border-default` dashed, 라벨 `--text-faint` |

> current 단계 산정: `status`/`assignee`/`qa_status` 에서 파생.
> `assignee` 가 `pdt-<persona>` 이면 그 persona 단계가 current. `status === done` 이면 4단계 모두 done.
> 기존 `buildRail` 의 active 판정(`current_task` 매칭)은 **세션 신호라 폐기**하고,
> 티켓 frontmatter(`status`/`assignee`/`qa_status`) 기반 파생으로 대체한다 (티켓 상세 = 티켓
> 사실의 뷰이지 런타임 세션 뷰가 아니므로).

### 4.2 ASCII mockup

```
┌─ Activity  Dispatch Progress              ⓘ Derived · read-only ──┐
│                                                                    │
│   ●━━━━━━●━━━━━━◉╌╌╌╌╌╌○                                          │
│   PO    designer developer  qa                                     │
│   done   done    current   upcoming                                │
│                            └ qa_status: smoke · loops 0            │  ← qa 노드에 종속
│                                                                    │
│   → Next  developer 진행 중                          status: in-progress │
└────────────────────────────────────────────────────────────────────┘

범례:
  ●  done       = persona색 filled dot, solid connector(━)
  ◉  current    = persona색 dot + blink + 하단 2px accent underline
  ○  upcoming   = border outline 빈 dot, dashed connector(╌)
  state 라벨(done/current/upcoming)은 노드 아래 metadata recipe, 1줄.
```

- 레인은 4 노드를 `space-between` 가로 배치, 노드 폭 균등. 노드 = dot(상단) + persona name + state 라벨(세로 스택).
- connector 는 노드 사이 1px(done=solid persona색, upcoming=dashed `--border-default`).
  current 노드의 "들어오는 connector"까지는 done 색, "나가는 connector"는 upcoming 색.
- qa 단계가 current 이거나 done 일 때만 qa 노드 하단에 `qa_status · loops N` micro-라벨 부착.
  `qa_status === 'n/a'` 면 생략. (떠다니던 meta `qa_status` 줄을 여기로 흡수 → 중복 제거.)
- next-action: 레인 아래 한 줄. `ArrowRight`(current persona색) + `Next` 라벨 + 파생 텍스트(bold).
  우측 끝에 `status: <status>` 를 muted tag 로 정렬(현재 inline `(status: …)` 를 우측 정렬로 정돈).

### 4.3 TicketDetailTab.tsx 변경점

**제거:**
- `railGrid` JSX 블록(389–393행)과 `PersonaCard` 매핑 — 삭제.
- `PersonaCard` sub-component(444행~) — 삭제.
- `dpMeta` 블록(354–386행) 중 `assignee` key-value 와 `qa_status` key-value — 삭제
  (assignee → 레인 current 노드로, qa_status → qa 노드 micro-라벨로 이전).
  `status` 단독 표기도 next-action 우측 tag 로 흡수되므로 `dpMeta` 블록 자체를 제거.

**교체/신설:**
- `buildRail()` (125–172행) → `buildPipeline()` 로 교체. 시그니처:
  `buildPipeline(status, assignee, qaStatus, qaLoops, t)` → `PipelineNode[]`.
  - persona 순서 고정 `['po','designer','developer','qa']`.
  - 각 노드 `{ id, label, color, stage: 'done'|'current'|'upcoming', qaMeta? }`.
  - current = assignee persona; assignee 인덱스보다 작으면 done, 크면 upcoming.
    `status === 'done'` → 전부 done; `status === 'todo'` 이고 assignee 미정이면 po 를 current.
  - `current_task`/`persona_sessions` 인자 **미사용** → 호출부(227–234행)에서 해당 인자 제거.
- `PersonaRailEntry` / `PersonaRailState` 타입 → `PipelineNode` / `PipelineStage` 로 교체.
- `PERSONA_COLORS` 는 재사용(노드 dot 색). design-system `--persona-*` 토큰과 일치 확인.
- 새 sub-component `PipelineLane({ nodes })` — 4 노드 + connector 렌더. 노드 stage 별 스타일은
  4.1 표 대로. `current` dot 에 `className="pdt-persona-blink"`.
- next-action row(`nextActionRow`)는 유지하되 `(status: …)` 를 우측 정렬 tag(`naTag`)로 이동.

**style 객체:**
- 신규: `laneWrap`(flex row, space-between, align-start), `laneNode`(flex col, gap 4, center),
  `laneConnector`(flex:1, height 1, done=persona색 solid / upcoming=`--border-default` dashed),
  `qaMicro`(metadata recipe, `--text-muted`, qa 노드 하단).
- 제거: `railGrid`, `personaCard`, `pTop`, `pDot`, `pName`, `pState`, `dpMeta`, `dpKey`, `dpVal`
  (dpMeta 계열은 다른 곳에서 미사용이면 삭제, 사용처 있으면 보존 — grep 확인).

### 4.4 i18n

- 재사용: `workspace.ticketDetail.nextLabel`, `…derivedReadOnly`, `…dispatchProgress`.
- stage 라벨 신규 키(ko/en parity, `.dev` 변형은 기존 컨벤션 따름):
  - `workspace.ticketDetail.stageDone` — ko `완료` / en `done`
  - `workspace.ticketDetail.stageCurrent` — ko `진행 중` / en `current`
  - `workspace.ticketDetail.stageUpcoming` — ko `예정` / en `upcoming`
  - `workspace.ticketDetail.qaMeta` (interp `{{status}}`,`{{loops}}`) — ko `qa_status: {{status}} · loops {{loops}}` / en 동일(보호어 유지)
- persona 이름(`PO`/`designer`/`developer`/`qa`), `status`/`qa_status` = 보호어, 번역 금지(§10).

### §4.b QA-feedback redesign — Pipeline Lane polish + status→stage fix

> QA(유저) 피드백: 레인이 구현됐으나 "더 예쁘게(prettier)". + **state-mapping 오류** —
> `status === review`(dev 끝, QA 대기)일 때 레인이 developer 를 current(`작업 중`)로
> 표시하는데, review = "QA 검수 중"이므로 **qa 노드가 current** 로 읽혀야 한다.
> 본 절은 §4.1~4.2 의 시각 정의를 refine 하고 §4.1 의 current 산정을 보정한다.

#### 1) status → stage 매핑 (보정 · 정본)

current 산정을 frontmatter status 우선으로 명문화. `assignee` 는 보조(특히 todo/blocked).
노드 순서 고정 `[po, designer, developer, qa]` (idx 0..3).

| status | current 노드 | done | upcoming | 비고 |
|---|---|---|---|---|
| `todo` | po (idx0) | — | designer·developer·qa | assignee 명시 시 그 단계가 current |
| `in-progress` | assignee persona 단계 | < current | > current | assignee 미정이면 developer 추정 fallback |
| `review` | **qa** (idx3) | po·designer·developer | — | **수정 핵심**: review = under QA → qa 가 current (developer 아님) |
| `user-verify` | qa (idx3) | po·designer·developer | — | QA 통과·유저 확인 단계 → qa 를 current 로 유지(검수 연속) |
| `done` | — (current 없음) | 전부(po..qa) | — | 4 노드 all done, 마지막 노드 강조 없음 |
| `blocked` | assignee persona 단계 | < current | > current | current 노드를 `blocked` 변형(아래 2번) |
| `abandoned` | — | — | — | 전 노드 `--text-disabled` ghost, blink 없음, next-action="중단됨"류 |

> 핵심 변경: 기존 §4.1 의 "current = assignee persona" 단독 파생 → **status 가
> qa-검수 계열(`review`/`user-verify`)이면 assignee 와 무관하게 qa 를 current**. dev 가
> 작업을 끝내 review 로 넘겼으면 developer 는 done, qa 가 in-review(current).
> `buildPipeline(status, assignee, qaStatus, qaLoops, t)` 내부에서 status 분기를
> assignee 분기보다 **먼저** 평가한다.

#### 2) 시각 refine — done / current / upcoming / blocked

§4.1 표를 다음으로 대체(더 정제된 dot·connector·typo hierarchy):

| stage | dot | connector(나가는 선) | persona label | state 라벨 |
|---|---|---|---|---|
| `done` | 8px filled `--persona-*`, 무 ring | 1px **solid** `--persona-*` (들어온 선) | `label` recipe, `--text-secondary`, weight medium | 생략(아래 6번) |
| `current` | 8px filled `--persona-*` + `persona-blink` + **2px ring** `color-mix(--persona 40%,transparent)` (underline 대신 ring 으로 정제) | 나가는 선 = upcoming 색 | `label` recipe, `--text-emphasis`, **weight semibold** | `metadata`, `--text-secondary` (`진행 중`) |
| `upcoming` | 8px **outline** 빈 원 1.5px `--border-default` | 1px **dashed** `--border-default` | `label`, `--text-faint`, regular | 생략 |
| `blocked` | 8px filled `--status-blocked` + ring `--status-blocked` 40% (blink 없음) | 들어온 선 done 색 | `--text-primary` semibold | `metadata` `--status-blocked` (`차단됨`) |

정제 포인트(prettier):
- **underline → ring**: current 강조를 하단 2px accent underline(레이아웃을 비대칭으로
  밀던 요소) 대신 **dot 외곽 ring** 으로. 노드 baseline 정렬이 깔끔해지고 persona 색과
  강조가 한 지점(dot)에 모인다.
- **connector 정렬**: connector 는 dot **수직 중심**에 맞춘다(라벨 행이 아니라 dot 행에
  그어 노드 높이차와 무관하게 직선 유지). done=solid persona색, upcoming=dashed border색,
  굵기 1px 통일.
- **노드 간격**: 레인은 `space-between` 가 아니라 `flex` + connector `flex:1` 로 채워
  4 노드가 양끝 정렬되며 connector 가 가변 폭(반응형). 레인 좌우 padding `--space-2`.
- **dot 크기 통일 8px** `--radius-full`(§8.6 PresenceBar 정합, 기존 6px → 8px 로 상향해
  ring 과의 시각 균형 확보).

#### 3) Typography hierarchy (노드 3행 스택)

노드 = 세로 스택 3행, gap `--space-1`(4):
1. **dot** (8px, 위 2번)
2. **persona name** — `label` recipe(14/medium). current 만 semibold + `--text-emphasis`.
   보호어(영문 보존): `PO` / `designer` / `developer` / `qa`.
3. **state 라벨** — `current`/`blocked` 노드에만 노출(`진행 중`/`차단됨`). done·upcoming 은
   **라벨 생략**(기존엔 done/예정까지 전부 깔아 시각 noise → current 1개만 라벨링해
   "지금 여기" 신호를 또렷하게). `metadata` recipe, current=`--text-secondary`.

> 정보 hierarchy: 색(persona)·강조(ring+semibold)·라벨(current만) 세 신호가 모두 current
> 노드 1곳에 수렴 → 한눈에 "지금 어디". done/upcoming 은 dot+이름만으로 조용히.

#### 4) qa micro-meta 정렬

`qa_status · loops N` 은 qa 노드가 `current` 또는 `done` 일 때만, **qa 노드의 state 라벨
자리(3행)** 에 붙인다(별도 떠다니는 줄 / 별도 ASCII 분기선 제거 → 더 깔끔). `metadata`
recipe `--text-muted`, qa 노드 폭 안에서 ellipsis. `qa_status === 'n/a'` 면 생략.
review/user-verify(qa=current)일 때 자연히 노출된다.

#### 5) next-action row 정렬

레인 아래 `--space-3` 간격, 한 줄, 좌우 양끝 정렬(`space-between`):
- **좌**: lucide `ArrowRight` `--icon-sm`(14) stroke 2, color=current persona색 + `Next`
  라벨(`metadata`, `--text-muted`) + 파생 텍스트(`label`, `--text-secondary`, medium).
- **우**: `status: <status>` neutral pill(§8.2 neutral variant: bg `--surface-subpanel`,
  `--text-muted`, `pill` recipe uppercase). status 보호어 영문 보존(§10).

> 좌(행위 지향 next)·우(상태 fact) 분리로 한 줄 안에서 읽는 순서가 명확. 기존 inline
> `(status: …)` 의 괄호 표기 제거.

#### 6) ASCII mockup (refined — review 상태 예시)

```
┌─ Dispatch Progress                                ⓘ Derived · read-only ─┐
│                                                                          │
│      ●━━━━━━━●━━━━━━━●━━━━━━━◉                                            │  ← dot 행에 connector
│      PO      designer developer  qa                                      │  ← persona name (current=semibold)
│                                  진행 중                                  │  ← state 라벨 = current 노드만
│                                  smoke · loops 0                         │  ← qa micro-meta (qa current/done 시)
│                                                                          │
│   → Next  qa 리뷰 대기                              [ STATUS: REVIEW ]    │  ← 좌 next / 우 status pill
└──────────────────────────────────────────────────────────────────────────┘

범례:
  ●  done     = persona색 8px filled, solid connector(━), 이름만(라벨 생략)
  ◉  current  = persona색 8px filled + blink + ring, 이름 semibold, 라벨 1줄
  ○  upcoming = border outline 빈 8px, dashed connector(╌), 이름만 faint
  (review 예시 → developer=done, qa=current. 기존 버그는 developer=current 였음)
```

```
done 예시(status: done) — current/upcoming 없음, 라벨 전무:
      ●━━━━━━━●━━━━━━━●━━━━━━━●
      PO      designer developer  qa
   → Next  완료 — 다음 action 없음                  [ STATUS: DONE ]
```

#### 7) 구현 메모 (§4.3 보강)

- `buildPipeline` 내부 분기 순서: `status` 우선(`done`/`review`/`user-verify`/`abandoned`
  특수 처리) → 그 외 `assignee` 인덱스로 done/current/upcoming. **review/user-verify →
  qa(idx3) current 강제** 가 본 절의 코드 보정점.
- current underline style(`--accent` 2px) 제거 → dot ring style 로 교체. `laneNode` 의
  underline 관련 style 삭제, `laneDot` 에 ring 변형 추가.
- state 라벨을 done/upcoming 에서 미출력(조건부 렌더) → `stageDone`/`stageUpcoming` i18n
  키는 유지하되 노드에는 current/blocked 만 바인딩(접근성 `aria-label` 용으로 done/upcoming
  키는 dot 의 `aria-label` 에 보존: "developer done" 등).
- connector 를 dot 수직 중심에 정렬: `laneConnector` 를 dot 행에 absolute/flex 정렬
  (라벨 스택과 분리). 노드 간 라벨 행 높이 차가 connector 직선을 깨지 않게.

## §5 QA scope

`qa_status: smoke` — 시각/렌더 스모크. 자동화는 가능 범위만, 나머지는 수동 1패스.

- [ ] 빈 `persona_sessions` 상태에서 "PO des dev qa 모두 —" 가 더는 안 나온다 (회귀 핵심).
- [ ] assignee = `pdt-developer`, `status: in-progress` 티켓: 레인이 po·designer=done,
      developer=current(blink), qa=upcoming 으로 렌더.
- [ ] `status: done` 티켓: 4 노드 전부 done, current/upcoming 없음, next-action 은 "다음 action 없음"류.
- [ ] qa 단계 current/done 일 때만 qa 노드 하단 `qa_status · loops N` 노출, `n/a` 면 미노출.
- [ ] assignee 1회만 표현(중복 dot/라벨 없음). next-action 우측 `status:` tag 정렬.
- [ ] ko/en 양 로케일 라벨 정상, raw `key.path` 누수 없음.
- [ ] `prefers-reduced-motion: reduce` 에서 current dot blink 정지.
- [ ] `pnpm tsc --noEmit` green, dead code(buildRail/PersonaCard/관련 style·type) 잔존 없음
      (`grep -n "buildRail\|PersonaCard\|railGrid" packages/gui/src` clean).

## Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
| pdt-developer | T-PATCH-099-impl | 2026-06-10 | 2026-06-10 | claude-opus-4-8[1m] | standard |
| pdt-developer | T-PATCH-099-qa-fix | 2026-06-10 | 2026-06-10 | claude-opus-4-8[1m] | standard |
| pdt-qa | T-PATCH-099-qa | 2026-06-10 | 2026-06-10 | claude-opus-4-8[1m] | standard |
| pdt-developer | T-PATCH-099-qa-fix2 | 2026-06-10 | 2026-06-10 | claude-opus-4-8[1m] | standard |
| pdt-qa | T-PATCH-099-verify-4c | 2026-06-10 | 2026-06-10 | claude-opus-4-8[1m] | standard |

### §4.c verify (pdt-qa · code inspection — 2nd pass)

§4.c re-verified against `TicketDetailTab.tsx` (central build GREEN, given).
`buildPipeline` + 5-node mapping confirmed:

- 5-node lane — `PIPELINE_ORDER = [po(0), designer(1), developer(2), qa(3),
  user(4)]` (~134–140); `USER_IDX=4`, `QA_IDX=3`, `DEVELOPER_IDX=2`.
- `buildPipeline(status, assignee, qaStatus, qaLoops, t)` evaluates status before
  assignee (~165–185). Mapping table verified:
  - `review` → `reviewQa` sets `currentIdx=QA_IDX(3)` → qa=current, developer(2)=done,
    user(4)=upcoming. ✓
  - `user-verify` → `userVerify` sets `currentIdx=USER_IDX(4)` → qa(3)=done,
    user(4)=current. ✓ (matches "qa done · user current".)
  - `done` → `currentIdx=PIPELINE_ORDER.length(5)` → all 5 nodes done. ✓
- User node neutral hue (not persona) — `PipelineNodeView` `isUser` branch (~566–587)
  renders lucide `UserCheck` (current/done) / `User` (upcoming/abandoned), color from
  `--text-emphasis`(current)/`--text-secondary`(done)/`--border-default`(upcoming)/
  `--text-disabled`(abandoned). Explicit comment: persona hue not reused. current
  marker carries `pdt-persona-blink`.
- qaMeta folded into qa node only (`id==='qa'` && stage current/done/blocked &&
  `qaStatus!=='n/a'`, ~204) — persists in user-verify since qa=done.

dead code clean — no `buildRail`/`PersonaCard`/`railGrid`/`PersonaRail`/`railActive`/
`railIdle` in `packages/gui/src` (grep clean). `stageDone`/`stageCurrent`/
`stageUpcoming`/`stageBlocked`/`qaMeta` present with en/ko parity (:177–181).
Result: §4.c = PASS (code). User-facing visual → status `user-verify`; eyeball steps
in the §4.c QA section above (+ §8 smoke list).

### QA verification (pdt-qa · code inspection)

All §2 acceptance verified against `TicketDetailTab.tsx` + locales; centralized build GREEN. VISUAL ticket → `user-verify`.

- AC dash-rail removed PASS — no `buildRail`/`PersonaCard`/`railGrid`/`PersonaRail` anywhere in `packages/gui/src` (grep clean). "PO des dev qa 모두 —" cannot render.
- AC 3-element layout PASS — section = `PipelineLane` (single horizontal lane) + qa micro-meta folded into qa node + single `nextActionRow`. No standalone meta/assignee/qa_status rows.
- AC assignee once PASS — assignee read only via lane current node; no `assignee` key-value duplicate. `dpMeta`/`dpKey`/`dpVal` gone.
- AC pipeline position PASS — `buildPipeline()` derives done/current/upcoming over fixed `['po','designer','developer','qa']`; node view styles distinguish all three (filled vs ring vs outline + connector solid/dashed).
- AC qa meta in qa node PASS — `qaMeta` attached only when `id==='qa'` and stage current/done/blocked and `qaStatus !== 'n/a'`; rendered in qa node's state slot (`qaMicro`).
- AC next-action one line PASS — `nextActionRow` `space-between`; left = ArrowRight + Next + derived text, right = `status: <status>` pill. Parenthesized `(status: …)` removed.
- AC session signal separated PASS — no `persona_sessions`/`current_task`/`poState` runtime selectors consumed; pipeline derived purely from frontmatter. No `idle · 세션 live`.
- AC design tokens PASS — `PERSONA_COLORS` map to persona hues; dot 8px `--radius-full`; ring via `box-shadow` color-mix 40%; lucide `ArrowRight`/`Activity`/`Info` stroke 2; no color emoji.
- AC motion PASS — current dot uses `pdt-persona-blink` only (allow-listed); reduced-motion handled by the global blink class CSS.
- AC read-only PASS — `derivedReadOnly` marker present; no action buttons in section.
- AC i18n PASS — reuses `nextLabel`/`derivedReadOnly`/`dispatchProgress`; new `stageDone`/`stageCurrent`/`stageUpcoming`/`stageBlocked`/`qaMeta` present in ko+en with parity. `railActive`/`railIdle` removed. Protected literals preserved: `PIPELINE_ORDER` labels hardcoded `PO`/`designer`/`developer`/`qa`; status pill renders raw `status: <status>`; ko `qaMeta` keeps `qa_status`/`loops` in English.
- AC status→stage mapping PASS — `buildPipeline` evaluates status before assignee: `done`→all done (currentIdx beyond qa), `review`/`user-verify`→`qaCurrent` forces currentIdx=QA_IDX (developer reads done), `blocked`→current node blocked variant, `abandoned`→ghost (upcoming style, no blink), else assignee idx, in-progress w/o assignee → developer fallback, todo/unassigned → po.
- AC tsc PASS — centralized tsc 0 errors; dead code removed.

**User-verify eyeball:** Open a ticket detail tab. (1) For a `status: review` ticket, confirm the lane shows po·designer·developer as done (filled persona dots, solid connectors) and **qa** as current (blink dot + ring, "작업 중" label) — developer is NOT current. (2) Confirm only one progress lane appears — no 4-column dash grid, no "PO des dev qa 모두 —". (3) For an `in-progress` ticket assigned `pdt-developer`, confirm developer is current and qa is upcoming (outline dot, dashed connector). (4) For a `done` ticket, all four dots filled, no blink, next-action says no further action. (5) qa node shows `qa_status · loops N` micro-line only when qa is current/done and status is not n/a. (6) next-action row: left arrow+text, right neutral `STATUS: …` pill. (7) Toggle ko/en — labels resolve, no raw `key.path` leaks; `PO`/`designer`/`developer`/`qa` stay English. (8) With `prefers-reduced-motion: reduce`, current dot stops blinking.

impl: `TicketDetailTab.tsx` 의 dash-rail(`buildRail`/`PersonaCard`/`railGrid`) + `dpMeta`
(assignee/qa_status/status key-value) 제거. `buildPipeline(status, assignee, qaStatus, qaLoops, t)`
+ `PipelineLane`/`PipelineNodeView` 신설 — frontmatter 파생 po→designer→developer→qa 단일
레인, done/current/upcoming. current dot `pdt-persona-blink`, 6px `--radius-full`, persona색
`--persona-*` 일치. qa_status·loops 는 qa 노드(current/done)에 micro-라벨로 흡수, `n/a` 생략.
next-action 의 `(status: …)` 를 우측 정렬 `naTag` 로 이동. i18n: `railActive`/`railIdle` 제거,
`stageDone`/`stageCurrent`/`stageUpcoming`/`qaMeta` 추가(ko/en parity). 미사용된 `poState`
selector 제거. scoped `tsc --noEmit` green.

qa-fix (§4.b): `buildPipeline` 의 current 산정을 status 우선 분기로 보정 — `review`/`user-verify`
는 assignee 와 무관하게 qa(idx3) current, developer 는 done(기존 버그: developer=current).
`done`=전 노드 done, `blocked`=current 노드 blocked 변형, `abandoned`=전 노드 ghost(blink 없음).
시각 refine: current underline 2px → dot ring(`box-shadow` color-mix 40%), state 라벨은
current/blocked 만 노출(done·upcoming 생략, dot `aria-label` 에 stage 보존), connector dot
수직중심 정렬, dot 6px → **8px**. qa micro-meta 는 qa 노드 state 슬롯에 흡수. next-action
row `space-between`(좌: ArrowRight+Next+파생텍스트 / 우: neutral status pill). i18n
`stageBlocked` 추가(ko `차단됨`/en `blocked`, ko/en parity). scoped `tsc --noEmit` green.

qa-fix2 (§4.c, §4.b 매핑 대체): 파이프라인에 **5번째 `user` 노드** 추가 —
`PIPELINE_ORDER` `[po(0)→designer(1)→developer(2)→qa(3)→user(4)]`, `USER_IDX=4`,
`PipelineNode.id` union 에 `'user'` 추가. `buildPipeline` 의 단일 `qaCurrent` 플래그를
`reviewQa`(→`QA_IDX`) / `userVerify`(→`USER_IDX`) 두 분기로 분해 — `review`=qa current·
developer done·user upcoming, **`user-verify`=qa DONE·user CURRENT**(유저 피드백 충족),
`done`=5 노드 전부 done. `PipelineNodeView` 에 `isUser` 분기 — persona dot 대신 lucide
`UserCheck`(current/done)/`User`(upcoming) 아이콘(14, stroke 2), persona hue 미사용·중립
accent(`--text-emphasis` current / `--text-secondary` done / `--border-default` upcoming,
`--text-disabled` ghost). current 아이콘 `pdt-persona-blink`, `aria-label` `user current` 등.
`laneIcon` style 신설(dot 행 정렬). i18n 신규 키 없음(stageCurrent 재사용), `user` literal
영문 보존. scoped `tsc --noEmit` green(TicketDetailTab clean; ChatPanel 오류는 병렬 작업분).

### §4.c QA-feedback: user-verify stage — 5번째 USER 노드 추가 + 매핑 재보정 (정본, §4.b 대체)

> QA(유저) 피드백 — `status: user-verify`(qa 통과, 유저 최종 확인 단계) 티켓을 열면
> 레인이 **4 노드(PO/designer/developer/qa)만** 그려지고 **qa 가 current(`작업 중`)** 로
> 표시된다. 유저: *"qa done이고 user 작업중 이렇게 나와야하는거아니야?"*
> → user-verify 는 "QA 는 끝났고 **유저가 검수 중**"인 단계다. 현재 §4.b 의
> `qaCurrent`(review·user-verify 둘 다 qa=current)는 review 에는 맞지만 user-verify 에는
> 틀렸다. 본 절은 (1) 파이프라인에 **5번째 USER 노드**를 추가하고 (2) user-verify 의 current 를
> qa → **user** 로 옮겨 매핑을 재보정한다. 본 절이 §4.b 의 status→stage 매핑을 대체한다.

#### 1) 5-노드 레인 — PO → designer → developer → qa → user

기존 `PIPELINE_ORDER` 4단계 끝에 **5번째 노드 `user`** 를 고정 추가. 노드 순서/인덱스:

```
[ po(0) → designer(1) → developer(2) → qa(3) → user(4) ]
```

- `user` 노드 = **인간 리뷰어(최종 확인)** 단계. persona dot 4개와 **구분되는 별도 처리**
  (persona 색 dot 가 아니라 lucide 아이콘 노드). 4 persona 는 "에이전트가 작업하는 단계",
  user 는 "사람이 확인하는 단계"라는 의미 차이를 시각으로 분리한다.
- `PIPELINE_ORDER` 에 `{ id: 'user', label: 'user' }` 추가. `id` union 에 `'user'` 추가
  (`PipelineNode.id`, `PERSONA_COLORS` 키 등 타입 동기화). 단 `user` 는 `PERSONA_COLORS`
  대신 별도 accent(아래 2번) 사용.
- `USER_IDX = 4`, `QA_IDX` 는 그대로 3, `DEVELOPER_IDX = 2` 유지.
- connector 는 노드 5개 사이 4구간 (qa→user 구간 포함). 렌더 로직(`isLast`, `connectorDone`)은
  그대로 — 단지 마지막 노드가 user 로 바뀐다.

#### 2) USER 노드 시각 처리 (persona dot 과 구분)

| 요소 | user 노드 처리 |
|---|---|
| 노드 마커 | dot(원) 대신 **lucide 아이콘** — `UserCheck` (current/done 시) / `User` (upcoming 시). `--icon-sm`(14) stroke 2. persona dot(8px 채움원)과 형태부터 구분. |
| 강조색(accent) | persona 색 union 밖. user accent = `--accent`(프로젝트 accent, fallback `#8B5CF6` 계열과 충돌 피해 **`--text-emphasis` 톤의 중립 강조** 또는 design-system `--accent` 토큰). persona hue(`--persona-*`)는 **쓰지 않는다** — user 는 persona 가 아니므로. |
| current | `UserCheck` 아이콘, color=`--accent`, `pdt-persona-blink`(허용 목록 §9), 아이콘 뒤 ring 대신 아이콘 자체 강조(아이콘은 dot 가 아니라 ring box-shadow 부적합 → color + blink 로 강조). 이름 `user` semibold `--text-emphasis`. state 라벨 `진행 중`(stageCurrent 재사용). |
| done | `UserCheck` 아이콘, color=`--text-secondary`(persona done 과 동일 위계의 "조용한 완료"). 이름 `--text-secondary` medium. 라벨 생략. |
| upcoming | `User` 아이콘, color=`--border-default`(outline persona dot 과 같은 위계). 이름 `--text-faint` regular. 라벨 생략. |
| connector(들어오는, qa→user) | qa 가 done 일 때 solid — 단 user 는 persona 색이 없으므로 **qa→user 들어오는 connector 는 qa 노드 색**(qa done 색) 규칙을 따른다(connector 는 "떠나는 노드"의 stage 로 색 결정 = 기존 로직 그대로). |

> 핵심: user 노드는 "dot"이 아니라 "아이콘"이라 4 persona dot 와 한눈에 구분된다. blink/강조
> 신호 체계(current 1곳 수렴)는 동일하게 유지하되 색은 persona hue 가 아닌 중립 accent.
> `aria-label`: `user current` / `user done` / `user upcoming` (dot 의 aria 규칙과 동일).

#### 3) status → stage 매핑 (재보정 · 정본, §4.b 표 대체)

노드 순서 고정 `[po(0), designer(1), developer(2), qa(3), user(4)]`. **user 노드는 qa 가
done 되기 전까지 항상 upcoming.**

| status | current 노드 | done | upcoming | 비고 |
|---|---|---|---|---|
| `todo` | po (0) | — | designer·developer·qa·user | assignee 명시 시 그 persona 단계가 current(단, qa/user 검수 단계는 review 이후만) |
| `in-progress` | assignee persona 단계 | < current | > current (qa·user 포함) | assignee 미정 → developer fallback. user 는 항상 upcoming |
| `review` | **qa** (3) | po·designer·developer | **user** | review = under QA → qa current. **developer done**(기존 §4.b 유지). user 는 아직 upcoming |
| `user-verify` | **user** (4) | po·designer·developer·**qa** | — | **본 절 수정 핵심**: qa DONE, user CURRENT. 유저 피드백 충족("qa done이고 user 작업중") |
| `done` | — (current 없음) | po·designer·developer·qa·**user** | — | **5 노드 전부 done**(user 포함). 강조 없음 |
| `blocked` | assignee persona 단계 | < current | > current | current 노드 blocked 변형(§4.b #2 그대로). user 는 upcoming |
| `abandoned` | — | — | — | 5 노드 전부 ghost(`--text-disabled`), blink 없음. user 노드도 `User` 아이콘 ghost |

> 핵심 변경(§4.b 대비):
> - **user 노드 신설** → 매핑 표의 모든 행에 user 열이 추가됨(qa done 전까지 upcoming).
> - **`qaCurrent` 분기 분해**: 기존 `review || user-verify → qa current` 를 둘로 쪼갠다.
>   - `review` → **qa current** (developer done, user upcoming) — 변동 없음.
>   - `user-verify` → **user current** (developer·qa done) — **신규**. current = `USER_IDX`(4).
> - `done` → `currentIdx = PIPELINE_ORDER.length`(=5) 라 5 노드 모두 done — 자동으로 user 포함.

#### 4) `buildPipeline` 분기 보정 (§4.b #7 대체)

`buildPipeline(status, assignee, qaStatus, qaLoops, t)` 내부 current 산정:

```
allDone   = status === 'done'        → currentIdx = PIPELINE_ORDER.length (=5, 전부 done)
abandoned = status === 'abandoned'   → 전 노드 ghost
blocked   = status === 'blocked'
reviewQa  = status === 'review'      → currentIdx = QA_IDX (3)        // qa current, dev done, user upcoming
userVerify= status === 'user-verify' → currentIdx = USER_IDX (4)     // ★ user current, qa done
else assigneeIdx >= 0                → currentIdx = assigneeIdx
else status === 'in-progress'        → currentIdx = DEVELOPER_IDX (2)
else                                 → currentIdx = 0 (po)
```

- 기존 단일 `qaCurrent` 플래그를 **`reviewQa`(→QA_IDX) / `userVerify`(→USER_IDX) 두 분기**로 분해.
  분기 평가 순서는 그대로 status 우선(assignee 보다 먼저).
- `done`/`current`/`upcoming` 산정 루프(`idx < currentIdx` 등)는 변경 없음 — user 노드가
  배열 끝에 추가되었으므로 `user-verify` 일 때 qa(idx3 < 4)=done, user(idx4 === 4)=current 가
  자연히 도출된다.
- qaMeta(`qa_status · loops N`)는 여전히 **qa 노드**(`id === 'qa'`) 한정. user-verify 에서
  qa 가 done 이 되므로 `stage === 'done'` 조건으로 계속 노출된다(기존 조건 그대로 유효).

#### 5) USER 노드 렌더 — `PipelineNodeView` 분기

`PipelineNodeView` 에 `isUser = node.id === 'user'` 분기를 추가:

- `isUser` 면 dot(`<span style={dotStyle}/>`) 대신 **lucide 아이콘** 렌더:
  - current/done → `<UserCheck size={14} strokeWidth={2} />`, upcoming → `<User size={14} strokeWidth={2} />`.
  - color = 2번 표 대로(current=`--accent`, done=`--text-secondary`, upcoming=`--border-default`, abandoned=`--text-disabled`).
  - current(`isCurrent && !abandoned`)일 때 아이콘 wrapper 에 `className="pdt-persona-blink"`(ring box-shadow 는 아이콘에 부적합 → blink + accent color 로 강조).
- 이름/state 라벨/qaMeta 스택은 persona 노드와 동일 구조. user 는 qaMeta 없음.
- `import { User, UserCheck } from 'lucide-react'` 추가.
- `aria-label` 은 dot/아이콘 공통: `` `${label} ${ariaState}` `` → `user current` 등.

#### 6) i18n / 토큰

- 신규 키 없음 — `stageCurrent`(`진행 중`)·`stageDone`·`stageUpcoming` 재사용. user 노드 라벨
  literal `user`(보호어, 영문 보존 — `PO`/`designer`/`developer`/`qa` 와 동일 정책 §10).
- next-action: `deriveNextAction` 의 `user-verify` 케이스(`statusUserVerify`)는 그대로 — 이미
  "유저 확인 대기"류 텍스트. 변경 불필요.
- 토큰: user accent = `--accent`(design-system), persona hue 미사용. 아이콘 lucide stroke 2,
  컬러 emoji 금지. blink 는 §9 허용 목록 `persona-blink` 만, `prefers-reduced-motion` 정합.

#### 7) ASCII mockup (user-verify 상태 — 수정 후)

```
┌─ Dispatch Progress                                  ⓘ Derived · read-only ─┐
│                                                                            │
│      ●━━━━━━●━━━━━━●━━━━━━●━━━━━━⛉                                          │  ← qa=done(●), user=current(아이콘)
│      PO     designer developer qa     user                                 │  ← user=semibold
│                                       진행 중                               │  ← state 라벨 = user 노드만
│                                smoke · loops 1                             │  ← qa micro-meta (qa=done 이라 유지)
│                                                                            │
│   → Next  유저 확인 대기                          [ STATUS: USER-VERIFY ]   │
└──────────────────────────────────────────────────────────────────────────┘

범례:
  ●  persona done    = persona색 8px filled dot, solid connector
  ⛉  user current    = lucide UserCheck 아이콘 + accent + blink (dot 아님)
  비교) review 상태 → qa=current(◉ blink), user=upcoming(User 아이콘 outline)
```

#### 8) QA 추가 스모크 (§5 보강)

- [x] `status: user-verify` 티켓: 레인이 **5 노드**(po·designer·developer·qa·user) 렌더,
      po~developer·**qa=done**(filled·solid), **user=current**(UserCheck 아이콘+blink+accent),
      qa 노드 하단 `qa_status · loops N` 유지. (유저 피드백 회귀 핵심.)
- [x] `status: review` 티켓: qa=current(blink dot), **user=upcoming**(User 아이콘 outline,
      faint). developer=done.
- [x] `status: done` 티켓: **5 노드 전부 done**(user 포함, UserCheck done 색), blink 없음.
- [x] user 노드가 4 persona dot 와 **시각 구분**됨(dot 가 아닌 lucide 아이콘).
- [x] ko/en 라벨 정상, `user` literal 영문 보존, raw `key.path` 누수 없음.
- [x] `prefers-reduced-motion: reduce` 에서 user current 아이콘 blink 정지.
