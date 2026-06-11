---
ticket_id: T-PATCH-102
title: "productune init — doctrine 정합 스캐폴딩 (artifacts/prd/backlog/tickets/briefs 누락 해소, ENOENT 차단)"
version: v0.5
round: patch
type: feature
status: done
assignee: pdt-developer
estimated_complexity: L2
model: sonnet
effort: medium
risk_flags: none
slug: init-scaffold-doctrine-align
qa_status: pass
qa_loops: 0
area_tags: [core/init, infra/scaffold]
created_at: 2026-06-10
---

| T-PATCH-102 | init-scaffold-doctrine-align | done |

# T-PATCH-102: productune init — doctrine 정합 스캐폴딩

> `productune init`(= `initProject` / `bootstrapPersonaMemory`)가 **현재 doctrine 이 전제하는 디렉터리·파일 구조를 다 만들지 않는다.** 그 결과 프로젝트 첫날부터 구조 drift 가 생기고, GUI 가 `docs/prd/versions/`·`docs/artifacts/<version>/` 같은 경로를 읽으려다 `artifacts:readFile`/scan 경로에서 ENOENT 류 런타임 에러를 맞는다. 본 티켓은 init 이 fresh project 에 대해 doctrine 정합 골격을 **idempotent + no-overwrite** 로 깔도록 보강한다.

## 1. Request

### 증상 — drift + ENOENT

`packages/core/src/init.ts`의 `bootstrapPersonaMemory`(line 175–232)가 현재 만드는 것:
- `.productune/`(`config.json`, `turns/` + `turns/README.md`) — `initProject`(line 349–380)가 `config.json` 작성.
- `docs/{po,designer,developer,qa}/habit.md` (Tier-1 habit shell).
- bookshelf 시드: `docs/qa/bookshelf/fail-patterns.md`, `docs/developer/bookshelf/project-notes.md`, `docs/designer/bookshelf/decisions.md`, `docs/designer/feature-history.md`.
- `.claude/settings.local.json` + `.gitignore` (`bootstrapClaudeSettings`).

doctrine 가 참조하지만 init 이 **만들지 않는** 경로(=drift 원천):
- `docs/artifacts/<version>/manifest.json` — `designer/bookshelf/artifact-manifest-schema.md`: "GUI 는 manifest 를 읽는다(디렉터리 glob 아님)". GUI `artifacts:listScoped`(`packages/gui/electron/ipc/artifacts.ts:97–120`)가 `docs/artifacts/<currentVersion>/`를 `scanDir` → `loadManifest`로 스캔. 디렉터리/매니페스트 부재 시 `scanDir`은 `fs.existsSync` 가드(line 61)로 빈 결과를 돌려주지만, **manifest 가 doctrine SoT 인데 물리적으로 없으면** designer/PO 의 첫 artifact write·manifest 갱신 시 매번 디렉터리를 새로 만들어야 하고 lint(`scripts/ci/check-artifact-manifest.sh`) 기준점이 없다.
- `docs/prd/PRD.md` + `docs/prd/versions/` — `po/bookshelf/lifecycle/p1-prd.md`: PRD.md = 단일 SoT(GUI 가 직접 렌더). `p5-close.md`는 `mkdir -p docs/prd/versions docs/designer/archive`로 스냅샷을 떨군다. `pre-phase-gate-guard.sh` G5 는 직전 closed 버전의 `docs/prd/versions/<v>.md` 스냅샷이 없으면 새 버전 open 을 막는다 → 디렉터리 골격이 없으면 GUI write path 가 ENOENT 를 맞을 수 있다.
- `docs/backlog.md` — `po/habit.md:4` mechanical write whitelist (e) `docs/backlog.md` append. append 대상인데 파일이 없으면 첫 append 가 곧 create 가 되어, 빈 골격 부재 자체가 drift.
- `docs/tickets/<version>/` — `po/bookshelf/delegation.md:28`: PO 가 `docs/tickets/<version>/T-NNN.md` lifecycle 메타를 갱신. Designer 가 티켓을 발행하는 디렉터리.
- `briefs/` — `po/habit.md:4`(d) + `delegation.md:41`: `briefs/<slug>.md` append (subagent needs-info 응답 누적).
- `docs/designer/archive/` — `p5-close.md` master archive(`mkdir -p ... docs/designer/archive`).

### Task

init 이 fresh project 에 대해 위 골격을 doctrine 정합하게 만들도록 보강한다. 각 경로마다 **(빈 디렉터리 / 시드 파일 / lifecycle 위임)** 중 무엇인지 §4 에서 확정한다. 절대 규칙: **idempotent**(재실행 안전) + **no-overwrite**(존재 시 건드리지 않음, 기존 `ensureFile` 계약). 버전 표기 디렉터리에 쓸 **초기 버전 id**는 config 의 `initial_version`(`^v\d+(\.\d+)?$`, 예 `v0.5`)을 따른다 — 없으면 버전 표기 디렉터리는 만들지 않고 lifecycle(P1)에 위임한다.

## 2. Acceptance

idempotent·no-overwrite 는 모든 항목 공통 — `ensureFile`(line 169–173) 및 `fs.mkdirSync(..., {recursive:true})` 사용. 재실행 시 기존 파일/디렉터리 절대 덮어쓰지 않음.

- [x] **[AC-1] `docs/backlog.md`** — 부재 시 빈 골격 시드 파일 생성(헤더 1줄 + `## Entries`). 존재 시 no-op.
- [x] **[AC-2] `docs/prd/PRD.md`** — 부재 시 최소 stub 시드(헤더 + "P1 에서 Designer 가 작성" 안내 1줄). 존재 시 no-op. (PRD 본문 content 는 lifecycle 소유 — stub 은 골격용 placeholder.)
- [x] **[AC-3] `docs/prd/versions/`** — 빈 디렉터리 생성(`.gitkeep` 시드로 git 추적). 존재 시 no-op.
- [x] **[AC-4] `docs/designer/archive/`** — 빈 디렉터리 생성(`.gitkeep`). 존재 시 no-op.
- [x] **[AC-5] `briefs/`** — 빈 디렉터리 생성(`.gitkeep`). 존재 시 no-op.
- [x] **[AC-6] 버전 표기 디렉터리** — `config.initial_version` 이 있고 `^v\d+(\.\d+)?$` 에 매치할 때만:
  - `docs/artifacts/<initial_version>/manifest.json` — 부재 시 **schema-valid 빈 매니페스트** 생성(`{ "schema_v": 1, "version": "<initial_version>", "entries": [] }`, `artifact-manifest-schema.md` schema_v 1). 존재 시 no-op.
  - `docs/tickets/<initial_version>/` — 빈 디렉터리(`.gitkeep`). 존재 시 no-op.
  - `initial_version` 부재/형식 불일치 → 버전 표기 디렉터리 **생성하지 않음**(§3, lifecycle 위임).
- [x] **[AC-7] idempotent 재실행** — 동일 `projectDir`에 `initProject` 2회 호출 시 두 번째 호출이 어떤 시드 파일도 덮어쓰지 않고(내용·mtime 보존), 에러 없이 동일 config 반환.
- [x] **[AC-8] no-overwrite** — 사용자가 미리 채워둔 `docs/backlog.md`/`docs/prd/PRD.md`/`manifest.json` 가 있으면 init 이 보존(content 동일).
- [x] **[AC-9] GUI day-one** — fresh project(`initial_version` 지정)에서 `artifacts:listScoped(projectDir, initial_version)` 호출이 ENOENT 없이 빈 배열을 반환(매니페스트 디렉터리 존재).

## 3. Out of scope — lifecycle 위임 (init 이 만들지 않음)

다음은 **의도적으로 init 가 만들지 않고 lifecycle(PO/Designer mechanical write)에 남긴다.** 근거 명시:

- **`.productune/po-state.json`** — PO 가 mechanical-write whitelist(`po/habit.md:4` b)로 소유. `current_version`·`versions[]`·`recent_turns` 등 동적 상태이며 P1 진입(`git checkout -b v<N>`) 시 PO 가 작성. init 이 빈 po-state 를 깔면 PO 의 첫 write 와 schema 충돌·stale 위험 → **lifecycle 소유 유지**.
- **`docs/prd/versions/<v>.md` 스냅샷 파일** — P5 close 의 archival 산출물(`p5-close.md` master archive). init 은 **디렉터리 골격만**(AC-3) 만들고 스냅샷 파일 자체는 close 가 생성.
- **`docs/designer/archive/design-system-<v>.md`** + **`docs/designer/design-system.md`** — DS 스냅샷/마스터는 Designer lifecycle 산출물. init 은 archive **디렉터리만**(AC-4).
- **`docs/artifacts/<v>/<id|slug>.<ext>` artifact 파일** — Designer write-map 소유(`delegation.md:35`). init 은 **빈 매니페스트만**(AC-6); 실제 artifact 파일·entry 는 Designer 가 write 시 추가.
- **`docs/tickets/<v>/T-NNN.md` 티켓 파일** — Designer 발행. init 은 **디렉터리만**(AC-6).
- **`briefs/<slug>.md` 파일** — PO append 소유. init 은 **디렉터리만**(AC-5).
- **`config.version` 값 변경·migration** — 본 티켓 범위 밖(현 `'0.4.0'` 하드코딩 유지).
- **CLI 경로 doctrine bootstrap**(`scripts/lib/bootstrap-doctrine.sh`) 변경 — 본 티켓은 `bootstrapPersonaMemory`(프로젝트 스캐폴딩)만 손댄다.

## 4. Implementation plan

> 핵심: `bootstrapPersonaMemory`(line 175–232)를 확장해 doctrine 정합 골격을 추가한다. 기존 `ensureFile`(no-overwrite) + `fs.mkdirSync(recursive)` 패턴만 사용. 버전 표기 디렉터리는 `config.initial_version` 를 인자로 받아 조건부 생성.

### (A) 시그니처 — initial version 전달

- `bootstrapPersonaMemory(projectDir)` → `bootstrapPersonaMemory(projectDir, initialVersionId?: string)` 로 확장(선택 2번째 인자, 하위호환).
- `initProject`(line 376)에서 `bootstrapPersonaMemory(opts.projectDir, config.initial_version)` 로 호출 — config 가 이미 `initial_version` 을 보유(line 371). 별도 파싱 불필요.
- 버전 id 검증: `init.ts` 안에 작은 가드 추가 — `const VERSION_ID_RE = /^v\d+(\.\d+)?$/`. `initialVersionId && VERSION_ID_RE.test(initialVersionId)` 일 때만 버전 표기 디렉터리 생성. (GUI `lib/version-id.ts:10` 와 동일 정규식 — core 는 GUI 에 의존 못 하므로 로컬 상수로 둠. 주석에 출처 동치 명시.)

### (B) 버전-무관 골격 (항상 생성)

`bootstrapPersonaMemory` 끝부분(turnsDir 블록 뒤, line 231)에 추가:

1. **`docs/backlog.md`** — `ensureFile`:
   ```
   # Backlog\n\n다음 버전 후보. PO 가 P5 close 또는 사용자 요청 시 append.\n`- (YYYY-MM-DD) <area-tag> · <one-line>`\n\n## Entries\n
   ```
2. **`docs/prd/PRD.md`** — `ensureFile` (stub):
   ```
   # PRD\n\n단일 SoT. P1 에서 Designer 가 clarity-loop 로 작성한다(`lifecycle/p1-prd.md`).\nGUI 는 이 파일을 직접 렌더한다.\n
   ```
3. **빈 디렉터리 + `.gitkeep`** (git 이 빈 디렉터리를 추적 못 하므로 `.gitkeep` 시드 — 기존 bookshelf 시드와 동일 의도):
   - `docs/prd/versions/.gitkeep`
   - `docs/designer/archive/.gitkeep`
   - `briefs/.gitkeep`
   - 헬퍼 `ensureDir(abs)` 신설 또는 `ensureFile(path.join(abs, '.gitkeep'), '')` 재사용.

### (C) 버전 표기 디렉터리 (조건부 — initial_version 매치 시만)

`VERSION_ID_RE.test(initialVersionId)` 가드 안에서:

1. **`docs/artifacts/<v>/manifest.json`** — `ensureFile` 로 schema-valid 빈 매니페스트:
   ```json
   { "schema_v": 1, "version": "<v>", "entries": [] }
   ```
   `JSON.stringify(..., null, 2) + '\n'`. (`artifact-manifest-schema.md` schema_v 1 형식. `loadManifest`가 `entries ?? []` 로 빈 배열을 안전 처리 — GUI 회귀 없음.)
2. **`docs/tickets/<v>/.gitkeep`** — `ensureFile(..., '')`.

### (D) 마감

- `pnpm tsc --noEmit` green.
- `bootstrapPersonaMemory` JSDoc 주석에 신규 골격 목록 + lifecycle 위임 경계(§3) 1줄 요약 추가.
- 기존 호출부(`project:installAt`, `init:project`, CLI) 는 `initialVersionId` 없이도 동작 — 버전-무관 골격은 항상, 버전 표기 골격만 스킵.

## 5. QA scope (smoke)

- [x] **temp dir init** — `initProject({ slug, projectDir: <tmp>, initialVersionId: 'v0.5', skipDoctrine: true })` 실행 후 assert:
  - `docs/backlog.md`, `docs/prd/PRD.md` 존재 + 비어있지 않음(헤더 포함).
  - `docs/prd/versions/`, `docs/designer/archive/`, `briefs/`, `docs/tickets/v0.5/` 디렉터리 존재(`.gitkeep` 포함).
  - `docs/artifacts/v0.5/manifest.json` 존재 + `JSON.parse` → `{ schema_v:1, version:'v0.5', entries:[] }`.
- [x] **idempotent 재실행** — 같은 tmp dir 에 `initProject` 재호출. backlog/PRD/manifest 의 content 가 1회차와 동일(byte-equal). 에러 없음. (content byte-equal + mtime 보존 확인.)
- [x] **no-overwrite** — `docs/backlog.md` 를 임의 내용으로 미리 채운 뒤 `initProject` → 그 내용 보존. (manifest.json pre-fill 도 보존 확인.)
- [x] **initial_version 부재** — `initialVersionId` 없이 init → 버전-무관 골격(backlog/PRD/versions/archive/briefs)만 생성, `docs/artifacts/`·`docs/tickets/<v>/` 버전 디렉터리는 생성되지 않음(lifecycle 위임 확인).
- [x] **형식 불일치** — `initialVersionId: '0.5'`(접두 `v` 없음) → 버전 표기 디렉터리 생성 안 됨.
- [x] **GUI day-one** — `initial_version=v0.5` init 후 `artifacts:listScoped(projectDir, 'v0.5')` 가 ENOENT 없이 `[]` 반환. (versionDir `existsSync` 가드 통과 → `[]`.)
- [x] `pnpm tsc --noEmit` green. (centralized build: core build 0, gui tsc 0, smoke passed.)

## Persona Activity

| When | Persona | Model/Effort | Turn | Result |
|---|---|---|---|---|
| 2026-06-10 | pdt-qa | opus/standard | smoke | §2 AC-1~9 전부 code-verified + temp-dir 스모크 실행(PASS). 컴파일된 `packages/core/dist/init.js` 에 대해 `initProject({slug,projectDir:<tmp>,initialVersionId,skipDoctrine:true})` 직접 호출 — 17/17 assert PASS. AC-1 backlog seed(헤더+`## Entries`)·AC-2 PRD stub·AC-3/4/5 versions/archive/briefs(`.gitkeep`)·AC-6 v0.5 시 `artifacts/v0.5/manifest.json`={schema_v:1,version:v0.5,entries:[]}+`tickets/v0.5/.gitkeep`·AC-7 재실행 content byte-equal+mtime 보존·AC-8 pre-fill backlog/manifest 보존·initialVersion 부재→artifacts/tickets 미생성·`'0.5'` 형식불일치→버전 디렉터리 미생성. AC-9: init 후 `listScoped(projectDir,'v0.5')` scanDir 경로 재현 — versionDir `existsSync` 가드 통과→`[]` 반환, ENOENT 없음. dist=source 일치 확인(grep). centralized build GREEN(core 0/gui tsc 0/smoke). → status done, qa_status pass. |
| 2026-06-10 | pdt-developer | sonnet/medium | impl | `bootstrapPersonaMemory(projectDir, initialVersionId?)` 확장 + `initProject` 가 `config.initial_version` 전달. 신규 헬퍼 `ensureDir`(mkdir recursive + `.gitkeep` ensureFile)·로컬 상수 `VERSION_ID_RE`(GUI `lib/version-id.ts:10` 동치, 주석 명시). 항상 생성: `docs/backlog.md` seed·`docs/prd/PRD.md` stub·`docs/prd/versions/`·`docs/designer/archive/`·`briefs/`(.gitkeep). 조건부(VERSION_ID_RE 매치 시만): `docs/artifacts/<v>/manifest.json`(`{schema_v:1,version,entries:[]}` + `\n`)·`docs/tickets/<v>/`(.gitkeep). idempotent·no-overwrite 는 `ensureFile`(existsSync 가드)·`mkdirSync recursive` 로 보장. §3 lifecycle-owned(po-state·스냅샷·artifact/ticket/brief content) 미생성. 검증: `pnpm --filter @productune/core build` green + node 스모크 — v0.5 init 시 7개 경로 생성·manifest `{schema_v:1,version:v0.5,entries:[]}`, backlog 사용자값 보존(no-overwrite), 재실행 byte-stable, initialVersion 부재/`0.5` 불일치 시 버전 디렉터리 미생성 확인. |
| 2026-06-10 | pdt-designer | opus/standard | plan | core(`packages/core/src/init.ts`) 스캐폴딩 drift 티켓 발행. 조사: `bootstrapPersonaMemory`(line 175–232)가 만드는 것 vs doctrine(`artifact-manifest-schema.md` schema_v 1, `lifecycle/p1-prd.md`·`p5-close.md` `mkdir -p docs/prd/versions docs/designer/archive`, `po/habit.md:4` backlog/briefs/manifest whitelist, `delegation.md:28/35/41` tickets·artifacts·briefs)가 전제하는 것 대조 → 누락: `docs/artifacts/<v>/manifest.json`, `docs/prd/PRD.md`, `docs/prd/versions/`, `docs/backlog.md`, `docs/tickets/<v>/`, `briefs/`, `docs/designer/archive/`. ENOENT 경로 = GUI `artifacts:listScoped`(`ipc/artifacts.ts:97–120`)가 `docs/artifacts/<currentVersion>/` 스캔. 초기 버전 id = config `initial_version`(`^v\d+(\.\d+)?$`, GUI `lib/version-id.ts:10` 동치) — 없으면 버전 표기 디렉터리는 lifecycle 위임. 각 경로별 create-empty-dir / seed-file / lifecycle 결정 §2/§3 확정. init=idempotent·no-overwrite 보존(`ensureFile` 계약). `.productune/po-state.json`·PRD content·스냅샷·티켓/artifact 파일은 PO/Designer lifecycle 소유로 §3 명시. assignee pdt-developer / model sonnet / qa smoke. |
