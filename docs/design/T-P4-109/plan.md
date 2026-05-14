# T-P4-109 · productune init shell — user-global doctrine bootstrap wire

**Slug**: `productune-init-shell-doctrine-wire`
**Date**: 2026-05-14
**Round**: r4-fix
**Author**: pdt-designer
**Artifact**: plan only (1/1 for this dispatch)
**Status**: ready
**Parent**: T-P4-106 (bootstrapUserGlobalDoctrine — Electron IPC wire)
**Origin**: paepyeong PO sandbox doctrine 강제 실패 사고 + T-P4-106 wire 누락 발견 (사용자 직접 발견 2026-05-14)

---

## §1 Background — Root Cause Confirmation

### 1.1 Code evidence

코드 탐색으로 누락 지점을 세 곳에서 확인.

| Location | Content | Gap |
|:--|:--|:--|
| `packages/core/scripts/productune` **L208–299** | `init)` handler: git init + `.productune/po-state.json` + `docs/pdt-*/` dirs + `.gitignore` → `exit 0` (L299) | **doctrine bootstrap 호출 없음.** handler 는 project-level scaffold 만 수행하고 종료. |
| `packages/core/scripts/install.sh` **L602–630** | po-instructions.md hash compare/backup/copy (L602–610) + sections/ wipe+copy (L612–621) + po-memory.md seed-only (L623–630) | Doctrine 로직 **inline** — named function 없음. productune init 에서 재사용 불가. |
| `packages/core/src/init.ts` **L248–300** (`bootstrapUserGlobalDoctrine`) + **L331** (`initProject`) | TypeScript 구현 완전함. `initProject()` 가 `!opts.skipDoctrine` 시 `bootstrapUserGlobalDoctrine()` 호출 | `initProject()` 는 Electron IPC path 에서만 호출됨 — CLI `productune init` 에서 호출되는 진입점 없음. |

### 1.2 실패 경로 재현

```
사용자 $ productune init          # npm global 설치 or 직접 clone path
  → shell init handler (L208) 실행
  → git init ✓ / po-state.json ✓ / docs/pdt-*/ ✓ / .gitignore ✓
  → exit 0  ← 여기서 종료
  → ~/.productune/po-instructions.md  미설치 ← paepyeong PO doctrine 실패 root cause
  → ~/.productune/sections/*.md       미설치
  → ~/.productune/po-memory.md        미설치
```

TypeScript `bootstrapUserGlobalDoctrine()` 는 잘 작성되어 있으나 CLI path 에서 진입 불가 — T-P4-106 에서 wire 됐다고 간주했으나 Electron IPC 경로만 연결된 상태였음.

### 1.3 fix 방향

shell `productune init` 가 doctrine bootstrap 을 실행해야 한다.
구현 경로 결정 = §2(a).

---

## §2 Decisions

### 2(a) Shell wire 방식 — Option C 채택

세 후보를 검토했다.

| Option | 요약 | Pro | Con | 채택? |
|:--|:--|:--|:--|:--|
| **A** | bash init handler 안에 doctrine 로직 inline 추가 (install.sh L602-630 복붙) | 의존성 0, 즉시 구현 | TypeScript + bash 2개 SoT 에 더해 bash 내부도 2 SoT 생성 (install.sh inline + productune inline) | ✗ |
| **B** | shell 이 `node dist/init.js bootstrap-doctrine` 호출 — TypeScript 가 единый SoT | TypeScript 단일 SoT | packages/cli/src/index.ts placeholder (T-P4-002 미구현); node 경로 의존; npm global 설치 시 dist/ 경로 불안정 | ✗ (T-P4-002 land 후 별 ticket) |
| **C** ✓ | install.sh L602-630 inline → `bootstrap_user_global_doctrine()` 함수로 추출, `packages/core/scripts/lib/bootstrap-doctrine.sh` 에 정의. 두 bash script 모두 source + call. TypeScript 는 Electron IPC 전용 명시. | bash SoT 단일화 (`lib/` 1곳). install.sh 기존 동작 무변경. productune init 즉시 수혜. | bash + TypeScript 두 구현 존재 (path 별 분리로 duplication 이 아니라 role separation — 각자 자신의 진입점 소유) | ✓ |

**채택 근거**: bash path 와 Electron path 는 진입점이 다르고 각각 자신의 context 에서 완결된다.  
중복이 아니라 **path 별 분리** — bash lib = CLI path SoT, TypeScript = Electron path SoT.  
T-P4-002 (CLI 본체) land 후 Option B 를 별 ticket 으로 평가할 수 있음 (§7 OQ-3).

### 2(b) Doctrine source path resolution

두 script 에서 공통 패턴 사용:

| Script | Root 유도 방법 | PO dir |
|:--|:--|:--|
| `install.sh` | `ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"` (L20 기존) | `$ROOT/po` |
| `productune` init handler | `SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd -P)"` + `DOCTRINE_ROOT="$(cd "$SCRIPTS_DIR/.." && pwd)"` (새 추가) | `$DOCTRINE_ROOT/po` |

`lib/bootstrap-doctrine.sh` 함수 시그니처:
```bash
bootstrap_user_global_doctrine "$DOCTRINE_ROOT"
```
`$1` (DOCTRINE_ROOT) = `packages/core/` 절대경로. 함수 안에서 `PO_SRC="$1/po"` 파생.  
`PRODUCTUNE_REPO` env var 을 fallback 으로 사용하지 않음 — 명시적 인자가 더 안전.  
소스 디렉토리 부재 시 `warn` + `return 0` (non-fatal) — 부분 설치 환경 보호.

### 2(c) Idempotent 정책 (T-P4-106 / install.sh 동일 재사용)

함수 내 파일별 처리:

| 파일 | 정책 |
|:--|:--|
| `po-instructions.md` | `cmp -s` 동일 → skip. 다르면 `.bak.$TS` 백업 + 덮어쓰기. |
| `po-memory.md` | `[ ! -e ]` guard — **절대 overwrite 금지**. 없을 때만 template 에서 seed. |
| `sections/*.md` | 스테일 파일 `rm -f` 선처리 → 전체 sweep 복사. per-file `cmp -s` 사용 안 함 (wipe+copy 가 install.sh 기존 패턴). |
| `productune.env` | `[ ! -e ]` guard — 없을 때만 `engine=claude\n` seed. install.sh 의 interactive engine 선택이 이후 덮어쓰기. |

> **po-memory.md 불변 보장**: 함수 내에서 seed-only 처리. install.sh 기존 L623-630 도 동일 정책 — 통합 후에도 규칙 유지.

### 2(d) End-user vs Dev environment 동작

| 시나리오 | 호출 경로 | 결과 |
|:--|:--|:--|
| End-user `npm install -g productune` 후 `productune init` | productune shell → lib source → `bootstrap_user_global_doctrine` | `~/.productune/` 자동 구성. 추가 명령 불필요. |
| Dev clone 에서 `bash install.sh` | install.sh → lib source → `bootstrap_user_global_doctrine` | 기존과 동일 (refactor 후 동작 무변경). |
| Dev clone 에서 `productune init` | productune shell → lib source → `bootstrap_user_global_doctrine` | idempotent — install.sh 와 동일 결과 (hash 같으면 skip). |

### 2(e) Skip flag

`productune init` 에 `--skip-doctrine` flag 추가.

```
usage: productune init [--skip-doctrine]

  --skip-doctrine   user-global doctrine bootstrap 건너뜀.
                    CI / 커스텀 doctrine 환경용 escape hatch.
                    project-level scaffold (.productune/, docs/pdt-*/, .gitignore)는 정상 실행.
```

플래그 파싱은 `init)` 분기 진입 직후, git init 로직 전에 수행.  
`set -euo pipefail` 환경에서 `for _arg in "$@"` 순회 — 안전.

---

## §3 ASCII Flow

```
사용자 $ productune init
│
├─ [productune] init) handler 진입
│
├─ flag parse: --skip-doctrine? → NO (기본)
│
├─ git init (기존 L222-246 로직, 무변경)
│   └─ already toplevel / init / opt-in nested
│
├─ [productune] initializing productune project at /Users/.../paepyeong
│
├─ scaffold (기존 L250-293 로직, 무변경)
│   ├─ created: .productune/po-state.json
│   ├─ created: docs/pdt-designer/
│   ├─ created: docs/pdt-developer/
│   ├─ created: docs/pdt-qa/
│   └─ appended: .gitignore
│
├─ [new] SCRIPTS_DIR 유도 → DOCTRINE_ROOT 유도
│
├─ [new] source lib/bootstrap-doctrine.sh
│
└─ [new] bootstrap_user_global_doctrine "$DOCTRINE_ROOT"
    │
    ├─ [productune] bootstrapping user-global doctrine (~/.productune/)
    ├─ [productune]   doctrine: ~/.productune/po-instructions.md
    ├─ [productune]   doctrine: ~/.productune/sections/ (N files)
    ├─ [productune]   doctrine: seeded ~/.productune/po-memory.md
    ├─ [productune]   doctrine: seeded ~/.productune/productune.env
    └─ [productune]   doctrine 시스템 파일 설치 완료.

사용자 $ productune init  # 재실행 (idempotent)
    ├─ po-instructions.md: cmp same → skip
    ├─ sections/*.md: wipe + copy (동일 내용)
    ├─ po-memory.md: exists → preserved
    ├─ productune.env: exists → preserved
    └─ [무출력] (조용)

사용자 $ productune init --skip-doctrine
    └─ scaffold 만 실행 → doctrine bootstrap skip
       "[productune] doctrine bootstrap skipped (--skip-doctrine)"
```

---

## §4 Module Map

| 파일 | 변경 유형 | 내용 |
|:--|:--|:--|
| `packages/core/scripts/lib/bootstrap-doctrine.sh` | **CREATE** | `bootstrap_user_global_doctrine()` 함수 정의. `$1` = DOCTRINE_ROOT. po-instructions.md (hash compare+backup), sections/ (wipe+sweep), po-memory.md (seed-only), productune.env (seed-only). say/warn helper 는 caller script 에서 정의되어 있으므로 재정의 안 함 (sourced 환경 전제). |
| `packages/core/scripts/productune` | **UPDATE** `init)` handler | ① 진입 직후 flag parse (`--skip-doctrine`). ② 기존 scaffold 로직 무변경. ③ scaffold 완료 후 SCRIPTS_DIR / DOCTRINE_ROOT 유도. ④ `source "$SCRIPTS_DIR/lib/bootstrap-doctrine.sh"`. ⑤ `bootstrap_user_global_doctrine "$DOCTRINE_ROOT"` 호출 (SKIP_DOCTRINE=0 일 때). ⑥ exit 0 전에 "doctrine 시스템 파일 설치 완료." 메시지 포함. |
| `packages/core/scripts/install.sh` | **UPDATE** L602–630 inline block | 기존 inline doctrine steps → `source "$ROOT/scripts/lib/bootstrap-doctrine.sh"` + `bootstrap_user_global_doctrine "$ROOT"` 2줄로 대체. install.sh 의 productune.env interactive engine selection (L648+) 은 무변경 — 함수 범위 밖. |
| `packages/core/src/init.ts` | **COMMENT ONLY** | `bootstrapUserGlobalDoctrine()` (L248) 함수 JSDoc 에 명시: `@note Electron IPC path only. CLI path uses packages/core/scripts/lib/bootstrap-doctrine.sh.` TypeScript 로직 무변경. |
| `docs/developer/project-notes.md` | **APPEND** | `(2026-05-14) T-P4-109 · shell vs TypeScript doctrine bootstrap path 분리: bash lib (CLI path SoT) + TypeScript (Electron path SoT). productune init 이 doctrine bootstrap 호출 안 하던 누락 fix. lib: packages/core/scripts/lib/bootstrap-doctrine.sh.` |

---

## §5 §1.5 Self-check (UX Principles)

CLI install flow 가 대상 — GUI screen 없음. 운영자/개발자 UX (터미널 출력)에 원칙 적용.

| Principle | 적용 | 상태 |
|:--|:--|:--|
| **Few Things** | 변경 파일 5개 (CREATE 1 + UPDATE 3 + APPEND 1). 사용자 체감 변화는 `productune init` 실행 후 doctrine 파일 생성 1가지. flag 1개 추가 (`--skip-doctrine`). 기존 명령 인터페이스 무변경. | ✓ |
| **Familiar** | `productune init` 문법 무변경. scaffold 출력 형식 (`[productune] created: ...`) 기존과 동일. doctrine bootstrap 출력도 같은 `say()` prefix 스타일. `--skip-doctrine` flag 는 `git init --bare` 류의 관례적 flag 네이밍. | ✓ |
| **Predictability** | idempotent 재실행 시 po-memory.md / productune.env 절대 덮어쓰지 않음 — 예측 가능 보존 정책. `cmp -s` 동일이면 silent — 재실행해도 노이즈 없음. `--skip-doctrine` 은 one flag = one effect (doctrine 만 skip, scaffold 정상). | ✓ |
| **Feedback** | 신규 설치 시 파일별 `say` 출력 ("doctrine: ~/.productune/po-instructions.md"). 설치 완료 후 종합 메시지 ("doctrine 시스템 파일 설치 완료."). `--skip-doctrine` 사용 시 명시적 skip 메시지. lib 파일 미발견 시 `warn` + graceful continue (non-fatal). | ✓ |
| **Escape** | `--skip-doctrine` 제공 — CI / 커스텀 환경 완전 탈출 경로. lib 파일 부재 = non-fatal warn + return 0 (init 전체가 실패하지 않음). po-memory.md 불변 보장 — "실수로 지워진다" 공포 없음. | ✓ |

위반 없음.

---

## §6 QA Scope

| 항목 | 값 |
|:--|:--|
| **QA invoke** | `skip` |
| **test target** | — (bash function 리팩토링 + shell wire 추가, user-facing GUI 코드 없음) |
| **사용자 dogfood** | ① `rm -rf ~/.productune/` (fresh env 시뮬레이션). ② paepyeong 폴더에서 `productune init` 실행. ③ `cat ~/.productune/po-instructions.md` 로 doctrine 설치 확인. ④ `productune init` 재실행 → po-memory.md 보존, 조용한 idempotent 동작 확인. ⑤ `productune init --skip-doctrine` → scaffold 만 실행, doctrine 파일 미생성 확인. |
| **regression check** | `packages/core/scripts/install.sh` 기존 doctrine 동작 — L602–630 inline 제거 후 `bootstrap_user_global_doctrine` 결과 동일한지 확인 (특히 sections/ wipe 전략, po-memory.md 보존). `productune onboard` (`exec bash install.sh`) 흐름 전체 정상 동작. |

---

## §7 Open Questions

| # | 질문 | 권장 |
|:--|:--|:--|
| OQ-1 | `say`/`warn` helper 는 caller script 에 정의됨. lib 파일을 standalone 실행 (직접 호출) 시 에러. standalone 방어 필요? | **no** — lib 파일은 source-only 전용. `#!/usr/bin/env bash` 쓰되 주석으로 "source only — do not execute directly" 명시. standalone 호출 감지 가드 (`[[ "${BASH_SOURCE[0]}" == "$0" ]]`) 선택 추가 가능 — 구현자 판단. |
| OQ-2 | `sections/` wipe 전략 (`rm -f *.md`) — lib 함수 내부에서도 stale sweep 실행. install.sh L615 와 동일 behavior 유지. 이 sweep 이 사용자가 직접 추가한 custom sections 파일을 삭제할 위험. | **현행 유지** — custom section 지원은 T-P4-106 설계 결정 밖. 향후 sections/ custom 지원 필요 시 별 ticket. |
| OQ-3 | Option B (TypeScript `dist/init.js bootstrap-doctrine` CLI entry) — T-P4-002 CLI 본체 land 후 별 ticket? | **Yes** — T-P4-002 (packages/cli/src/index.ts) land 후 평가. 현재 dist/ 경로 불안정하므로 선행 불가. |
| OQ-4 | `productune.env` seed 에서 `engine=claude` 외에 `PRODUCTUNE_REPO` 도 함께 쓸지? | **No** — `PRODUCTUNE_REPO` 는 install.sh 의 L669+ interactive flow 에서 쓰임. lib 함수는 doctrine 파일 scope 만. `productune.env` seed = `engine=claude\n` 1줄만 — install.sh 가 이후 path + engine 덮어씀. |

---

## §8 Out of Scope

- **packages/cli/src/index.ts** CLI 본체 구현 — T-P4-002 별 ticket
- **`dist/init.js` bootstrap-doctrine CLI entry** — T-P4-002 land 후 별 ticket (§7 OQ-3)
- **TypeScript `bootstrapUserGlobalDoctrine()` 로직 변경** — Electron path 그대로 (T-P4-106 scope)
- **Electron IPC path migration** — T-P4-106 에서 완결; 본 ticket 미포함
- **GUI 변경** — 없음
- **ROADMAP 갱신** — internal fix; ROADMAP entry 불필요
- **Activity Log** — PO mechanical append on close

---

## §9 Dependencies

| 의존성 | 관계 | Blocking? |
|:--|:--|:--|
| **T-P4-106** (bootstrapUserGlobalDoctrine — Electron IPC) | bundle source path (`packages/core/po/`) 확인 + TypeScript 구현 참조 SoT. lib 함수의 idempotent 정책은 TypeScript impl 과 일치 | **Non-blocking** — T-P4-106 이미 landed (Electron path). 본 ticket 은 독립 fix. |
| **T-P4-108** (install.sh PreToolUse 작업 patch) | T-P4-108 도 install.sh 를 건드림. 양쪽 모두 install.sh 수정 — **다른 섹션** (T-P4-108 = hooks merge 영역 L412-462; T-P4-109 = doctrine inline L602-630). 기계적 conflict 없으나 land 순서 조율 권장. | **Non-blocking** — 독립 섹션. T-P4-108 → T-P4-109 순 권장 (hooks 안정화 후 doctrine 수정이 rebase 용이). |
| **T-P4-002** (CLI packages/cli/src) | Option B (TypeScript CLI entry) 의 전제조건. Option C 채택으로 본 ticket 은 T-P4-002 와 독립. | **Non-blocking** |
