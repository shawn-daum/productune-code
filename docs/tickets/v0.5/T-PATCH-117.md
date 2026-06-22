---
ticket_id: T-PATCH-117
version: v0.5
round: patch
type: impl
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: high
estimated_complexity: L3
qa_status: pending
qa_loops: 0
slug: init-parity-cli-gui
area_tags: [core/init, core/cli, core/install, core/test]
created_at: 2026-06-11
---

# T-PATCH-117 — CLI `productune init` 와 GUI `initProject()` 가 서로 다른 프로젝트를 만든다 → 단일 소스 init 으로 통합 + parity 자동 검증

## §1. Request

shawn (ad-hoc, 사용자 승인 작업): bash CLI `productune init` (`packages/core/scripts/productune` init 핸들러 L286-349) 와 GUI 의 TS `initProject()` (`packages/core/src/init.ts`, Electron IPC 호출) 가 **서로 다른 프로젝트 초기화 결과물**을 만든다. 두 경로를 통합하고, 자동 parity 검증으로 재발을 막는다.

### 조사 결과 — 실측 divergence 목록

| # | 항목 | bash `productune init` | TS `initProject()` |
|:--|:--|:--|:--|
| 1 | `.productune/config.json` | **아예 안 씀** (schema_v 포함 0건) | 완전체 + 최신 `schema_v` 스탬프 (T-PATCH-112) |
| 2 | `.claude/settings.local.json` | **안 씀** (`bootstrapClaudeSettings` 미호출) | 기본 권한 템플릿 작성 + foreign-user 검출 |
| 3 | persona 메모리 dirs | **legacy `docs/pdt-designer/` 등 `pdt-*` 명명** + `.gitkeep` 만 | `docs/po|designer|developer|qa/` + habit shell + bookshelf seed + backlog/PRD stub + turns/ |
| 4 | `.productune/po-state.json` | **skeleton 작성** (doctrine 위반 — lifecycle-owned, T-PATCH-102 §3) | 안 씀 (정합) |
| 5 | `.gitignore` | `# productune` 블록 (`.productune/po.lock`, `.productune/logs/`) | `.claude/settings.local.json` 1줄만 (po.lock/logs **누락**) |
| 6 | doctrine bootstrap env seed | `bootstrap-doctrine.sh` → `MY_PO_ENGINE=claude` | `bootstrapUserGlobalDoctrine()` → **`engine=claude`** (install.sh 정본과 불일치) |
| 7 | git init | 인터랙티브 git init preamble | 없음 |

→ 1·2 가 사용자 가시 버그 (CLI-init 프로젝트를 GUI 로 열면 legacy 다이얼로그 + 가짜 migration pending — T-PATCH-112 (A)(B) 증상과 동일 root), 3~6 은 잠복 drift. 6 은 "두 구현 유지" 전략이 실제로 어떻게 썩는지 보여주는 산 증거.

### 배포 형태 검증 (전략 결정의 전제)

- `install.sh` 는 CLI 를 **repo clone 심볼릭 링크**로 배포한다 (`$ROOT/scripts/productune` → PATH / `~/.local/bin` / `/usr/local/bin`). `~/.productune/` 에는 doctrine/config/migrations **미러만** 들어가고, 코드 번들은 들어가지 않는다.
- `packages/core/dist/` 는 **gitignored** 이고 install.sh 는 빌드 스텝이 없다 → **CLI 사용자 머신에 dist 는 보장되지 않는다.**
- 반면 **node 는 사실상 보장**된다: install.sh preflight 가 Claude Code(node CLI)를 npm 으로 설치·검증하며, npm 부재 시 die. `git pull` 로 업데이트하는 배포 모델이므로 **소스 파일은 항상 최신**이다.

## §2. Acceptance

- [ ] **AC-1 (단일 소스)**: CLI `productune init` 와 GUI `initProject()` 가 **동일한 공유 구현** (`packages/core/scripts/lib/init-project.mjs`) 을 실행한다. bash init 핸들러의 인라인 스캐폴딩(po-state skeleton / `docs/pdt-*/` / gitignore / doctrine source)은 제거되고 node 호출로 대체된다.
- [ ] **AC-2 (CLI init = 완전한 config)**: CLI 로 init 한 프로젝트에 `slug / created_at / version / schema_v(최신, latestSchemaV() derive)` 를 포함한 완전한 `.productune/config.json` 이 생긴다. T-PATCH-112 스탬프 정책 보존: 기존 config 파싱 성공 → `schema_v` 있는 그대로 보존, corrupt → 미스탬프, `stampSchemaV:false`(migrateLegacy) → 미스탬프.
- [ ] **AC-3 (파일트리 동등 — union 스펙)**: 양 경로 산출물이 동일하다 — config.json 내용(schema_v 포함), `.claude/settings.local.json`(bootstrapClaudeSettings 시맨틱), persona 스켈레톤(bootstrapPersonaMemory 전체), `.gitignore` **union 블록**(`.productune/po.lock` + `.productune/logs/` + `.claude/settings.local.json`). GUI 경로는 po.lock/logs 엔트리를 **새로 얻는다** (기존 누락 수정).
- [ ] **AC-4 (자동 parity 검증)**: `packages/core/test/init-parity.mjs` — tmp dir A 에 실제 `scripts/productune init`(non-TTY, sandbox `HOME`, `--skip-doctrine`), tmp dir B 에 dist `initProject()` 실행 → 휘발 필드(`created_at`, slug, settings 의 절대경로) 정규화 후 **파일트리 + 파일 내용 diff = 0** 단언, 불일치 시 exit 1. core `npm test` 체인에 wire (schema-v-guard 와 병렬, central build 포함).
- [ ] **AC-5 (lifecycle ownership 정합)**: 통합 init 은 `.productune/po-state.json` 을 **쓰지 않는다** (PO/lifecycle-owned — T-PATCH-102 §3, T-PATCH-112 §1). CLI 기본 모드의 기존 po-state seed(`scripts/productune` L394-404)가 첫 세션에서 skeleton 을 만드는 동작 무변경. legacy `docs/pdt-*/` dirs 는 더 이상 생성되지 않는다.
- [ ] **AC-6 (doctrine bootstrap 통합)**: CLI init 의 user-global doctrine 설치가 공유 구현(`bootstrapUserGlobalDoctrine` 시맨틱: 해시 비교 + .bak 백업 + 미러)을 경유한다. `productune.env` seed 키를 install.sh 정본인 **`MY_PO_ENGINE=claude`** 로 통일 (현 TS 의 `engine=claude` drift 수정 — seed-only 라 기존 파일 무파괴). `--skip-doctrine` 플래그 동작 보존. `scripts/lib/bootstrap-doctrine.sh` 는 유일 호출처가 사라지므로 제거.
- [ ] **AC-7 (기존 CLI-init 프로젝트 heal)**: (a) **GUI 측** — 구버전 CLI 로 init 된 프로젝트(config 부재 + po-state `schema_version:1`)를 GUI 로 열면 T-PATCH-112 self-heal 경로가 config **및** `.claude/settings.local.json` **및** gitignore union 블록까지 복구함을 검증 (heal 이 `initProject()` 를 호출하므로 신규 코드 없이 충족 예상 — QA 확인 필수). (b) **CLI 측** — `productune init` 재실행 = 멱등 heal (no-overwrite, 누락분만 보충). (c) CLI 기본 모드(세션 시작)에 경량 가드: `.productune/` 존재 + config.json 부재 → 공유 entry 를 best-effort 호출(실패해도 세션 진행, non-fatal) — T-PATCH-112 AC-7 의 CLI 대응물.
- [ ] **AC-8 (회귀 없음)**: GUI 호출처 4곳(`project:create`/`project:installAt`/`init:project`/`project:migrateLegacy` — `stampSchemaV:false` 포함) 시그니처·동작 무변경. git init 인터랙티브 preamble 은 bash 전용 유지(parity 범위에서 `.git` 제외). CLI init 은 onboarding pending 을 쓰지 않는다(현행 유지). `tsc --noEmit` 0 errors (core+gui), schema-v-guard green, GUI electron 번들 빌드 green (.mjs import 인라인 확인).

## §3. Out of scope / Dependency

**Out of scope:**
- 구버전 CLI-init 프로젝트의 stale `docs/pdt-*/` dirs 정리 — 무해한 잔재(.gitkeep 뿐), 파괴적 삭제 금지 원칙상 방치. 필요 시 후속 migration.
- git init preamble 의 통합/이식 — GUI 에 git init 을 추가하는 것은 별도 product 결정.
- migration 파일 신규 추가 — GUI-init 프로젝트의 gitignore po.lock/logs 누락은 idempotent 재init/heal 로 보충되므로 migration 불요.
- doctrine 본문 수정 — Tier1 impact checklist 의 init.ts 항목이 이미 본 동작을 요구. 코드를 규정에 맞추는 fix.
- CLI 의 onboarding/PRD 플로우 변경.

**Dependency:** T-PATCH-112 (merged) — schema_v 스탬프 정책 + `latestSchemaV()` + self-heal 경로를 그대로 계승.

## §4. Implementation plan

### A. 전략 결정 — (b) 단일 소스, **no-build node ESM entry** 채택

| 전략 | 내용 | 판정 |
|:--|:--|:--|
| (a) bash → `node dist/init.js` shell-out | dist 가 gitignored + install.sh 무빌드 → CLI 사용자에 dist 미보장. install.sh 에 빌드 추가 시 network/typescript 의존 + **`git pull` 후 stale-dist** 로 drift 가 뒷문으로 재유입 | ✗ |
| **(b) 공유 entry `init-project.mjs` (채택)** | 구현을 **빌드 불필요한 plain ESM `.mjs`** 로 추출 — bash 는 `node` 직접 실행(노드는 Claude Code 의존으로 보장), TS `init.ts` 는 타입 유지 thin wrapper 로 위임. `git pull` = 즉시 최신, 설치 스텝 0 | ✓ |
| (c) 두 구현 + parity contract test | drift 를 PR 시점에 잡을 뿐 **이중 구현 비용 영구** — divergence #6(env seed)이 이미 이 모델의 실패 증거 | ✗ (단, parity test 자체는 AC-4 검증 수단으로 채택과 무관하게 도입) |

### B. 공유 구현 `packages/core/scripts/lib/init-project.mjs` (신규 — SoT)

- plain node ESM, `// @ts-check` + JSDoc 타입. 현 `src/init.ts` 의 구현 본문 이식: `initProject` / `bootstrapPersonaMemory` / `bootstrapClaudeSettings` / `bootstrapUserGlobalDoctrine` / `latestSchemaV` / `FALLBACK_LATEST_SCHEMA_V`.
- **union 동작 추가**: `ensureGitignoreEntry` 를 다건 엔트리로 확장 — `.productune/po.lock`, `.productune/logs/`, `.claude/settings.local.json` (각 라인 멱등 append, 기존 grep 정확 매치 시 skip).
- **env seed 통일**: doctrine bootstrap 의 `productune.env` seed 를 `MY_PO_ENGINE=claude` 로 (install.sh 정본). seed-only — 기존 파일 무수정. 구현 시 `engine=` 키를 읽는 코드가 없는지 grep 으로 확인.
- 경로 derive: `DOCTRINE_SRC`/`MIGRATIONS_SRC` 는 import.meta.url 기준이 아닌 **명시 인자 우선** — CLI 가 `--core-root "$DOCTRINE_ROOT"` 로 주입, 미지정 시 `new URL('../../', import.meta.url)` 폴백 + `existsSync` 가드 + `~/.productune/migrations` 2차 소스 (latestSchemaV 기존 체인 유지). 번들/asar 환경에서 import.meta.url 이 틀어져도 안전.
- CLI 인자: `--slug <s> --project-dir <abs> [--skip-doctrine] [--stamp-schema-v false] [--core-root <abs>]`. stdout 에 `created:`/`kept:` 트레이스(현행 bash say 톤 유지), 실패 시 exit 1.
- po-state.json / onboarding **미작성** (AC-5, 현행 TS 정합).

### C. bash init 핸들러 교체 (`packages/core/scripts/productune` L286-349)

- git init preamble (L256-284) **유지** — 인터랙티브 UX, parity 범위 외.
- 인라인 스텝 1)~3) + bootstrap-doctrine sourcing 제거 → 1회 호출로 대체:
  `node "$SCRIPTS_DIR/lib/init-project.mjs" --slug "$(basename "$PROJECT_ROOT")" --project-dir "$PROJECT_ROOT" --core-root "$DOCTRINE_ROOT" ${SKIP_DOCTRINE:+--skip-doctrine}`
- `command -v node` 가드: 부재 시 die + 안내(이론상 도달 불가 — install.sh 가 npm 보장). 헤더 주석(L10)의 "po-state.json, docs/pdt-*/" 문구를 새 산출물 설명으로 갱신.
- 기본 모드 경량 가드(AC-7c): `.productune/` 존재 + `config.json` 부재 시 동일 entry 를 best-effort 호출 (`|| warn`, 세션 비차단).
- `scripts/lib/bootstrap-doctrine.sh` 삭제 (유일 호출처 소멸 — uninstall.sh 등 타 참조 없음 확인됨).

### D. `src/init.ts` thin wrapper 전환

- 인터페이스(`ProjectConfig`/`InitOptions`/`SurfaceConfig`) + export 시그니처 **그대로 유지** → GUI `project.ts` 호출처 4곳 무수정.
- 구현 본문을 `../scripts/lib/init-project.mjs` import 로 위임. tsc 해석용 hand-written `init-project.d.mts` 동봉 (또는 core tsconfig `allowJs`+`checkJs` — 빌드 출력 오염 없는 쪽 선택).
- `test/schema-v-guard.mjs` 는 dist 경유 import 이므로 시그니처 유지로 무수정 통과 예상 — 확인.

### E. parity 테스트 `packages/core/test/init-parity.mjs` (AC-4)

1. sandbox: `HOME=$(mktemp -d)` (실 사용자 `~/.productune` 오염 금지), tmpA/tmpB 생성.
2. tmpA: `bash scripts/productune init --skip-doctrine` 를 non-TTY 로 실행 (git init 은 non-TTY 분기 — tmpA 가 repo 밖이므로 무조건 `git init` 경로 → diff 에서 `.git/` 제외).
3. tmpB: `node -e 'import("./dist/init.js").then(m => m.initProject({slug, projectDir, skipDoctrine: true}))'`.
4. 정규화: config.json 의 `created_at`/`slug`, settings.local.json 의 절대경로(`/…/tmpA` ↔ `/…/tmpB`) 치환.
5. 재귀 파일트리 목록 + 파일별 내용 비교 (`.git/` 제외) → diff 0 단언, 위반 시 목록 출력 + exit 1.
6. wire: core `package.json` `"test": "node test/schema-v-guard.mjs && node test/init-parity.mjs"`.

### F. heal / migration 스토리 (AC-7)

- **신규 코드 최소**: 구 CLI-init 프로젝트 = "config 부재 + po-state(schema_version:1)" = T-PATCH-112 `self-healable` 분류 그대로 → GUI open heal 이 `initProject()` 를 호출하므로 **config + claude settings + gitignore union 까지 자동 복구** (settings 는 `bootstrapClaudeSettings` 가 init 체인에 있으므로 추가 spec 불요 — QA 로 검증만).
- gitignore union 확장에 따라 heal/재init 시 GUI-init 기존 프로젝트도 po.lock/logs 라인을 멱등 보충받는다 (migration 불요 근거).
- CLI 측 heal = §4.C 의 재init 멱등성 + 기본 모드 가드.

### G. Impact checklist sweep (`docs/po/bookshelf/doctrine-editing.md ## Impact checklist`)

| Surface | 영향 |
|:--|:--|
| Tier 0 doctrine + mirror | n/a — 규정 무변경 (코드를 기존 규정에 일치) |
| Tier 1/2 docs | n/a |
| Agent pointers | n/a |
| `packages/core/src/init.ts` | **핵심** — §4.D thin wrapper 전환, 시그니처 보존 |
| `packages/core/scripts/productune` | **핵심** — §4.C init 핸들러 교체 + 기본모드 가드 + 헤더 주석 갱신 |
| `packages/core/scripts/install.sh` | 경미 — 배포 모델 무변경(clone 심볼릭 링크). preflight 에 `command -v node` die 추가 검토(현재 claude 설치 경유 간접 보장). migrations 미러(L433-438)는 derive 2차 소스로 현행 유지 |
| `packages/core/scripts/lib/bootstrap-doctrine.sh` | **삭제** — 공유 entry 로 흡수 (§4.C) |
| `packages/core/migrations/` | n/a — 신규 migration 불요 (idempotent heal 로 충족, §4.F) |
| Onboarding (`onboarding.ts`) | n/a — CLI init 은 onboarding 미작성 유지, 회귀 확인만 |
| GUI detect (`project.ts` `detectProductuneLayout`) | 무수정 — CLI-init 프로젝트가 이제 config 보유 → `self-current` 분류 확인 |
| `bootstrapPersonaMemory` | 이동(.mjs) — 동작 동일, 멱등성 QA |

### H. 검증 순서

1. core: `.mjs` 추출 후 `tsc --noEmit` 0 (core+gui), schema-v-guard green.
2. parity 테스트 단독 실행 green (tmp/sandbox HOME).
3. CLI 실전: tmp dir 에서 `productune init` → config(schema_v 최신)/claude settings/persona 스켈레톤/gitignore union 생성, `docs/pdt-*/`·po-state **미생성** 확인.
4. CLI 재실행 멱등 (kept 트레이스, 무파괴).
5. 구버전 CLI-init fixture (po-state only) → GUI open: legacy 다이얼로그 없음, settings.local.json 까지 heal.
6. GUI `project:create` / `migrateLegacy`(stampSchemaV:false → schema_v 미스탬프) 회귀 확인.
7. GUI electron 번들 빌드 green — `.mjs` import 인라인/경로 폴백 동작 확인.

## §5. QA — smoke

| Area | Check |
|:--|:--|
| build | `tsc --noEmit` 0 errors (core+gui); core `npm test` (schema-v-guard + init-parity) green; GUI electron 빌드 green |
| parity | init-parity.mjs: CLI vs GUI 산출물 파일트리+내용 diff 0 (정규화 후); 의도적 한쪽 변경 시 fail 확인 (AC-4) |
| CLI init | config.json 완전체(`schema_v` 최신)/`.claude/settings.local.json`/persona 스켈레톤/gitignore union 생성; po-state·`docs/pdt-*/`·onboarding 미작성 (AC-1/2/3/5) |
| idempotence | `productune init` 재실행 무파괴(kept), 누락분만 보충; GUI initProject 재실행 동일 (AC-7b) |
| doctrine | CLI init 후 `~/.productune/doctrine/` 미러 + `productune.env` seed `MY_PO_ENGINE=claude`(기존 파일 무수정); `--skip-doctrine` 시 미설치 (AC-6) |
| heal | 구 CLI-init fixture GUI open → 다이얼로그 없음 + config + settings + gitignore heal; CLI 기본모드 config-부재 가드 동작 (AC-7) |
| stamp 정책 | migrateLegacy(`stampSchemaV:false`) → schema_v 미스탬프; corrupt config → 미스탬프; 기존 config 보존 (AC-2) |
| po-state | CLI 첫 세션에서 기본모드 seed 가 po-state skeleton 생성 (기존 동작 유지, AC-5) |
| regression | GUI 호출처 4곳 무변경 동작; detect 가 CLI-init 프로젝트를 `self-current` 분류; git init preamble 인터랙티브/non-TTY 분기 유지 (AC-8) |

## §6. QA fix-2 (T-PATCH-117 qa-fix-2)

**크래시 재현**: `pnpm -C packages/gui build` 후 `pnpm exec electron .` 실행 시 `App threw an error during load / TypeError [ERR_INVALID_URL_SCHEME]: The URL must be of scheme file` 으로 앱이 시작조차 못 함.

**실제 원인**: 최초 가설(init-project.mjs L40 `/* @vite-ignore */`)은 틀렸다. 그 줄은 `resolveCoreRoot` 함수 본문 안에 있어 모듈 로드 시점에 실행되지 않으므로 안전하다. 실제 크래시는 `packages/core/src/init.ts` 모듈 스코프 L23 `const _coreRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')` 에서 발생. vite-plugin-electron 이 core 패키지를 CJS electron 번들에 인라인할 때 해당 모듈의 `import.meta.url` 이 `data:text/javascript;base64,...` 가상 URL 로 치환되며, `fileURLToPath` 는 `file:` 외 스킴을 즉시 거부한다. 번들 증거(`dist-electron/main-GcM0T2a1.js` L353): `const _coreRoot = path.resolve(url.fileURLToPath(new URL("data:text/javascript;base64,ZXhwb3J0IHsgaW5pdFByb2plY3Q...", ...)`. 이 라인이 모듈 로드 타임 톱레벨 실행이므로 앱 시작 즉시 throw.

**`/* @vite-ignore */` 결정**: `init-project.mjs` L40 의 주석은 제거하지 않는다. 해당 줄은 함수 본문이므로 로드 크래시와 무관하며, Vite 가 번들 시 CJS `__filename` 폴백으로 이미 안전하게 재작성하고 있다. 주석 제거 시 불필요한 build warning 이 추가될 뿐 이득이 없다.

**수정**: `packages/core/src/init.ts` 의 톱레벨 `_coreRoot` 계산을 `_deriveCoreRoot()` 함수로 감싸고, `import.meta.url` 이 `file:` 로 시작하는 경우만 `fileURLToPath` 를 호출한다. 실패 또는 비-file: 스킴이면 CJS 번들에서 주입되는 `__dirname` 폴백을 시도하고, 그마저 없으면 `null` 을 반환한다. `null` 은 기존 `resolveCoreRoot` fallback 체인(existsSync 검사 → `~/.productune`)으로 흘러 throw 없이 처리된다.

**검증 결과**:
- `tsc --noEmit` 0 errors (core, gui)
- `pnpm -C packages/core test`: schema-v-guard 2 passed, init-parity 1 passed (17 files, diff 0)
- `pnpm -C packages/gui build`: electron main 빌드 clean, 새 번들에서 `data:text/javascript;base64` 패턴 사라짐, `_deriveCoreRoot` 함수 + `__dirname` 폴백 확인
- boot smoke: `pnpm exec electron .` 8초 가동 후 정상 종료, `App threw an error during load` / ERR_INVALID_URL_SCHEME 0건
