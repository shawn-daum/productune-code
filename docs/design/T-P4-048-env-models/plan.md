---
doc: design-plan
slug: settings-env-models
owner: pdt-designer
status: draft
parent_ticket: T-P4-048
sub_scope: Environment + Models sub-sections only
date: 2026-05-14
round: r4
prior_dispatch: T-P4-048-mcp-hooks/plan.md (MCP + Hooks — 별도 land)
deps_landed:
  - T-P4-046  # env-view TabType 존재 (PlaceholderTab 상태), openTab API 확립
  - T-P4-099  # Settings sidebar = nav-only; openTab 패턴 확립
  - T-P4-107  # model/effort defaults 표 (Models sub-section 정합 근거)
  - T-P4-048-mh  # MCP + Hooks sub-tab 추가 (Settings sub-tab list baseline)
related_docs:
  - docs/design/design-system.md
  - docs/design/T-P4-048-mcp-hooks/plan.md
  - docs/tickets/phase4/T-P4-048.md
  - docs/tickets/phase4/ROADMAP.md §Round 3
  - docs/design/T-P4-107/plan.md §2(a)
out_of_scope:
  - MCP Servers sub-section (T-P4-048-mcp-hooks/plan.md 에서 완료)
  - Hooks sub-section (동상)
  - Language sub-section (T-P4-056 / T-P4-096 에서 완료)
  - Workflow rules sub-section (T-P4-099 에서 완료)
  - T-P4-030~035 env panel backend IPC 구현 (별 Round 3 dispatch)
  - Vercel env push (T-P4-034 별 dispatch)
  - 코드 스캔 누락 경고 (T-P4-035 별 dispatch)
---

# T-P4-048 설계 플랜 — Environment + Models sub-sections

> **Dispatch 범위 한정**: Settings 탭 Environment + Models 2 sub-section 만.
> NO ticket emit. NO ROADMAP. NO code.
>
> **Chunking 근거**: T-P4-104 plan §4 — plan.md 는 1 artifact = 1 dispatch. 6 sub-section
> 동시 scope → 이전 dispatch 에서 stream idle timeout 발생 (prior_fail). 본 dispatch
> = 2 sub-section plan-only (1 artifact). MCP + Hooks 는 T-P4-048-mcp-hooks 에서 별도 land.

---

## §1 Background

### 1.1 T-P4-048 전체 구조와 이 dispatch 의 위치

T-P4-048 = Settings 탭 전체 구현 (6 섹션: Environment / Models / MCP Servers / Hooks /
Language / Workflow rules). 이 중:

| 섹션 | plan dispatch | status |
|---|---|---|
| Workflow rules | T-P4-099 plan §2(c) | ✅ landed |
| Language | T-P4-096 + T-P4-056 | ✅ landed |
| MCP Servers + Hooks | T-P4-048-mcp-hooks/plan.md | ✅ dispatched |
| **Environment** | **본 plan** | — |
| **Models** | **본 plan** | — |

### 1.2 T-P4-048 Acceptance — Environment + Models 관련 원문

```
### Environment 섹션
- pp-sec-hdr "환경 변수"
- Project .env (N vars) → openTab(tabId, 'env-view', { layer: 'project' })
- Project secrets (N vars) → openTab(tabId, 'env-view', { layer: 'secrets' })
- User global (N vars) → openTab(tabId, 'env-view', { layer: 'global' })
- 각 항목 우측 var count 표시

### Models 섹션
- pp-sec-hdr "모델"
- Catalog → 모델 카탈로그 viewer (opus / sonnet / haiku effort matrix)
  — openTab(tabId, 'markdown', { path: '~/.productune/models.md' })
```

### 1.3 T-P4-046 env-view 현황 (PlaceholderTab)

T-P4-046 tab dispatcher §3:

> `env-view` → PlaceholderTab.tsx ("T-P4-04X 에서 채워짐" message)

TabType `'env-view'` 는 이미 등록되어 있음. 본 plan = (1) Settings sidebar 에서
env-view 로 진입하는 3 nav row 정의, (2) PlaceholderTab → 설계된 stub 컴포넌트로 교체.
T-P4-030~033 = 해당 stub 을 real data 로 wire 하는 backend 담당.

### 1.4 T-P4-030~033 — Round 3 env 관리 panel 과의 역할 분리

| Ticket | 역할 | 이 plan 과 관계 |
|---|---|---|
| T-P4-030 | 3-layer env selector 컴포넌트 (로컬 / 미리보기 / 프로덕션) | env-view tab 안 layer selector; 본 plan이 레이아웃 spec, T-P4-030이 구현 |
| T-P4-031 | variable table + status badge (✅/⚠️/🔴/🔒) + secret masking | 본 plan이 table UI 설계, T-P4-031이 data wire + badge 로직 |
| T-P4-032 | 변수 추가/수정/삭제 + 적용 환경 선택 | 본 plan이 CRUD UI 패턴 정의, T-P4-032가 파일 I/O 구현 |
| T-P4-033 | `.env.local` read/write 백엔드 | T-P4-031~032의 IPC 타겟 (본 plan 범위 외) |
| T-P4-034 | Vercel env push | 본 plan 범위 외 |
| T-P4-035 | 코드 스캔 누락 경고 | 삭제 confirmation 화면에서 참조; 본 plan 범위 외 |

**요약**: 본 plan = **UI shell 설계** (레이아웃 spec + 컴포넌트 구조). 데이터 read/write =
T-P4-030~033. T-P4-030+ 입장에서는 본 plan이 설계 SoT.

### 1.5 T-P4-107 — Models sub-section 정합 근거

T-P4-107 §2(a) 에서 persona model/effort defaults 표 확정:

| Persona | Model | Effort |
|---|---|---|
| PO | opus | xhigh |
| Designer (plan) | sonnet | high |
| Developer (impl) | sonnet | high |
| QA | haiku | low |

Models sub-section = 이 표 + 사용자가 이해할 수 있는 모델 설명 (tier / 용도) +
`defaultModel` 선택 (→ `~/.productune/settings.json`).

---

## §2 Decisions

### §2(A) Environment sub-section

#### 2(A).1 Settings sidebar 구조

T-P4-048 Acceptance 에 명시된 3 nav row + count badge 구조를 그대로 따름.
`pp-sec-hdr` = 클릭 불가 section label (T-P4-024 WorkflowRulesPanel 의 sec-hdr 동일).

```
환경 변수  ← pp-sec-hdr (divider 포함)
  › 프로젝트 .env              (N)    → env-view tab, layer:'project'
  › 프로젝트 시크릿            (N)    → env-view tab, layer:'secrets'
  › 사용자 전역                (N)    → env-view tab, layer:'global'
```

Count badge spec:
- IPC `env:getCount({ layer, projectDir })` → `number | null`
- count > 0 → `(N)` 표시 (`--text-muted`, 12px)
- count == 0 → `(0)` 도 표시 (사용자가 empty 임을 확인 가능)
- null (파일 없음 / 읽기 실패) → badge 없음 (`—` 는 과도한 노이즈)

각 nav row click:
```ts
openTab('env-view-project', 'env-view', { layer: 'project' }, '프로젝트 .env')
openTab('env-view-secrets', 'env-view', { layer: 'secrets' }, '프로젝트 시크릿')
openTab('env-view-global',  'env-view', { layer: 'global'  }, '사용자 전역')
```

Tab ID 는 layer 별 고유 → 3 탭이 동시에 열릴 수 있음 (독립 singleton 아님 — tab을
열어두고 옆 layer 도 비교 가능). 재클릭 = focus (기존 openTab 동작 그대로).

#### 2(A).2 Data source (IPC 타겟)

| layer | 파일 경로 | 비고 |
|---|---|---|
| `project` | `<project>/.env` | 비민감 변수, 커밋 대상 |
| `secrets` | `<project>/.env.local` | 민감 변수, `.gitignore` 등록 (T-P4-033 자동 등록) |
| `global` | `~/.productune/productune.env` | 사용자 전역 기본값 |

`env:getCount()` IPC — 해당 파일의 `KEY=VALUE` 패턴 라인 수 (comment `#`, 빈 라인 제외).

#### 2(A).3 env-view 탭 레이아웃 (UI shell spec)

T-P4-030~033 이 실제 데이터를 wire 하기 위한 컴포넌트 구조 명세.

**최상위 구조**:
```
EnvViewTab
  ├── LayerHeader (layer 라벨 + 파일 경로 + badge 색)
  ├── VariableTable
  │     ├── TableHeader (이름 / 값 / 환경 / 상태)
  │     ├── VariableRow × N
  │     │     ├── NameCell (이름, monospace)
  │     │     ├── ValueCell (masked ████ + show/hide eye toggle)
  │     │     ├── EnvCell (로컬만 / 전체)
  │     │     ├── StatusBadge (✅/⚠️/🔴/🔒 → token 매핑 §2(A).4)
  │     │     └── RowActions (kebab ⋯ → 수정 / 삭제)
  │     └── EmptyRow (파일 없음 / 변수 0개)
  ├── AddVariableForm (collapsed — [+ 변수 추가] 클릭 시 inline expand)
  └── StubNotice (T-P4-030+ land 전 안내 배너)
```

**stub 상태 (T-P4-030+ land 전)**:
- `VariableRow` = placeholder rows (3 개, 이름/값 모두 ████ skeleton)
- `StubNotice` = `--health-info` 배너 "환경 변수 기능은 Round 3에서 완성돼요. 지금은 파일
  경로를 직접 열어주세요." + CTA [파일 열기] → `openTab('markdown:env-project', 'markdown',
  { path: '<project>/.env' })` (fallback — 텍스트 에디터처럼 raw 편집)
- `AddVariableForm` + `RowActions` = disabled (stub 상태임 명시)

T-P4-031 land 후 skeleton → real data 교체. T-P4-032 land 후 CRUD 활성화. Stub notice =
T-P4-032 complete 시 제거.

#### 2(A).4 Status badge 토큰 매핑

T-P4-031 ROADMAP 에 emoji 표기 (✅/⚠️/🔴/🔒) → DS token 으로 매핑:

| badge | 조건 | 색 token | 라벨 (ko) | 라벨 (en) |
|---|---|---|---|---|
| ✅ | 전체 layer 동기 | `--health-success` | `동기됨` | `Synced` |
| ⚠️ | 로컬 있음, prod 없음 | `--health-warn` | `프로덕션 없음` | `Missing in prod` |
| 🔴 | prod 있음, 로컬 없음 | `--health-error` | `로컬 없음` | `Missing locally` |
| 🔒 | secret (masked) | neutral `--border-muted` | `시크릿` | `Secret` |

icon = lucide `check-circle-2` / `alert-triangle` / `x-circle` / `lock` (14px).
T-P4-031 이 badge 로직 구현; 본 spec 이 visual SoT.

#### 2(A).5 추가/수정/삭제 UI 패턴

T-P4-032 구현 범위이나, UI 패턴 SoT 는 본 plan:

**추가** ([+ 변수 추가] → inline form expand, table 하단):
```
┌──────────────────────────────────────────────────────────────┐
│  이름          [              ]      (placeholder: API_KEY)  │
│  값            [              ]      [👁]  (show/hide)       │
│  적용 환경     [로컬만 ▾]                                     │
│                                  [저장]  [취소]              │
└──────────────────────────────────────────────────────────────┘
```

**수정** (row kebab ⋯ → "수정" → 동일 row inline expand):
- row가 form으로 전환. 기존 값 pre-fill. 저장 = IPC `env:upsert(...)`.

**삭제** (row kebab ⋯ → "삭제" → confirmation modal):
```
┌─ 변수 삭제 ──────────────────────────────────────────┐
│  DATABASE_URL 를 삭제할까요?                         │
│                                                      │
│  이 변수를 사용 중인 위치:                           │  ← T-P4-035 land 전 = "확인 중..."
│  • src/lib/db.ts                                     │  ← T-P4-035 land 후 = 실제 경로
│                                                      │
│  [취소]           [삭제]                             │  ← destructive = right-primary
└──────────────────────────────────────────────────────┘
```

§1.5.3 Predictability — [취소] 좌 / [삭제] 우 (modal footer 일관). T-P4-035 land 전
"확인 중..." skeleton = §1.5.4 Feedback (pending ≠ empty).

**Secret masking (T-P4-031)**:
- 값 = `••••••••` (8 dots, 실제 길이 노출 X)
- eye 아이콘 클릭 → reveal, 5초 후 자동 재마스킹 (`setTimeout(reHide, 5000)`)
- clipboard copy 버튼 → reveal 없이 직접 복사 (값이 clipboard에만 감) → toast "복사됐어요"

---

### §2(B) Models sub-section

#### 2(B).1 탭 타입 결정 — markdown vs custom component

T-P4-048 ticket acceptance: `openTab(tabId, 'markdown', { path: '~/.productune/models.md' })`

**Deviation 이유**: 이 plan 은 `markdown` 대신 **`models-catalog`** 신규 TabType 을
채택. 근거:

| 항목 | markdown | models-catalog (채택) |
|---|---|---|
| default model select | ❌ read-only | ✅ radio / select 가능 |
| 내용 갱신 | .md 파일 수동 관리 | 컴포넌트 내 static catalog + IPC settings |
| §1.5.2 Familiar | VSCode settings.json 에디터와 유사 (OK) | 동일 Settings 화면 내 interactive (더 자연) |
| DS 정합 | T-P4-057 linter 통과 여부 불확실 (routing.md 내용) | 컴포넌트가 DS token 사용 ✅ |

`~/.productune/models.md` 파일 자체는 T-P4-106 `bootstrapUserGlobalDoctrine()` 이
seed 할 수 있으나, GUI 탭은 custom component 로 함.

ticket 원문과의 차이는 §8 Out of scope 에 명시 stamp.

#### 2(B).2 Settings sidebar 구조

```
모델  ← pp-sec-hdr (divider 포함)
  › 카탈로그                         → models-catalog tab
```

nav row 1 개. click:
```ts
openTab('models-catalog', 'models-catalog', undefined, '모델 카탈로그')
```

Singleton. 재클릭 = focus.

#### 2(B).3 ModelsCatalogTab 레이아웃

```
ModelsCatalogTab
  ├── DefaultModelSection (기본 모델 selector — IPC r/w settings.json)
  ├── Divider
  ├── CatalogTable (read-only — claude/codex/openai 모델 rows)
  ├── Divider
  └── PersonaDefaultsSection (read-only — T-P4-107 §2(a) 표)
```

**DefaultModelSection** (`settings.json` `defaultModel` key):

| 모델 | tier 라벨 | 용도 설명 |
|---|---|---|
| `claude-haiku-4` | 속도 우선 | 빠른 확인 작업 |
| `claude-sonnet-4` | 균형 (기본) | 대부분의 작업 |
| `claude-opus-4` | 정확도 우선 | 복잡한 계획·분석 |

radio group. 선택 즉시 IPC `settings:set('defaultModel', model)` → toast "기본 모델이
변경됐어요" (`--health-success`). §1.5.4 Feedback ✅.

기본값 = `claude-sonnet-4` (`settings.json` key 없을 때 fallback).

**CatalogTable** (read-only):

| 이름 | 제공사 | Tier | 노트 |
|---|---|---|---|
| claude-haiku-4 | Anthropic | haiku | 빠른 문서/검증 작업 |
| claude-sonnet-4 | Anthropic | sonnet | 일반 계획·설계·구현 |
| claude-opus-4 | Anthropic | opus | 복잡 추론·시스템 설계 |

외부 모델 (codex, openai) 확장 여부 = OQ-1 (§7).

**PersonaDefaultsSection** (read-only — T-P4-107 §2(a) 표 미러):

| 페르소나 | 기본 모델 | 기본 effort | 비고 |
|---|---|---|---|
| PO | claude-opus-4 | xhigh | 계획·조율 |
| Designer | claude-sonnet-4 | high | 설계·문서 |
| Developer | claude-sonnet-4 | high | 구현 |
| QA | claude-haiku-4 | low | 검증 |

하단 안내: "페르소나별 기본값은 `routing.md` 에서 관리돼요. [routing.md 보기] →
`openTab('markdown:routing', 'markdown', { path: '~/.productune/sections/routing.md' })`"

---

### §2(C) Settings sidebar sub-tab 통합 결정

T-P4-048-mh 완료 후 SettingsView.tsx 의 `SettingsSubTab` type:
```ts
type SettingsSubTab = 'general' | 'workflow' | 'mcp' | 'hooks'
```

본 plan 이후:
```ts
type SettingsSubTab =
  | 'general' | 'workflow' | 'mcp' | 'hooks'
  | 'env-project' | 'env-secrets' | 'env-global'  // Environment 3 rows
  | 'models'                                       // Models 1 row
```

**전체 sub-tab 순서** (Settings sidebar top → bottom):

| # | 라벨 (ko) | SettingsSubTab | openTab type | 섹션 그룹 |
|---|---|---|---|---|
| 1 | 일반 | `general` | `general-settings` | General |
| 2 | 작업 흐름 규칙 | `workflow` | `workflow-settings` | General |
| 3 | MCP 서버 | `mcp` | `mcp-servers` | Tools |
| 4 | 훅 | `hooks` | `hooks` | Tools |
| — | (divider) | — | — | |
| — | 환경 변수 (sec-hdr) | — | — | Environment |
| 5 | 프로젝트 .env | `env-project` | `env-view` `{layer:'project'}` | Environment |
| 6 | 프로젝트 시크릿 | `env-secrets` | `env-view` `{layer:'secrets'}` | Environment |
| 7 | 사용자 전역 | `env-global` | `env-view` `{layer:'global'}` | Environment |
| — | (divider) | — | — | |
| — | 모델 (sec-hdr) | — | — | Models |
| 8 | 카탈로그 | `models` | `models-catalog` | Models |
| — | (외부 연결 placeholder) | — | — | T-P4-022 §16.3 별 PO task 대기 |

**Section header (pp-sec-hdr) 는 `SettingsSubTab` type 에 포함 X** — 라벨 표시 전용
(non-interactive). `SettingsView.tsx` 의 renderSectionHeader() 헬퍼 로 분리.

**Active highlight 규칙**:
- `setActiveTab(id)` → 해당 row `background: --surface-subpanel`
- openTab 후 main pane 에서 해당 tab 이 focus 되면 sidebar row 도 highlight 유지
- Environment 3 row 는 별도 tab ID 를 가지므로 각자 독립적으로 active 가능

---

### §2(D) Data source 결정

**Environment**:

| IPC | 호출처 | 반환 | 파일 |
|---|---|---|---|
| `env:getCount({ layer, projectDir })` | SettingsView mount + 파일 변경 watch | `number \| null` | §2(A).2 |
| `env:listVars({ layer, projectDir })` | EnvViewTab mount | `EnvVar[] \| null` | T-P4-031 구현 |
| `env:upsert({ layer, projectDir, key, value, envScope })` | AddVariableForm / EditInline save | `void` | T-P4-032 구현 |
| `env:delete({ layer, projectDir, key })` | DeleteConfirmModal confirm | `void` | T-P4-032 구현 |

`env:getCount()` = 본 plan 이 spec하고 T-P4-048-em 구현. 나머지 = T-P4-031~032.

**Models**:

Static catalog = 컴포넌트 내 hardcode (`CLAUDE_MODELS` constant). IPC 불필요.
Anthropic 모델 목록이 업데이트되면 컴포넌트 패치 (운용 비용 낮음, dynamic model fetch =
Phase 5 — OQ-1 §7).

| IPC | 용도 |
|---|---|
| `settings:get('defaultModel')` | ModelsCatalogTab mount 시 현재 값 read |
| `settings:set('defaultModel', model)` | radio 선택 즉시 write |

---

### §2(E) T-P4-030~033 와의 dispatch 순서

```
T-P4-048-em (본 plan → ticket)
  ↓  impl 완료 (UI shell + EnvViewStubTab + ModelsCatalogTab)
  ↓  Settings sidebar 에서 env-view + models-catalog 탭 열림 (stub + real)

T-P4-031 (variable table + badge)
  ↓  EnvViewStubTab → EnvViewTab (real data, IPC env:listVars)
  ↓  Stub notice + skeleton rows 제거

T-P4-032 (CRUD + IPC env:upsert / env:delete)
  ↓  AddVariableForm + RowActions 활성화
  ↓  StubNotice 최종 제거

T-P4-033 (.env.local read/write backend)
  ↓  secrets layer real data

T-P4-034 (Vercel env push)
  ↓  env-view tab 우상단 [Vercel에 push] CTA 활성화 (별 dispatch에서 spec)

T-P4-035 (코드 스캔)
  ↓  DeleteConfirmModal 의 "사용 중인 위치" skeleton → real AST 결과
```

**본 plan 의 impl ticket 수**: 1 (T-P4-048-em — NO ticket emit this dispatch).
T-P4-030~033 는 Round 3 별도 bundle. dispatch 독립.

---

## §3 ASCII Mockup

### 3.1 Settings sidebar — 전체 (본 plan 추가 후)

```
┌─ Settings sidebar 260px ──────────────────────────────────┐
│                                                           │
│  일반                                                     │  → general-settings (T-P4-099)
│  작업 흐름 규칙                                            │  → workflow-settings (T-P4-099)
│  MCP 서버                                                 │  → mcp-servers (T-P4-048-mh)
│  훅                                                       │  → hooks       (T-P4-048-mh)
│                                                           │
│  ─ 환경 변수 ─────────────────────────────────────────   │  ← pp-sec-hdr + divider
│    › 프로젝트 .env                             (3)        │  → env-view {layer:'project'}
│    › 프로젝트 시크릿                           (5)        │  → env-view {layer:'secrets'}
│    › 사용자 전역                               (2)        │  → env-view {layer:'global'}
│                                                           │
│  ─ 모델 ──────────────────────────────────────────────   │  ← pp-sec-hdr + divider
│    › 카탈로그                                             │  → models-catalog
│                                                           │
│       (이하 빈 공간 — 외부 연결 placeholder)              │  ← T-P4-022 §16.3 대기
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### 3.2 Main pane — env-view tab (stub 상태; T-P4-031+ 교체 전)

```
┌─ 프로젝트 .env ────────────────────────────────────────────────┐
│                                                                │
│  ⓘ 환경 변수 기능은 Round 3에서 완성돼요.                       │  ← StubNotice (--health-info)
│     지금은 파일을 직접 열 수 있어요.  [파일 열기]              │
│                                                                │
│  이름               값              환경         상태          │  ← TableHeader
│  ──────────────────────────────────────────────────────────   │
│  ████████████       ████████        ████████     ████         │  ← skeleton row 1
│  ████████████       ████████        ████████     ████         │  ← skeleton row 2
│  ████████████       ████████        ████████     ████         │  ← skeleton row 3
│                                                                │
│  [+ 변수 추가]                     ← disabled (stub 상태 표시) │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 3.3 Main pane — env-view tab (T-P4-031 + T-P4-032 land 후)

```
┌─ 프로젝트 .env ────────────────────────────────────────────────┐
│                                                                │
│  이름               값              환경         상태          │
│  ──────────────────────────────────────────────────────────   │
│  DATABASE_URL       ████████  [👁]  전체         ✅ 동기됨  ⋯ │
│  NEXT_PUBLIC_URL    https://… [👁]  전체         ⚠️ 프로덕션 없음  ⋯ │
│  API_KEY            ████████  [👁]  로컬만       🔒 시크릿  ⋯ │
│                                                                │
│  [+ 변수 추가]                                                 │
│                                                                │
│  ─── [+ 변수 추가 클릭 시 expand] ───────────────────────────  │
│  이름         [                 ]                              │
│  값           [                 ]  [👁]                       │
│  적용 환경   [로컬만 ▾]                                        │
│                             [저장]  [취소]                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 3.4 Main pane — models-catalog tab

```
┌─ 모델 카탈로그 ──────────────────────────────────────────────────┐
│                                                                  │
│  기본 모델                                                       │  ← DefaultModelSection
│  ──────────────────────────────────────────────────────────     │
│  ○  claude-haiku-4    속도 우선   빠른 확인 작업                 │
│  ●  claude-sonnet-4   균형       대부분의 작업             (기본) │  ← selected
│  ○  claude-opus-4     정확도     복잡한 계획·분석               │
│                                                                  │
│  ⓘ 기본 모델은 새 작업 시작 시 사용돼요. 페르소나가 재정의할 수 있어요. │
│                                                                  │
│  ───────────────────────────────────────────────────────────    │
│                                                                  │
│  모델 목록                                                       │  ← CatalogTable
│  이름                제공사      Tier       설명                  │
│  claude-haiku-4      Anthropic   haiku      빠른 문서/검증        │
│  claude-sonnet-4     Anthropic   sonnet     계획·설계·구현        │
│  claude-opus-4       Anthropic   opus       복잡 추론·설계        │
│                                                                  │
│  ───────────────────────────────────────────────────────────    │
│                                                                  │
│  페르소나별 기본 설정                                             │  ← PersonaDefaultsSection
│  페르소나    모델              effort      용도                   │
│  PO          claude-opus-4    xhigh       계획·조율              │
│  Designer    claude-sonnet-4  high        설계·문서              │
│  Developer   claude-sonnet-4  high        구현                   │
│  QA          claude-haiku-4   low         검증                   │
│                                                                  │
│  ⓘ 페르소나별 기본값은 routing.md 에서 관리돼요.  [routing.md 보기] │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## §4 Module Map

### 4.1 신규 파일

| 경로 | 역할 | 비고 |
|---|---|---|
| `packages/gui/src/components/workspace/main/panes/EnvViewTab.tsx` | env-view tab — LayerHeader + VariableTable (stub skeleton) + StubNotice + disabled AddVariableForm | T-P4-031+ 가 real data wire 로 교체 |
| `packages/gui/src/components/workspace/main/panes/ModelsCatalogTab.tsx` | 모델 카탈로그 — DefaultModelSection (radio) + CatalogTable + PersonaDefaultsSection | `settings:get/set` IPC |
| `packages/gui/electron/ipc/env-settings.ts` | `env:getCount({ layer, projectDir })` IPC handler — 파일 라인 카운트 | Electron main; `fs.readFile` 동기 parse |

### 4.2 수정 파일

| 경로 | 변경 내용 |
|---|---|
| `packages/gui/src/components/workspace/SettingsView.tsx` | `SettingsSubTab` type 에 `'env-project' \| 'env-secrets' \| 'env-global' \| 'models'` 추가. `renderSectionHeader()` 헬퍼 신규 (divider + label). Environment + Models section 추가. `env:getCount()` IPC 호출 → count badge state. |
| `packages/gui/src/store/workspace.ts` | `TabType` enum 에 `'models-catalog'` 추가 (`env-view` 는 T-P4-046 기존). `defaultTitle` switch 에 `models-catalog` case 추가. |
| `packages/gui/src/components/workspace/main/TabContent.tsx` | `case 'env-view'` → `<EnvViewTab props={tab.props} />` (PlaceholderTab 교체). `case 'models-catalog'` → `<ModelsCatalogTab />` 추가. |
| `packages/gui/electron/ipc/index.ts` | `env-settings.ts` IPC handler 등록. |
| `packages/gui/src/locales/en.json` + `ko.json` | §4.3 i18n key 추가. |

### 4.3 i18n key

| key | ko | en |
|---|---|---|
| `settings.sectionEnv` | `환경 변수` | `Environment` |
| `settings.envProject` | `프로젝트 .env` | `Project .env` |
| `settings.envSecrets` | `프로젝트 시크릿` | `Project Secrets` |
| `settings.envGlobal` | `사용자 전역` | `User Global` |
| `settings.sectionModels` | `모델` | `Models` |
| `settings.modelsCatalog` | `카탈로그` | `Catalog` |
| `envView.columnName` | `이름` | `Name` |
| `envView.columnValue` | `값` | `Value` |
| `envView.columnEnv` | `환경` | `Scope` |
| `envView.columnStatus` | `상태` | `Status` |
| `envView.addVariable` | `변수 추가` | `Add variable` |
| `envView.badgeSynced` | `동기됨` | `Synced` |
| `envView.badgeProdMissing` | `프로덕션 없음` | `Missing in prod` |
| `envView.badgeLocalMissing` | `로컬 없음` | `Missing locally` |
| `envView.badgeSecret` | `시크릿` | `Secret` |
| `envView.layerLocal` | `로컬만` | `Local only` |
| `envView.layerAll` | `전체` | `All envs` |
| `envView.stubNotice` | `환경 변수 기능은 Round 3에서 완성돼요. 지금은 파일을 직접 열 수 있어요.` | `Full env features coming in Round 3. You can open the file directly for now.` |
| `envView.stubOpenFile` | `파일 열기` | `Open file` |
| `models.title` | `모델 카탈로그` | `Model Catalog` |
| `models.defaultModelLabel` | `기본 모델` | `Default Model` |
| `models.defaultModelHint` | `기본 모델은 새 작업 시작 시 사용돼요. 페르소나가 재정의할 수 있어요.` | `Used when starting a new task. Personas may override this.` |
| `models.tierSpeed` | `속도 우선` | `Speed` |
| `models.tierBalance` | `균형` | `Balanced` |
| `models.tierAccuracy` | `정확도 우선` | `Accuracy` |
| `models.catalogTitle` | `모델 목록` | `Model List` |
| `models.personaDefaultsTitle` | `페르소나별 기본 설정` | `Persona Defaults` |
| `models.personaDefaultsHint` | `페르소나별 기본값은 routing.md 에서 관리돼요.` | `Managed in ~/.productune/sections/routing.md` |
| `models.viewRoutingMd` | `routing.md 보기` | `View routing.md` |
| `models.toastSaved` | `기본 모델이 변경됐어요` | `Default model updated` |

> **T-P4-057 linter 점검**: `claude-haiku-4` / `claude-sonnet-4` / `claude-opus-4` / `routing.md` /
> `Round 3` / `.env.local` / `.env` — 영문 보호어 유지. `환경 변수` / `모델` / `카탈로그` /
> `시크릿` — 한국어 일반 어휘 OK. `PO` / `Designer` / `Developer` / `QA` = 페르소나 ID
> (영문 보호어 — ko locale 에서도 영문 보존). `opus` / `sonnet` / `haiku` = 모델 tier 코드
> (영문 보호어, ko locale 노출 시 tier 라벨 `속도 우선` / `균형` / `정확도 우선` 로 표시).

---

## §5 §1.5 Self-check

### 5.1 §1.5.1 Few Things Per Page

- Settings sidebar: 환경 변수 sec-hdr + 3 nav row + 모델 sec-hdr + 1 nav row 추가.
  sidebar 전체 = 8 nav row + 2 sec-hdr + 2 divider. 선택 옵션이 아닌 nav 목록 — scrollable
  OK. 한 시점에 active row 1 개. ✅
- EnvViewTab (stub): skeleton rows + 1 stub CTA. Primary action = 없음 (read-only stub).
  §1.5.1 위반 없음. ✅
- EnvViewTab (real): variable table + 1 primary CTA ([+ 변수 추가]) + row kebab. Table row 는
  list item — kebab 안 action 은 secondary, modal level CTA ≤ 2. ✅
- ModelsCatalogTab: 3 section (DefaultModel radio / CatalogTable read-only / PersonaDefaults
  read-only). Primary action = radio 1 개. Read-only sections = zero action. ✅
- DeleteConfirmModal: [취소] + [삭제] = 2 CTA. ✅

**위반 없음.** ✅

### 5.2 §1.5.2 Familiar + 점진적 정보

- Settings sidebar 섹션 헤더 + nav row 패턴 = T-P4-099 / T-P4-048-mh 와 동일 visual weight.
  사용자 학습 비용 0. ✅
- EnvViewTab = table + inline form expand — 스프레드시트 / 환경 에디터 패턴 (Vercel env 편집
  화면과 유사, developer 에게 익숙). ✅
- ModelsCatalogTab radio = Settings General 의 언어 radio 와 동일 interaction. ✅
- stub 상태 = skeleton rows (gray animated) — loading/pending 표준 패턴. §1.5.3 정합
  ("Pending state ≠ Empty state"). ✅

### 5.3 §1.5.3 Predictability

- 모든 Settings nav row click = `openTab(...)` → main pane (T-P4-099 / T-P4-048-mh 와 일관). ✅
- count badge `(N)` = sidebar 에서 변수 존재 여부 즉시 확인 가능 (click 전 preview). ✅
- status badge token (✅/⚠️/🔴/🔒) = T-P4-059 SessionHealthBanner + T-P4-022 trace 에서
  사용된 `--health-*` 토큰과 동일 semantic. ✅
- modal footer [취소] 좌 / [삭제] 우 = T-P4-067 modal 패턴 정합 (§1.5.3 버튼 위치). ✅
- Empty tab state → skeleton (not blank) — `Pending state ≠ Empty state` 명시. ✅

### 5.4 §1.5.4 Feedback

- Settings nav row click → openTab 즉시 (< 100ms). ✅
- DefaultModel radio 선택 → 즉시 IPC call + toast "기본 모델이 변경됐어요" (< 200ms). ✅
- env count badge = mount 시 `env:getCount()` 호출; loading 중 = badge 없음 (spinner 불필요 — count badge absence = neutral, not confusing). ✅
- [저장] (AddVariableForm) → IPC call → spinner disabled → toast 완료 / error + retry CTA. ✅
- secret value eye icon → reveal → 5초 자동 재마스킹 (사용자에게 timer 표시 권장: "5초 후 숨겨짐"). ✅
- skeleton rows = pending 상태 명시 (blank 아님). ✅

**위반 후보**: env:getCount loading 중 badge 없음 — sidebar 진입 시 count가 잠깐 보이지
않을 수 있음. → **impl note**: SettingsView mount 시 전체 layer count 를 병렬 fetch.
skeleton badge (`·`) 를 fetch 완료 전 임시 표시 (1자 dot placeholder).

### 5.5 §1.5.5 Escape

- DeleteConfirmModal: Esc 키 = 취소 (destructive 이므로 **Esc = Cancel 동등**, backdrop click
  도 cancel). §1.5.5 destructive 모달 Esc 규칙 정합. ✅
- AddVariableForm inline expand: [취소] = collapse form (데이터 손실 confirm — 이름/값 입력
  했을 시: "입력을 취소할까요?"). ✅
- models-catalog tab X = main pane tab 닫기. ✅
- env-view tab X = 동상. ✅

**위반 없음.** ✅

---

## §6 §QA scope

| Field | Value |
|:--|:--|
| **QA invoke** | `manual smoke only` |
| **test target** | `SettingsView` (환경 변수 + 모델 섹션 nav row click → openTab 동작) / `ModelsCatalogTab` (radio 선택 → `settings:set` IPC + toast) / `env:getCount` IPC (project .env + .env.local + productune.env 파일 count) |
| **사용자 dogfood** | Settings → 프로젝트 .env nav row 클릭 → env-view tab open 확인 (count badge 표시 여부) / Settings → 카탈로그 → 모델 radio 변경 → toast 확인 / 앱 재시작 후 선택된 모델 유지 여부 |
| **regression check** | `SettingsView.tsx` 기존 sub-tab (일반 / 작업 흐름 규칙 / MCP 서버 / 훅) openTab 동작 변화 없음 / `TabContent.tsx` 기존 tab type dispatcher fallthrough 없음 / `pnpm -r check-locale-protected` 통과 (신규 i18n key T-P4-057 linter) / `pnpm -r build` TypeScript strict — `'env-view'` 기존 TabType 중복 추가 없음 |

**QA invoke 선택 이유**: 단일 컴포넌트 추가 (EnvViewTab stub + ModelsCatalogTab) + L3 범위.
stub 상태 = 실제 데이터 wire 없음 → regression surface 단순. multi-step flow < 3. `manual smoke only`.

---

## §7 Open Questions

### OQ-1. Models 탭 — codex / openai 포함 여부

| 옵션 | 설명 | 판단 |
|---|---|---|
| **(a) Anthropic claude only (채택)** | claude-haiku-4 / sonnet-4 / opus-4 3 모델 only. 현 dogfood baseline. | MVP 적합. codex / openai = Phase 5 |
| **(b) dynamic IPC** | `claude --models` 또는 Anthropic SDK 로 실시간 조회 | API 의존 + 네트워크 부재 시 실패. Phase 5. |
| **(c) static multi-provider** | claude + codex + openai 직접 hardcode | 모델 버전 관리 overhead + 사용자 혼란 가능 |

**Designer 권고 → (a) Anthropic claude only (MVP)**.
Phase 5 에서 `IPC models:listProviders()` 로 확장.

### OQ-2. env-view stub 제거 타이밍

T-P4-031~032 가 별 Round 3 dispatch 이므로 stub notice 와 skeleton rows 가
생산 배포에 노출됨. 사용자가 "왜 env 탭이 placeholder?" 라고 질문할 수 있음.

| 옵션 | |
|---|---|
| **(a) stub notice + disabled CTA (채택)** | 사용자에게 "Round 3에서 완성" 명시. 기대 관리 OK. |
| **(b) nav row 자체를 disabled** | T-P4-031 land 전까지 env rows disabled + tooltip. UX 더 명확하나 progress 숨김. |
| **(c) nav row 숨김** | T-P4-031 land 후 노출. PR gate 필요. |

**Designer 권고 → (a)**. stub notice 문구가 명확하면 혼란 최소화.

### OQ-3. count badge 0 표시 여부

- 현 spec: count 0 → `(0)` 표시.
- 대안: count 0 → badge 없음 (T-P4-048-mh 의 MCP connected badge 와 달리 empty = informative).

**Designer 권고 → `(0)` 표시**. 파일 존재하지만 변수가 없는 상태와 파일 없는 상태를 구분
(count 0 vs badge 없음). 사용자가 "파일은 있는데 비어있구나" 즉시 파악 가능.

---

## §8 Out of Scope

- **MCP Servers + Hooks** — `docs/design/T-P4-048-mcp-hooks/plan.md` 에서 완료.
- **Language + Workflow rules** — T-P4-096 / T-P4-099 에서 완료.
- **T-P4-031 variable table real data** — Round 3 별 dispatch.
- **T-P4-032 CRUD backend (env:upsert / env:delete IPC)** — Round 3 별 dispatch.
- **T-P4-033 .env.local read/write** — Round 3 별 dispatch.
- **T-P4-034 Vercel env push** — [Vercel에 push] CTA = env-view 내 비활성 placeholder. T-P4-034 land 시 활성화.
- **T-P4-035 코드 스캔** — DeleteConfirmModal "사용 중인 위치" = stub "확인 중..." 상태. T-P4-035 land 시 real AST 결과.
- **ticket md 발행** — 본 dispatch = plan-only (1 artifact).
- **ROADMAP 갱신** — T-P4-048 ticket 의 Notes 에 인라인 stamp 권고 (별 PO task).
- **ticket Acceptance 탭 타입 devation 주석** — Models sub-section 이 `markdown` 대신
  `models-catalog` 채택한 내용 → T-P4-048 ticket Acceptance 에 "(designer override: models-catalog
  tab type, markdown tab 불채택 — T-P4-048-env-models/plan.md §2(B).1)" 주석 stamp 권고
  (별 PO task).
- **`~/.productune/models.md` seeding** — T-P4-106 bootstrapUserGlobalDoctrine 에 models.md
  추가 여부는 Phase 5 decision (본 plan 이 models.md 불사용 결정으로 즉시 seed 불필요).

---

## §9 Dependencies

| Ticket | Status | Why |
|---|---|---|
| T-P4-046 | land | `env-view` TabType + PlaceholderTab 기존. `openTab` API. |
| T-P4-099 | land | Settings sidebar = nav-only + openTab 패턴 확립. `SettingsSubTab` type baseline. |
| T-P4-048-mh | plan (dispatched) | `SettingsSubTab` 에 `mcp \| hooks` 추가 — 본 plan 은 그 위에 append. |
| T-P4-107 | land | PersonaDefaultsSection 의 모델/effort 표 SoT (§2(a)). |
| T-P4-057 | land | i18n linter — §4.3 신규 key parity check. |
| T-P4-067 | land | DeleteConfirmModal 의 modal 패턴 reference (Esc / backdrop / CTA 위치). |
| T-P4-031 | todo (Round 3) | EnvViewTab real data wire. 본 plan 이 스펙 SoT. |
| T-P4-032 | todo (Round 3) | CRUD IPC (env:upsert / env:delete). 본 plan 이 UI 패턴 SoT. |
| T-P4-033 | todo (Round 3) | .env.local backend. |

---

## §10 변경 정책

- OQ-1~3 사용자 확정 후 해당 절 status `draft` → `decided`.
- T-P4-031 land 후 §3.2 stub mockup → real mockup 교체 + `StubNotice` 제거 표시.
- T-P4-032 land 후 §3.3 real mockup `disabled` 제거.
- T-P4-034 land 후 §3.3 [Vercel에 push] CTA spec 별 append.
- 외부 연결 sub-tab 추가 시 §2(C) 표 갱신.
