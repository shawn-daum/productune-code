---
doc: design-plan
slug: settings-mcp-hooks
owner: pdt-designer
status: draft
parent_ticket: T-P4-048
sub_scope: MCP Servers + Hooks sub-sections only
date: 2026-05-14
prior_fail: stream idle timeout (6 sub-section monolithic plan)
deps_landed:
  - T-P4-022  # 외부 연결 sub-tab 설계 원칙 확립 (§8.3 OQ-T022-1 결정)
  - T-P4-099  # Settings sidebar = nav-only; openTab 패턴 확립 (두 sub-tab 모두)
  - T-P4-106  # install.sh / init 경로 doctrine 설치 패턴
related_docs:
  - docs/design/design-system.md
  - docs/design/T-P4-022-deploy-po-trigger-vercel.md §8.3 + §13 OQ-T022-1
  - docs/tickets/phase4/T-P4-048.md
out_of_scope:
  - Environment sub-section (별 dispatch)
  - Models sub-section (별 dispatch)
  - 외부 연결 sub-tab (Vercel token — T-P4-022 §16.3 별 PO task)
  - hook 신규 작성 UI (ticket Notes verbatim: "기존 hook 목록 표시 + toggle만")
  - MCP server 직접 설치 (ticket Notes verbatim: "설정 + auth만")
---

# T-P4-048 설계 플랜 — MCP Servers + Hooks sub-sections

> **Dispatch 범위 한정**: MCP Servers + Hooks 2 sub-section 만. NO ticket emit. NO ROADMAP.
> NO Environment / Models. NO 외부 연결 (T-P4-022 §16.3 별 PO task 대기).
>
> **Chunking 근거**: T-P4-104 plan §4 — plan.md 는 1 artifact = 1 dispatch. 6 sub-section
> 동시 scope → 이전 dispatch 에서 stream idle timeout 발생 (prior_fail 기록). 본 dispatch
> = 2 sub-section plan-only (1 artifact).

---

## §1 Background

### 1.1 사용자 Directive (verbatim)

> "settings에 mcp 같은거 다 있었는데"

이전 Settings 화면에 MCP 설정이 보였던 경험 → 현재 GUI (T-P4-099 land 후 SettingsView)
에서 `일반` / `작업 흐름 규칙` 2 sub-tab 만 존재 → MCP Servers + Hooks 가 visible하지 않음.
T-P4-048 Acceptance 로 이미 명시된 2 섹션이지만 sub-tab 연결이 없는 상태.

### 1.2 T-P4-048 Acceptance — MCP + Hooks 관련 원문

```
### MCP Servers 섹션
- set-row × N: graphiti / figma / linear + s-badge (ok 초록 "connected" / err 빨강 "unauth")
- 클릭 → MCP 설정 modal (auth endpoint 입력)
- 상태는 IPC mcp:getStatus() 로 실시간 조회

### Hooks 섹션
- PreToolUse — s-badge ok (N active) → hook list viewer
- PostToolUse — s-badge ok (N active) → hook list viewer
- 클릭 → hook 목록 + toggle (enable/disable per hook)

Data source:
- IPC mcp:getStatus() / hooks:list() / hooks:toggle(hookId)
Out of scope:
- hook 신규 작성 UI (기존 hook 목록 표시 + toggle만)
- MCP server 직접 설치 (설정 + auth만)
```

### 1.3 현재 SettingsView 상태 (T-P4-099 land 결과)

```ts
// SettingsView.tsx (T-P4-099 land 후)
type SettingsSubTab = 'general' | 'workflow'

// both sub-tabs → openTab(...) to main pane
// sidebar = nav-only, no inline content
```

`SettingsSubTab` 에 `mcp` + `hooks` type 이 없어 Settings sidebar 에서 아예 접근 불가.

### 1.4 T-P4-022 §13 OQ-T022-1 결정 (외부 연결 vs MCP 분리 맥락)

T-P4-022 §8.3 + §13 OQ-T022-1(c) designer 권고 (land 상태):

> "외부 연결 sub-tab = third-party API tokens (Vercel / GitHub / Supabase 등).
>  MCP Servers = LLM tool integrations (graphiti / figma / linear). 별 sub-tab."

본 plan 은 이 결정을 그대로 inherit — **MCP Servers sub-tab 과 외부 연결 sub-tab 은 별도**.
외부 연결 sub-tab 발행 = T-P4-022 §16.3 별 PO task (본 plan 범위 X).

---

## §2 Decisions

### §2(a) MCP Servers sub-section

#### 2(a).1 Data source

| 소스 | 역할 |
|---|---|
| `~/.claude/settings.json` `mcpServers` block | 글로벌 MCP 서버 config (endpoint + env) |
| `<projectDir>/.mcp.json` | 프로젝트 레벨 MCP 서버 config |
| IPC `mcp:getStatus()` | 각 서버의 실시간 연결 상태 ping (ok / err / timeout) |

두 config 를 Electron main process 에서 **merge** (project-level 우선). IPC 핸들러가
merge 결과 + 연결 상태를 renderer 에 반환.

현재 `~/.claude/settings.json` 에 `mcpServers` 키 없음 (실제 확인). 해석 = 서버 미설정
상태 → UI empty state (§3.3 참조). 사용자가 config 없이도 tab open 가능해야 함.

#### 2(a).2 set-row 표시 토큰 (2 토큰)

| 토큰 | 내용 | 비고 |
|---|---|---|
| 서버 이름 | `graphiti` / `figma` / `linear` / custom name | `mcpServers` object key |
| `s-badge` | `● 연결됨` (초록, `--health-success`) / `✗ 인증 필요` (빨강, `--health-error`) / `◌ 확인 중` (회색, `--text-muted`) | `mcp:getStatus()` 응답 |

dispatch 에서 언급된 "last-used timestamp" = `~/.productune/settings.json` 에 캐시 가능
하나 MVP 범위 X — status 2-token 으로 충분. Phase 5 candidate.

#### 2(a).3 클릭 → MCP 설정 modal

**`McpServerModal` 컴포넌트** (T-P4-067 modal 패턴 정합):

```
┌─ {서버 이름} 설정 ─────────────────────────────┐
│                                               │
│  이름        graphiti              (read-only)│  ← mcpServers key
│  연결 방식   stdio / SSE / HTTP   [드롭다운]  │  ← transport type
│  명령어      npx @getzep/graphiti-mcp         │  ← command (stdio) or URL (SSE/HTTP)
│                                               │
│  인증 정보                                    │
│  ┌──────────────────────────────────────────┐│
│  │ NEO4J_URI        bolt://...          [✕] ││  ← env key-value rows
│  │ NEO4J_PASSWORD   ••••••••             [✕] ││
│  │ [+ 추가]                                  ││
│  └──────────────────────────────────────────┘│
│                                               │
│  [연결 테스트]    ← spinner → ✓ / ✗ inline  │
│                                               │
│  [저장]          [취소]                       │  ← primary / secondary
│                                               │
│  ⓘ 변경사항은 AI 엔진 재시작 후 적용돼요.    │  ← restart notice (always visible)
└───────────────────────────────────────────────┘
```

**필드 명세:**

| 필드 | 타입 | 동작 |
|---|---|---|
| 이름 | text, read-only | mcpServers 의 key. 편집 → Phase 5 (key rename = 별 workflow) |
| 연결 방식 | select: stdio / SSE / HTTP | stdio 선택 시 "명령어" 필드, SSE/HTTP 시 "URL" 필드 표시 |
| 명령어 / URL | text | transport 에 따라 label 변경 |
| 인증 정보 | key-value list | env block. 값은 masking (`••••••••`). 편집 시 clear → 입력. [✕] 로 row 삭제. [+ 추가] 로 신규 env key 추가 |
| 연결 테스트 | button | IPC `mcp:testConnection(serverName, config)` → spinner → success/error inline badge |

**[저장] 동작**:
1. Electron main process → `fs.writeFile` 로 `~/.claude/settings.json` 의 `mcpServers[key]` 갱신.
2. 저장 성공 → toast "저장됐어요" (`--health-success`).
3. 저장 후 modal 자동 close.
4. list 갱신 — `mcp:getStatus()` re-poll (500ms delay).
5. **재시작 notice 는 modal 하단에 항상 노출** (저장 성공 후에도 별도 toast 로 "AI 엔진을
   재시작해야 적용돼요" 표시). §1.5.4 Feedback 정합.

**새 서버 추가** — MVP scope 결정: tab 하단 [+ 서버 추가] 버튼 노출 → 빈 `McpServerModal`
열기 → 이름 필드를 editable 로 전환. OQ-2 에서 확정 (§6 참조). 단 ticket 의 "설정 + auth만
(설치 X)" 정책과 충돌하므로 Phase 5 lock 권고.

#### 2(a).4 empty state

`mcpServers` config 없음 + `.mcp.json` 없음 → list empty:

```
  (MCP 아이콘 24px)
  연결된 MCP 서버가 없어요.
  install.sh 로 서버를 추가할 수 있어요.
  [설치 안내 보기]   → 외부 docs 링크 또는 install.sh 실행 guide
```

§1.5.3 Predictability — empty = Empty 컴포넌트 (icon + headline + description + 1 CTA). ✓

---

### §2(b) Hooks sub-section

#### 2(b).1 Data source

`~/.claude/settings.json` 의 `hooks` block 직접 parse. 실제 확인된 구조:

```json
{
  "hooks": {
    "PreToolUse": [ { "matcher": "Bash", "hooks": [{ "type":"command", "command":"...sh" }] } ],
    "PostToolUse": [ { "matcher": "Write|Edit", ... }, { "matcher": "Bash", ... } ],
    "PostCompact": [ { "hooks": [{ "type":"command", "command":"...sh" }] } ],
    "Stop":        [ { "matcher": "pdt-developer", ... } ]
  }
}
```

IPC `hooks:list()` = Electron main 이 위 구조를 flatten 하여 renderer 에 전달:

```ts
interface HookRow {
  eventType: 'PreToolUse' | 'PostToolUse' | 'PostCompact' | 'Stop'
  matcher: string | null   // null if no matcher (PostCompact)
  commandBasename: string  // path.basename(command) — 긴 path 숨김
  commandFull: string      // detail panel 에서 노출
  enabled: boolean         // settings.json 내 `disabled: true` flag (§2(b).3 참조)
}
```

#### 2(b).2 display 원칙 — read-only (dispatcher 지시 + 이유)

**dispatch verbatim**: "read-only display / settings.json 직접 편집 안내."

ticket Acceptance 에 `hooks:toggle(hookId)` 가 명시되어 있으나, 본 plan 은 read-only 로
scoping. 이유:

| 비교 | toggle 포함 | read-only |
|---|---|---|
| 복잡도 | hooks.json 에 `disabled` 플래그 schema 추가 필요 | 단순 display |
| 위험 | hook 비활성화 → PO doctrine 실행 안 됨 (예: `post-delegate-state-write.sh` disable 시 session 상태 망실 위험) | read-only = 안전 |
| 사용 빈도 | hook toggle 사용 시나리오 거의 없음 (dogfood 미관찰) | — |

**Toggle = Phase 5 candidate.** 본 MVP = read-only display + settings.json 직접 편집 안내.

ticket 의 `hooks:toggle(hookId)` IPC 발행 = Phase 5 scope 로 명시 (§6 OQ-3 결정 공식화).

#### 2(b).3 row 표시 토큰 (3 토큰)

| 토큰 | 내용 | 비고 |
|---|---|---|
| hook type chip | `PreToolUse` / `PostToolUse` / `PostCompact` / `Stop` | neutral pill, 영문 보호어 그대로 |
| matcher | `Bash` / `Write\|Edit` / `pdt-developer` / `-` (no matcher) | monospace 14px |
| commandBasename | `pre-delegate-task-check.sh` | `--text-muted`, max 32 char truncate |

#### 2(b).4 클릭 → hook detail panel (read-only)

Main pane 내부 inline expand (modal X — 상세 정보가 단순하고 다른 화면 이동 불필요):

```
┌─ PreToolUse · Bash ───────────────────────────────┐
│                                                   │
│  명령어 (전체 경로)                                │
│  /Users/…/hooks/pre-delegate-task-check.sh        │  ← monospace, copyable
│                                                   │
│  수정하려면 ~/.claude/settings.json 을 직접        │
│  편집한 뒤 AI 엔진을 재시작해주세요.              │  ← guidance message
│                                                   │
│  hook 추가는 install.sh 를 통해 등록할 수 있어요. │  ← T-P4-104 패턴 안내
│  [설치 안내 보기]                                 │
│                                                   │
│  [닫기]                                           │  ← Escape CTA
└───────────────────────────────────────────────────┘
```

inline expand (accordion 패턴) vs side-panel vs modal — **accordion 권고**. hook detail
은 텍스트 only + 복사 버튼. modal 무게 불필요. §1.5.1 Few Things 정합.

#### 2(b).5 Hooks tab layout

```
┌─ 훅 ──────────────────────────────────────────────────────────┐
│                                                               │
│  PreToolUse     Bash                 pre-delegate-task…       │  ← row 1
│  PostToolUse    Write|Edit           post-edit-format.sh      │  ← row 2
│  PostToolUse    Bash                 post-delegate-state…     │  ← row 3
│  PostCompact    -                    post-compact-doctrin…    │  ← row 4
│  Stop           pdt-developer        stop-verify.sh          │  ← row 5
│                                                               │
│  ────────────────────────────────────────────────────────     │
│                                                               │
│  ⓘ 훅 설정은 ~/.claude/settings.json 에서 직접 변경하거나    │
│     install.sh 를 통해 추가할 수 있어요.                      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

row click → 해당 row 아래 accordion expand (hook detail). 재클릭 = collapse.

---

### §2(c) sub-tab 통합 결정 — T-P4-022 외부 연결 분리 확인

| sub-tab | openTab type | 내용 | 본 plan 범위 |
|---|---|---|---|
| `일반` | `general-settings` | language + misc | T-P4-099 (land) |
| `작업 흐름 규칙` | `workflow-settings` | git-rules.json | T-P4-099 (land) |
| **`MCP 서버`** | **`mcp-servers`** | **MCP server list + modal** | **본 plan** |
| **`훅`** | **`hooks`** | **hooks read-only list** | **본 plan** |
| `외부 연결` | `integrations` | Vercel token / GitHub token | T-P4-022 §16.3 별 PO task |

**MCP 서버 vs 외부 연결 분리 근거** (T-P4-022 §13 OQ-T022-1(c) 재확인):
- 외부 연결 = productune 가 호출하는 외부 서비스 API token (Vercel REST, GitHub OAuth).
- MCP 서버 = Claude AI engine 이 런타임에 호출하는 tool server (graphiti, figma, linear).
- 동일 "연결 관리" 그룹처럼 보이나 실제 소비자가 다름 → 별 sub-tab 이 §1.5.3
  Predictability 정합 (사용자 mental model: "AI 도구" vs "배포 도구").

---

## §3 ASCII Mockup

### 3.1 Settings sidebar — 본 plan 추가 후

```
┌─ Settings sidebar 260px ─────────────────────────┐
│ ┌──────────────────────────────────────────────┐ │
│ │ 일반                                          │ │  → main: 일반 설정  (T-P4-099)
│ │ 작업 흐름 규칙                                │ │  → main: 작업 흐름 규칙  (T-P4-099)
│ │ MCP 서버                      [active]        │ │  → main: MCP 서버  (본 plan)
│ │ 훅                                            │ │  → main: 훅  (본 plan)
│ └──────────────────────────────────────────────┘ │
│      (이하 빈 공간 — sidebar nav only)           │
└──────────────────────────────────────────────────┘
```

### 3.2 Main pane — MCP 서버

```
┌─ MCP 서버 ─────────────────────────────────────────────────────┐
│                                                                │
│  graphiti             ● 연결됨                                 │
│  figma                ● 연결됨                                 │
│  linear               ✗ 인증 필요                             │
│                                                                │
│  ────────────────────────────────────────────────────────     │
│                                                                │
│  ⓘ MCP 서버는 AI 엔진이 사용하는 외부 도구예요.               │
│     설정 변경 후 AI 엔진을 재시작해야 적용돼요.               │
│                                                                │
└────────────────────────────────────────────────────────────────┘

  ↓ row click → McpServerModal ↓

┌─ graphiti 설정 ───────────────────────────────────────────────┐
│                                                               │
│  이름            graphiti                      (읽기 전용)    │
│  연결 방식       [stdio ▾]                                    │
│  명령어          npx @getzep/graphiti-mcp                     │
│                                                               │
│  인증 정보                                                    │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ NEO4J_URI          bolt://localhost:7687            [✕] │ │
│  │ NEO4J_PASSWORD     ••••••••                         [✕] │ │
│  │ [+ 추가]                                                │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  [연결 테스트]        ✓ 연결됨 (127ms)                        │
│                                                               │
│  ⓘ 변경사항은 AI 엔진 재시작 후 적용돼요.                    │
│                                                               │
│  [저장]              [취소]                                   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 3.3 Main pane — 훅

```
┌─ 훅 ──────────────────────────────────────────────────────────┐
│                                                               │
│  PreToolUse    Bash            pre-delegate-task-check.sh     │  ← row
│  PostToolUse   Write|Edit      post-edit-format.sh            │
│  PostToolUse   Bash            post-delegate-state-write.sh   │
│  PostCompact   —               post-compact-doctrine.sh       │
│  Stop          pdt-developer   stop-verify.sh                 │
│                                                               │
│  ─── [클릭 시 accordion expand] ─────────────────────────────│
│                                                               │
│  PreToolUse · Bash                                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ /Users/…/hooks/pre-delegate-task-check.sh          [복사]│ │
│  │                                                         │ │
│  │ 수정: ~/.claude/settings.json 직접 편집 후 재시작       │ │
│  │ 추가: install.sh 통해 등록           [설치 안내 보기]   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ────────────────────────────────────────────────────────     │
│                                                               │
│  ⓘ 훅은 ~/.claude/settings.json 의 hooks 블록에서 관리돼요. │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## §4 Module Map

### 4.1 신규 파일

| 경로 | 역할 | 비고 |
|---|---|---|
| `packages/gui/src/components/workspace/main/panes/McpServersTab.tsx` | MCP Servers main pane (list + empty state) | `mcp:getStatus()` IPC subscribe |
| `packages/gui/src/components/workspace/main/panes/HooksTab.tsx` | Hooks main pane (list + accordion detail) | `hooks:list()` IPC subscribe |
| `packages/gui/src/components/workspace/McpServerModal.tsx` | MCP 설정 modal (fields + test + save) | T-P4-067 modal 패턴 정합 |
| `packages/gui/electron/ipc/mcp.ts` | MCP IPC handlers (`mcp:getStatus`, `mcp:testConnection`, `mcp:save`) | Electron main; `~/.claude/settings.json` + `.mcp.json` read/write |
| `packages/gui/electron/ipc/hooks.ts` | Hooks IPC handlers (`hooks:list`) | Electron main; `~/.claude/settings.json` `hooks` block read |

### 4.2 수정 파일

| 경로 | 변경 내용 |
|---|---|
| `packages/gui/src/components/workspace/SettingsView.tsx` | `SettingsSubTab` type 에 `'mcp' \| 'hooks'` 추가. tabs array 에 2 항목 추가. `handleTabClick` 에 2 case 추가 (`mcp-servers` / `hooks` openTab). |
| `packages/gui/src/store/workspace.ts` | `TabType` enum 에 `'mcp-servers' \| 'hooks'` 추가. `defaultTitle` switch 에 2 case 추가. |
| `packages/gui/src/components/workspace/main/TabContent.tsx` | dispatcher 에 `case 'mcp-servers'` + `case 'hooks'` 추가 → 각 Tab 컴포넌트 렌더. |
| `packages/gui/src/locales/en.json` + `ko.json` | §4.3 i18n key 추가. |
| `packages/gui/electron/ipc/index.ts` (또는 registry) | `mcp.ts` + `hooks.ts` IPC handler 등록. |

### 4.3 i18n key

| key | ko | en |
|---|---|---|
| `settings.tabMcp` | `MCP 서버` | `MCP Servers` |
| `settings.tabHooks` | `훅` | `Hooks` |
| `settings.mcp.title` | `MCP 서버` | `MCP Servers` |
| `settings.mcp.statusConnected` | `연결됨` | `Connected` |
| `settings.mcp.statusUnauth` | `인증 필요` | `Auth required` |
| `settings.mcp.statusChecking` | `확인 중` | `Checking` |
| `settings.mcp.emptyTitle` | `연결된 MCP 서버가 없어요.` | `No MCP servers configured.` |
| `settings.mcp.emptyDesc` | `install.sh 로 서버를 추가할 수 있어요.` | `Add servers via install.sh.` |
| `settings.mcp.modal.nameLabel` | `이름` | `Name` |
| `settings.mcp.modal.transportLabel` | `연결 방식` | `Transport` |
| `settings.mcp.modal.commandLabel` | `명령어` | `Command` |
| `settings.mcp.modal.urlLabel` | `URL` | `URL` |
| `settings.mcp.modal.envLabel` | `인증 정보` | `Credentials` |
| `settings.mcp.modal.testBtn` | `연결 테스트` | `Test connection` |
| `settings.mcp.modal.saveBtn` | `저장` | `Save` |
| `settings.mcp.modal.cancelBtn` | `취소` | `Cancel` |
| `settings.mcp.modal.restartNotice` | `변경사항은 AI 엔진 재시작 후 적용돼요.` | `Changes apply after restarting the AI engine.` |
| `settings.mcp.toastSaved` | `저장됐어요` | `Saved` |
| `settings.mcp.toastRestartNeeded` | `AI 엔진을 재시작해야 적용돼요.` | `Restart the AI engine to apply.` |
| `settings.hooks.title` | `훅` | `Hooks` |
| `settings.hooks.noMatcher` | `—` | `—` |
| `settings.hooks.editHint` | `수정: ~/.claude/settings.json 직접 편집 후 재시작` | `Edit ~/.claude/settings.json and restart` |
| `settings.hooks.addHint` | `추가: install.sh 통해 등록` | `Add via install.sh` |
| `settings.hooks.docsLink` | `설치 안내 보기` | `View install guide` |
| `settings.hooks.footerHint` | `훅은 ~/.claude/settings.json 의 hooks 블록에서 관리돼요.` | `Hooks are managed in ~/.claude/settings.json` |

> T-P4-057 linter 검증: `MCP` / `PreToolUse` / `PostToolUse` / `PostCompact` / `Stop` /
> `install.sh` / `settings.json` 모두 영문 보호어로 유지 (§1.5.2 한영 혼용 원칙 정합).
> `훅` (ko) — 한국어 어휘 OK (기술 영문어가 아닌 일반 어휘). `hook` 영문 노출은 UI 라벨
> 에서 사용 X (locale ko 에서는 `훅`).

---

## §5 §1.5 Self-check

### 5.1 §1.5.1 Few Things Per Page

- Settings sidebar = 4 sub-tab nav 버튼만 (일반 / 작업흐름 / MCP 서버 / 훅). 콘텐츠 0. ✅
- MCP Servers tab = list rows + 하단 notice 1줄. Primary action = row click. ✅
- McpServerModal = form fields + 1 test button + 2 footer CTA ([저장] / [취소]). Modal CTA ≤ 2. ✅
- Hooks tab = accordion list + 하단 notice 1줄. No CTA in rows (read-only). ✅
- Hook accordion detail = 1 copyable path + 2 guidance lines + [설치 안내 보기] + [닫기]. ✅

**위반 없음**. modal env rows 의 [+ 추가] / [✕] 는 list item level CTA 이므로 modal-level CTA ≤ 2 rule 과 별개. ✅

### 5.2 §1.5.2 Familiar + 점진적 정보

- Settings sidebar sub-tab pattern = T-P4-099 land 패턴 동일 (click → openTab → main pane).
  사용자 학습 비용 0. ✅
- MCP server row = set-row token 2개. 기존 Settings row 스타일 (일반 / workflow nav row)
  과 동일 visual weight. ✅
- Hook accordion = expand/collapse = 표준 IDE 패턴 (VSCode settings accordion 유사). ✅
- modal form = label + input + footer CTA — 표준 form 패턴. ✅

### 5.3 §1.5.3 Predictability

- openTab pattern 일관: 모든 Settings sub-tab (일반/작업흐름/MCP/훅) = click → main pane. ✅
- s-badge 색 = `--health-success` (초록 연결됨) / `--health-error` (빨강 인증필요) — 동일
  token 을 다른 health surface 에서 사용 중 (T-P4-059 SessionHealthBanner, T-P4-022 trace). ✅
- empty state = Empty 컴포넌트 패턴 (icon + headline + description + 1 CTA). ✅
- hook row click = accordion expand (hover bg 즉시 + chevron 회전). ✅
- modal footer [취소] 좌 / [저장] 우 — T-P4-067 modal 패턴 정합 (§1.5.3 버튼 위치 일관). ✅

### 5.4 §1.5.4 Feedback

- MCP row click → modal open (즉시, < 100ms). ✅
- [연결 테스트] → spinner (`pdt-spin`) → inline success (`✓ 연결됨 (Nms)`) / error (`✗ 연결 실패`). ✅
- [저장] → 1. modal 자동 close 2. toast "저장됐어요" 3. toast "AI 엔진을 재시작해야 적용돼요". 3단계 모두 visual feedback. ✅
- mcp:getStatus() polling — loading 시 `◌ 확인 중` badge. 완료 시 즉시 갱신. ✅
- hook row click → accordion expand (즉시 visible). ✅
- clipboard copy → "복사됨 ✓" inline 1초 후 복원. ✅

**위반 후보**: modal save 후 main list 갱신이 500ms delay (re-poll) → 저장 직후 spinner 또는
"업데이트 중" 표시 필요. ← **impl note**: `McpServersTab` 에서 저장 이벤트 subscribe 시 list
를 optimistic update (저장된 config 기준으로 즉시 row 갱신, poll 응답으로 badge 갱신).

### 5.5 §1.5.5 Escape

- McpServerModal Esc + backdrop click = Cancel 동등. form 입력 진행 중 → "변경사항이 있습니다, 닫을까요?" confirm (입력 손실 방지). ✅
- Accordion detail [닫기] = 명시적 escape. 또는 다른 row click 시 이전 accordion collapse. ✅
- MCP list tab close = main pane tab X 아이콘. ✅
- Hooks tab = read-only, no action → escape 해당 없음. ✅

**위반 없음.** ✅

---

## §6 Open Questions

### OQ-1. McpServerModal save — `fs.writeFile` vs 안내만

| 옵션 | 설명 | risk |
|---|---|---|
| **(a) Electron main `fs.writeFile`** | Electron main process 가 `~/.claude/settings.json` 직접 edit. productune Electron process ≠ Claude Code process → 충돌 없음. 단 Claude Code 실행 중 settings.json 동시 쓰기 race condition 가능성 (낮음). | 낮음 |
| **(b) 안내 only** | modal save = `~/.productune/mcp-pending.json` 에 staged config 저장 + "직접 settings.json 에 붙여넣기" 안내. 사용자 수동 step 필요. | 없음, 단 UX 나쁨 |
| **(c) install.sh snippet 생성** | 저장 시 settings.json 편집 shell snippet 을 clipboard 에 복사. 사용자 paste & run. | 없음, UX 중간 |

**Designer 권고 → (a) Electron main `fs.writeFile`**.
- productune 의 기존 `bootstrapClaudeSettings()` (T-P4-106) 도 `~/.claude/` 경로에 직접 write.
- Claude Code 프로세스가 `settings.json` 을 read-only 로 mmap 하지 않음 (watch 기반 reread).
- (a) 선택 시 write 전 file lock check 또는 rename-swap 패턴 권고 (atomic write).
- **결정 후 §4.1 `mcp.ts` IPC handler spec 에 inline stamp.**

### OQ-2. 새 MCP server 추가 UI 포함 여부

- ticket "설정 + auth만" 정책 = 기존 서버 표시 + auth 편집 만.
- 신규 서버 추가 = `mcpServers` 에 새 key 생성 = 설치에 준하는 행위.
- **Designer 권고 → Phase 5 lock**. MVP = 기존 서버 표시 + edit auth. [+ 서버 추가] 버튼 = disabled + tooltip "추후 지원 예정".
- install.sh 의 MCP 서버 등록 workflow 가 이미 있으므로 (T-P4-104 패턴) empty state CTA "설치 안내 보기" 가 대체.
- **결정 후 §3.2 mockup + §4.1 handler spec 에 inline stamp.**

### OQ-3. hooks toggle — ticket vs plan 충돌 해소

- ticket Acceptance: `클릭 → hook 목록 + toggle (enable/disable per hook)` + `hooks:toggle(hookId)`.
- 본 plan: read-only (dispatch directive).
- toggle 구현 시 `~/.claude/settings.json` 의 각 hook entry 에 `"disabled": true` 플래그 추가 필요 — Claude Code 의 hook 스펙에 `disabled` 필드 지원 여부 미확인.
- **Designer 권고 → Phase 5 lock**. MVP = read-only. toggle = Phase 5 (Claude Code `disabled` field 지원 확인 후).
- 사용자 toggle 필요 시 임시 workaround = settings.json 직접 편집 (hook detail panel 안내).
- **결정 후 ticket Acceptance 의 toggle row 에 Phase 5 주석 stamp (별 PO task).**

---

## §7 Dependencies

| ticket | status | why |
|---|---|---|
| T-P4-022 | land | §2(c) 외부 연결 분리 결정 근거. MCP sub-tab ≠ 외부 연결. |
| T-P4-046 | land | TabType enum baseline. 2 type 추가 (mcp-servers, hooks). |
| T-P4-067 | land | McpServerModal 의 modal 패턴 source (Esc / backdrop / busy spinner). |
| T-P4-099 | land | SettingsView `openTab` 패턴 + sidebar nav-only 원칙 확립. |
| T-P4-057 | land | i18n linter — §4.3 신규 key parity check. |
| T-P4-104 | land | install.sh 기반 hook 추가 안내 패턴. HooksTab "설치 안내" CTA reference. |
| T-P4-106 | land | `~/.productune/` 경로 write 패턴 (`bootstrapClaudeSettings` = Electron main fs.write 선례). OQ-1 의 근거. |

---

## §QA Scope

### QA invoke 판단

- **skip** (본 scope = UI shell + IPC read/write, no business logic / no payment / no PII / no auth flow).
- type:test ticket 발행 기준 4가지 모두 미해당 (risk_flags: none, 2-step user flow < 3, 동일 area fail-pattern 미관찰, 사용자 test-first 요청 없음).

### Manual dogfood target (impl 완료 후)

1. Settings sidebar → `MCP 서버` click → main pane open.
2. row 표시 확인 (graphiti / figma / linear 각 s-badge 색). 없으면 empty state 확인.
3. row click → McpServerModal open. 필드 표시 / [연결 테스트] → spinner → 결과 inline.
4. env row [✕] → 삭제. [+ 추가] → 새 row 입력. [저장] → toast 2개 → modal close → list 갱신.
5. Settings sidebar → `훅` click → main pane open.
6. hook row list 확인 (5 rows = Pre/Post/Post/PostCompact/Stop).
7. row click → accordion expand → 전체 경로 + 안내 텍스트 + [복사] → clipboard 확인.
8. 다른 row click → 이전 accordion collapse + 새 accordion expand.

### Regression target

- Settings sidebar 기존 `일반` / `작업 흐름 규칙` sub-tab → openTab 동작 변화 없음.
- TabContent dispatcher 에 `mcp-servers` / `hooks` case 추가 후 기존 tab type (`general-settings`, `workflow-settings`, `skill-matrix`, `team-wiki` 등) fallthrough 없음.
- `pnpm -r check-locale-protected` 통과 (신규 i18n key T-P4-057 linter).
- `pnpm -r build` TypeScript strict — 신규 TabType union 모든 case 처리.

---

## §8 Implementation 분해 (dev 임플 분할 권고)

| sub | 영역 | 산출물 | 의존 | 권장 순서 |
|---|---|---|---|---|
| sub-a | IPC handlers (`mcp.ts` + `hooks.ts`) | `mcp:getStatus` / `mcp:testConnection` / `mcp:save` / `hooks:list` | Electron main fs module | 1차 |
| sub-b | TabType 확장 + SettingsView sub-tab 추가 + TabContent dispatcher | store + SettingsView + TabContent | T-P4-046, T-P4-099 | 1차 |
| sub-c | `McpServersTab.tsx` — list + empty state | sub-a IPC + sub-b routing | sub-a, sub-b | 2차 |
| sub-d | `McpServerModal.tsx` — form + test + save | sub-a IPC | sub-a | 2차 |
| sub-e | `HooksTab.tsx` — list + accordion | sub-a IPC + sub-b routing | sub-a, sub-b | 2차 |
| sub-f | i18n key 추가 + T-P4-057 lint pass | locale files | sub-c/d/e | 2차 or parallel |

---

## §9 Stale Note — T-P4-022 외부 연결 pending

T-P4-022 §16.3: "T-P4-048 sub-tab list 에 '외부 연결' (Vercel / GitHub token 모음) 추가 —
§13 OQ-T022-1 결정 반영" 은 별 PO task 로 pending. 본 plan land 시 SettingsView 의
`SettingsSubTab` type 에 `'integrations'` 를 추가할 자리 확보 (주석 처리 또는 placeholder).
실제 content = T-P4-022 accept 확정 후 별 dispatch.

---

## §10 변경 정책

- OQ-1 ~ OQ-3 사용자 확정 후 §4.1 / §3.2 / §4.3 인라인 stamp + status `draft` → `decided`.
- impl 1차 (sub-a/b) land 후 §4.2 수정 파일 표 "land" 표시.
- impl 2차 (sub-c/d/e/f) land + QA pass 후 해당 sub 표 "done" 표시.
- 외부 연결 sub-tab 추가 시 §2(c) 표 갱신.
