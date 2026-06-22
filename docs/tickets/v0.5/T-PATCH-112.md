---
ticket_id: T-PATCH-112
version: v0.5
round: patch
type: impl
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: medium
estimated_complexity: L2
qa_status: pending
qa_loops: 0
slug: fresh-init-config-schema-v
area_tags: [core/init, core/migrations, gui/electron, gui/project-detect]
created_at: 2026-06-11
---

# T-PATCH-112 — fresh init 이 완전한 config.json(+최신 schema_v)을 쓰지 않음 → 가짜 legacy 다이얼로그 + 가짜 migration pending

## §1 Request (why)

shawn (ad-hoc, 사용자 확인 버그 — root cause 추적 완료):

`packages/core/src/init.ts` 의 `initProject()` (L416~447) 가 **fresh 프로젝트에 대해 완전한 `.productune/config.json` 을 쓰지 않는다.** `schema_v` 는 기존 config 에 이미 있을 때만 보존되고(L437), fresh init 에는 절대 찍히지 않는다. 실제 사례(오늘 아침 `/Users/x/Documents/dev/ntf-products/oh-my-eyes`)에서는 **config.json 자체가 아예 없는 상태**로 `.productune/` 에 `po-state.json`(`schema_version: 1`) + `po.lock` 만 존재한다 — PO 세션/runner 가 `.productune/` 상태 파일을 먼저 만들었고 init 의 config 쓰기는 일어나지 않은 경로.

사용자 가시 증상 2건:

- **(A) 가짜 legacy 다이얼로그**: GUI `detectProductuneLayout()` (`packages/gui/electron/ipc/project.ts:67-90`) 이 "config.json 없음 + po-state.json 존재" 를 보고 신생 프로젝트를 `self-legacy` 로 분류 → "옛 productune 프로젝트" 마이그레이션 다이얼로그가 뜬다.
- **(B) 가짜 migration pending**: migration 0004 (`packages/core/migrations/0004-surface-config.md`, `auto_check: jq -e '.surfaces' ...`) 가 방금 만든 프로젝트에서 pending 으로 뜬다. `schema_v` 스탬프도 `surfaces` 도 없으니 session-start hook(`packages/core/scripts/hooks/session-start-doctrine.sh` `build_migration_block()`) 이 `schema_v=0` 으로 간주 → 0004 auto_check exit 0 → pending.

### 조사 결과 (설계 근거)

- migration runner 는 **이미 schema_v 로 게이트한다**: `session-start-doctrine.sh:58` `[ "$id" -le "$schema_v" ] && continue` — `auto_check` 는 `id > schema_v` 일 때만 실행. 따라서 fresh init 이 최신 schema_v 만 정확히 찍으면 (B) 는 runner 수정 없이 해결된다.
- `surfaces` 는 PO doctrine 상 **PO-authored at init** (`persona/po/habit.md` mechanical write whitelist: "surfaces — author at init / update ..."). 코드가 없는 신생 프로젝트는 surfaces 가 비어 있는 게 정당하므로 init 이 placeholder 를 쓰는 설계는 doctrine 위반 + 무의미.
- 현행 po-state.json 은 `schema_version: 1` 필드를 가진다 → "현행 레이아웃인데 config 만 없는" 케이스와 진짜 legacy 를 구별할 마커로 사용 가능.
- Tier1 impact checklist (`docs/po/bookshelf/doctrine-editing.md ## Impact checklist`) 에 이미 "`packages/core/src/init.ts` — fresh init must embody the new layout (incl. latest `schema_v` stamp)" 규정이 있다 — 본 티켓은 코드를 규정에 일치시키는 fix.
- `install.sh:431-437` 이 `packages/core/migrations/*.md` 를 `~/.productune/migrations/` 로 미러링한다 → 런타임에서 최신 migration id 를 derive 할 소스가 2곳 존재.
- `initProject()` 호출처: `project:create` / `project:installAt` / `init:project` / `project:migrateLegacy` (`packages/gui/electron/ipc/project.ts:141-282`). **migrateLegacy 는 진짜 legacy 용** — 여기서 최신 schema_v 를 찍어버리면 backfill migration 들이 건너뛰어진다 → 스탬프 정책 분기 필요.

## §2 Acceptance

- [ ] **AC-1 (fresh init = 완전한 config)**: `initProject()` 가 config.json 이 **존재하지 않던** 디렉터리에서 호출되면 항상 `slug / created_at / version / schema_v` 를 포함한 완전한 config.json 을 쓴다. `schema_v` = 최신 migration id (현재 4).
- [ ] **AC-2 (최신 schema_v derive — 하드코드 부패 방지)**: 최신 id 는 migrations 디렉터리에서 동적으로 derive 한다 — (1차) `packages/core/migrations/` (src-relative, `DOCTRINE_SRC` L304 와 동일한 `fileURLToPath(new URL('../migrations', import.meta.url))` 패턴) → (2차) `~/.productune/migrations/` (install.sh 미러) → (최후) 하드코드 fallback 상수. fallback 상수에는 **guard 검사**가 붙어, 새 migration 파일이 추가됐는데 상수가 안 올라가면 central build/test 에서 fail 한다.
- [ ] **AC-3 (기존/legacy 스탬프 보존 정책)**: 기존 config.json 이 파싱되면 `schema_v` 는 **있는 그대로 보존** (없으면 없는 채로 — 절대 임의 승격 금지). corrupt config → fresh 취급하되 `schema_v` **미스탬프** (migration 재평가가 안전측). `project:migrateLegacy` 경로는 최신 스탬프를 찍지 **않는다** (`stampSchemaV: false` 옵션) → 진짜 legacy 프로젝트는 backfill migration 들이 정상 surface.
- [ ] **AC-4 (fresh 프로젝트 = migration pending 0건)**: GUI 로 새로 만든 프로젝트에서 PO 세션 시작 시 migration 0004 가 pending 으로 뜨지 않는다. init 은 `surfaces` placeholder 를 쓰지 **않는다** (PO-authored 유지, 빈 surfaces 정당). 게이트는 runner 의 기존 `id <= schema_v` skip 으로 충족 — runner(`session-start-doctrine.sh`) 무수정.
- [ ] **AC-5 (detect self-heal)**: `detectProductuneLayout()` — config.json 없음 + **현행 레이아웃 증거** (`turns/` 존재 OR po-state.json 파싱 성공 + 숫자 `schema_version >= 1`) → `self-legacy` 가 아니라 self-heal 대상으로 분류. open 핸들러(`dialog:openFolder`, `project:openKnownDir`)가 config 을 복구 작성 후 `self-current` 로 연다. 증거 없는 진짜 legacy 는 기존대로 legacy 다이얼로그. heal 쓰기 실패 시 throw 없이 `self-legacy` 폴백.
- [ ] **AC-6 (oh-my-eyes 치유)**: `po-state.json(schema_version:1)` + `po.lock` 만 있는 프로젝트를 GUI 에서 열면 — legacy 다이얼로그 없이 열리고, config.json(최신 schema_v 포함) 이 생성되고, migration pending 0건, **onboarding pending 은 재트리거되지 않으며**, 기존 po-state.json / turns/ 내용은 보존된다.
- [ ] **AC-7 (재발 방지 가드)**: PO 세션 시작 경로(`po-session-cycle.ts`)에서 po-state.json 을 쓰기/읽기 전에 config.json 존재를 보장한다 (없으면 동일 heal 헬퍼 호출) → "config 없는 `.productune/`" 상태가 다시 만들어질 수 없다.
- [ ] **AC-8 (회귀 없음)**: `self-current` / `none` 분류, `project:create` / `project:installAt` / onboarding(EntryGate) 플로우 동작 무변경. `bootstrapPersonaMemory` / `bootstrapClaudeSettings` 의 heal-경로 재실행이 멱등(기존 파일 미파괴). `tsc --noEmit` 0 errors (core + gui).

## §3 Out of scope / Dependency

**Out of scope:**
- migration runner(`session-start-doctrine.sh`) 의 게이트/스캔 로직 변경 — 기존 `id <= schema_v` skip 으로 충분.
- `surfaces` 자동 생성/추론 — PO-authored 원칙 유지 (doctrine `po/habit.md`).
- 신규 migration 파일 추가 — 피해 프로젝트 치유는 GUI open-time self-heal(AC-5/6)로 커버, 별도 migration 불필요.
- doctrine 본문 수정 — Tier0/Tier1 규정은 이미 본 동작을 요구하고 있음 (impact checklist 의 init.ts 항목). 코드를 규정에 맞추는 fix 라 doctrine 무변경.
- CLI/headless init 경로 신설.

**Dependency:** 없음 (사용자 자산/외부 입력 불필요).

## §4 Implementation plan

### A. `latestSchemaV()` derive (`packages/core/src/init.ts`)

- `const MIGRATIONS_SRC = fileURLToPath(new URL('../migrations', import.meta.url))` — `DOCTRINE_SRC`(L304) 와 동일 패턴. dist 빌드에서도 `dist/ → ../migrations` 로 동일하게 풀리는지 확인.
- `latestSchemaV(): number`:
  1. `MIGRATIONS_SRC` 존재 시 `*.md` 순회 — frontmatter `id:` (또는 파일명 prefix `^\d{4}`) 파싱, max 취함.
  2. 1 이 비었으면 `~/.productune/migrations/` 동일 스캔.
  3. 둘 다 실패 → `FALLBACK_LATEST_SCHEMA_V` 상수 (현재 4).
- **guard**: `packages/core/` 의 test 스크립트(현재 `"echo 'core: no tests configured yet'"` stub)를 소형 node 검사로 교체 — `migrations/` 디렉터리의 max id 와 `FALLBACK_LATEST_SCHEMA_V` 불일치 시 exit 1. central build 에 포함되는 경로(`pnpm -r test` 등)에서 실행되는지 확인하고, 안 되면 lint/build 체인에 wire.

### B. `initProject()` 스탬프 정책 (`packages/core/src/init.ts` L416-447)

- `InitOptions` 에 `stampSchemaV?: boolean` (default `true`) 추가.
- config 조립 로직:
  - 기존 config 파싱 성공 → `schema_v` 그대로 보존 (현행 L437 유지).
  - 기존 config **부재** + `stampSchemaV !== false` → `schema_v: latestSchemaV()` 스탬프.
  - 기존 config corrupt (파싱 실패) → fresh 취급하되 `schema_v` **생략** — migration 스캔이 auto_check 로 재평가하도록 (안전측: pending 프롬프트는 복구 가능, migration 무단 skip 은 불가역).
- `surfaces` placeholder 미작성 (현행 보존 로직만 유지).
- 호출처 정리 (`packages/gui/electron/ipc/project.ts`): `project:create`(L156) / `project:installAt`(L165) / `init:project`(L142) → default(스탬프). `project:migrateLegacy`(L279) → `stampSchemaV: false`.

### C. `detectProductuneLayout()` self-heal (`packages/gui/electron/ipc/project.ts`)

- detect 는 **순수 판별 유지** (스캔 중 쓰기 금지 — `scanDescendantsForProductune` 이 detect 를 다건 호출함). 새 분류 추가:
  - config.json 없음 + (`turns/` 존재 OR po-state.json 파싱 성공·숫자 `schema_version >= 1`) → `{ kind: 'self-healable', evidence }`.
  - 그 외 기존 hints 만 → `self-legacy` (현행 유지).
- **heal 실행은 open 핸들러에서만**: `dialog:openFolder` / `project:openKnownDir` 가 `self-healable` 을 받으면 `initProject({ slug: basename-derive, projectDir })` (스탬프 on) 호출 → 성공 시 `self-current` 로 반환(+`healed: true` 플래그, renderer 토스트는 선택). 실패 시 `self-legacy` 응답 폴백 (throw 금지).
- heal 경로는 `writeOnboardingPending` 을 호출하지 **않는다** — 이미 PO 세션이 돈 프로젝트의 onboarding 재트리거 방지 (AC-6).
- `scanDescendantsForProductune`: `self-healable` 은 표시용으로 current 처럼 포함하되 **쓰기 없음** (실제 heal 은 그 프로젝트를 열 때).
- renderer 측 `kind` 분기 확인: `self-healable` 이 renderer 까지 새 값으로 새지 않도록 main 프로세스 안에서 `self-current`/`self-legacy` 로 정규화해 반환 (renderer 무수정이 이상적).

### D. PO 세션 가드 (`packages/gui/electron/po-session-cycle.ts`)

- po-state.json 경로(L60) 사용 전, config.json 부재 시 C 의 heal 헬퍼 호출 (현행 레이아웃 증거 불요 — 세션을 여는 시점이면 GUI 가 이미 프로젝트로 취급 중). 실패해도 세션 진행은 막지 않음 (best-effort, non-fatal).

### E. Impact checklist sweep (`docs/po/bookshelf/doctrine-editing.md`)

| Surface | 영향 |
|:--|:--|
| Tier0 doctrine + mirror | n/a — 규정 무변경 (코드를 기존 규정에 일치시킴) |
| Tier1/Tier2 docs | n/a |
| Agent pointers | n/a |
| `packages/core/src/init.ts` | **본 티켓 핵심** — §4.A/B |
| `packages/core/scripts/install.sh` | 무수정 — migrations 미러(L431-437)는 derive 2차 소스로 그대로 사용. QA 에서 미러 경로 fallback 동작만 확인 |
| `packages/core/migrations/` | 신규 migration 불필요 (self-heal 이 피해 프로젝트 커버). derive 가 향후 0005 추가 시 자동 추종 + guard 검사 |
| Onboarding (`onboarding.ts`) | heal 경로에서 onboarding pending 미작성 — 회귀 확인만 |
| GUI detect (`project.ts`) | **본 티켓 핵심** — §4.C |
| `bootstrapPersonaMemory` | 무수정 — heal 재실행 멱등성 QA 확인 |

### F. 검증 순서

1. core: `latestSchemaV()` 가 repo 의 migrations 에서 4 를 derive; guard 검사 green; `tsc --noEmit` 0.
2. fresh init (tmp dir): config.json 에 `schema_v: 4` 포함 완전체; `surfaces` 없음.
3. session-start hook 시뮬레이션: 해당 프로젝트에서 `build_migration_block` → pending 없음.
4. oh-my-eyes 재현 fixture (`po-state.json{schema_version:1}` + `po.lock` only): GUI open → legacy 다이얼로그 없음, config 생성, po-state 보존, onboarding 미트리거.
5. 진짜 legacy fixture (`briefs/` only 또는 schema_version 없는 po-state): 기존 legacy 다이얼로그 유지; `migrateLegacy` 후 config 에 `schema_v` 없음 → migration 0004 정상 pending.
6. corrupt config fixture: 재init 후 `schema_v` 미스탬프 확인.

## §5 QA — smoke

| Area | Check |
|:--|:--|
| build | `tsc --noEmit` 0 errors (core+gui); core guard 검사 green |
| fresh init | 새 프로젝트 config.json = slug/created_at/version/`schema_v:4` 완전체, `surfaces` placeholder 없음 (AC-1/4) |
| derive | migrations src 경로 제거(시뮬) 시 `~/.productune/migrations` 폴백 → 동일 값; 둘 다 없으면 fallback 상수 (AC-2) |
| guard | migrations 에 가짜 `0005-*.md` 추가 시 guard 검사 fail (AC-2) |
| migration gate | fresh 프로젝트 PO 세션 시작 → pending migration 0건 (AC-4) |
| self-heal | po-state(schema_version 1)+po.lock only 프로젝트 open → 다이얼로그 없음, config 생성, healed 후 재open 도 정상 (AC-5/6) |
| legacy 보존 | 증거 없는 legacy fixture → 다이얼로그 유지; migrateLegacy 후 schema_v 미스탬프 → 0004 pending 정상 (AC-3/5) |
| onboarding | heal 경로에서 onboarding pending 미작성; project:create/installAt 의 pending 작성은 기존대로 (AC-6/8) |
| idempotence | healed 프로젝트의 기존 po-state.json/turns/ 바이트 보존; bootstrap 재실행 무파괴 (AC-6/8) |
| po-session guard | config 없는 dir 에서 PO 세션 시작 → config 자동 생성 (AC-7) |
| regression | self-current/none 분류, recents, EntryGate 플로우 무변경 (AC-8) |
