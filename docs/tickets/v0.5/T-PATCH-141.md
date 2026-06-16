---
ticket_id: T-PATCH-141
version: v0.5
slug: init-deterministic-po-state-generator
title: init 를 po-state 의 결정적 생성기로 (canonical empty v2 shape)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: init-po-state
estimated_complexity: L3
risk_flags: [data-migration]
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-141: init 를 po-state 의 결정적 생성기로

## Request

PO dogfood 에서 발견 + 재현 검증. `init-project.mjs` 는 의도적으로 `.productune/po-state.json` 을 쓰지 않는다(line 208, 608: "lifecycle-owned — AC-5"). 그래서 fresh 프로젝트는 PO 가 doctrine 에서 po-state 를 author 하는 데 의존했고, 이때 v1 shape 가 재현되었다(T-PATCH-139 버그의 원인).

사용자 결정: **init 를 결정적 생성기로 만든다.** init 가 canonical empty po-state 를 쓰되, 기존 ABSENT-ONLY(`ensureFile`) 패턴을 써서 **이미 존재하는 po-state 는 절대 덮어쓰지 않는다**(re-init safe).

추가 발견(검증됨, 본 티켓 범위에 포함 — 아래 Step 2): bash `productune` CLI 의 `ensure_state()`(`packages/core/scripts/productune` line 651-654)가 po-state 부재 시 **이미** seed 를 쓰는데 그 shape 이 **레거시 v1** 이다 — `{"schema_version":1,"current_task":null,"past_tickets":[],"recent_turns":[]}`. 게다가 이 ensure_state 는 init 호출(line 681 config guard)보다 **먼저**(line 676) 실행된다 → CLI 경로에서는 ensure_state 가 v1 po-state 를 먼저 쓰고, init 의 absent-only 가드는 영영 v2 를 쓸 기회를 얻지 못한다. 따라서 init 만 고쳐서는 CLI 경로가 계속 v1 을 생산한다.

## Acceptance

- BDD: Given po-state 가 없는 fresh 프로젝트 / When `initProject` 실행 / Then `.productune/po-state.json` 이 canonical empty shape `{ "schema_version": 2, "current_task": null }` 로 생성된다.
- BDD: Given **이미 작업이 담긴 po-state**(current_task 비-null, phase_history/versions 존재) / When `initProject` 재실행(re-init) / Then 기존 po-state 가 **clobber 되지 않는다**(absent-only `ensureFile` — 내용 보존).
- BDD (fresh 라우팅 — 단위 가능 형태로 재명세, D-141-2): (a) **단위**: EntryGate 라우팅 결정 로직에 content-signal 입력(`phase_history.length===0` + chat messages 없음)을 직접 주입 → 결과가 **'fresh'**(FreshComposer) 임을 단언(순수 입력→출력, Electron 불필요). (b) **보강 단위**: init 가 생성한 `{schema_version:2,current_task:null}` 프로젝트가 `detectProductuneLayout`/`classifyProductuneDir` 직접 호출에서 **'self-current'** 로 분류됨(아래 별도 BDD)으로 fresh 경로 전제를 확인. (c) 실제 EntryGate 컴포넌트 마운트 기반 end-to-end 'fresh' 라우팅은 **integration/manual** 로 표시 — Electron 런타임 필요, 단위 불가.
- BDD: Given init 가 생성한 config.json + empty po-state / When `detectProductuneLayout` 호출 / Then **'self-current'** 로 분류된다(config.json 이 primary 마커 — 회귀 없음, po-state 는 secondary).
- BDD: Given schema_version 값 / When init 가 stamp / Then **migrate 훅이 타게팅하는 값과 동일(2)** — `session-start-po-state-migrate.sh` 가 v2 파일을 strict no-op 으로 통과시킨다(재마이그레이션 없음), `pre-po-state-shape-guard.sh` 가 통과시킨다(schema_version==2, past_tickets 부재).
- BDD: Given bash `productune` CLI 로 fresh 프로젝트 진입 / When `ensure_state` 가 seed / Then init 와 **동일한** canonical v2 shape 가 쓰이고(또는 init 에 위임되고), v1 shape(past_tickets/recent_turns)는 더 이상 생성되지 않는다.

## Out of scope

- `current_phase` / `current_version` / `versions` 등 lifecycle 소유 필드의 init 작성 — canonical empty 는 **최소 shape** 만(`schema_version`, `current_task`); 나머지는 lifecycle 이 나중에 채운다.
- **onboarding.json** 작성 — GUI-flow-owned 로 유지(GUI `project:create` 만 작성: `project.ts:307,316`; CLI init 는 작성 안 함; EntryGate legacy fallback 이 graceful 처리). init 가 onboarding.json 을 쓰게 만들지 **말 것**.
- po-state 의 v1→v2 마이그레이션 로직 자체(이미 `session-start-po-state-migrate.sh` 소유) 변경.
- (LOW backlog, 범위 외) GUI(`project:create`)는 onboarding.json 을 쓰고 CLI init 는 안 쓰는 GUI-vs-CLI 비일관성 — 백로그 항목으로만 기록.

## Plan

> assignee: **pdt-developer** · model: **sonnet** · effort: **medium**

대상 파일: `packages/core/scripts/lib/init-project.mjs` (주) + `packages/core/scripts/productune`(bash ensure_state, Step 2).

### Step 1 — init 가 canonical empty po-state 작성 (ROOT FIX)
- `bootstrapPersonaMemory`(또는 `initProject`) 안에서 기존 `ensureFile`(absent-only, no-clobber) 패턴으로 `.productune/po-state.json` 을 작성한다.
- 내용: `{ "schema_version": 2, "current_task": null }` (2-space pretty + trailing newline, 기존 파일 스타일과 일치).
- **schema_version 은 migrate 훅 타깃과 동일하게 2** — 하드코드 리터럴 `2` 로 충분(migrate/shape-guard 모두 리터럴 2 기대; 본 값은 마이그레이션 id 시퀀스인 `latestSchemaV()` 와 다른 축이므로 그것과 묶지 말 것).
- 위치 결정: `bootstrapPersonaMemory` 가 이미 `.productune/turns/` 등을 만들므로 같은 함수 내 po-state ensureFile 추가가 자연스럽다. 단, JSDoc 의 "NOT written: .productune/po-state.json (lifecycle-owned — AC-5)" 주석(line 208, 218, 608)을 **갱신**하여 새 정책(init = 결정적 생성기, absent-only)으로 바꿀 것.

### Step 2 — bash `productune` ensure_state seed 통일 (CONSISTENCY, 같은 root)
- `packages/core/scripts/productune` `ensure_state()`(line 651-654)의 seed 를 canonical v2 shape 로 교체: `{"schema_version":2,"current_task":null}`.
- 근거: ensure_state(line 676)가 init(line 681 config guard)보다 먼저 실행되므로, ensure_state 가 v1 을 먼저 쓰면 init 의 absent-only 가 무력화된다. 두 writer 모두 absent-only + **동일 내용**이면 어느 쪽이 먼저 실행돼도 결과가 같아 안전.
- canonical **seed** shape 는 정확히 `{ "schema_version": 2, "current_task": null }` 다. `past_tickets` / `recent_turns` 둘 다 **seed 에 넣지 않는다(omit)** — 단 성격이 전혀 다르므로 구분할 것:
  - `past_tickets`: 레거시 v1 필드 → migrate 훅이 v1→v2 시 **drop** 하고 shape-guard 가 flag 한다. seed 에 절대 넣지 않는다.
  - `recent_turns`: **유효한 active v2 필드**다(types.ts 에서 non-deprecated; `post-delegate-state-write.sh` 가 **무조건** 기록; migrate 훅은 `past_tickets` **만** drop 하고 recent_turns 는 건드리지 않음; shape-guard 도 recent_turns 를 **검사하지 않음**). seed 에서 **생략(omit)** 할 뿐이며, optional 필드로서 첫 delegation 시 `post-delegate-state-write.sh` 가 lazily 생성한다. **canonical 에서 '제거(remove)'가 아니라 seed shape 에서만 omit** 이다.
- 따라서 developer 는 recent_turns 를 **어떤 guard 에도 추가하지 말 것**, `post-delegate-state-write.sh` 의 recent_turns 기록을 **제거하지 말 것**. 본 티켓의 변경은 오직 'seed 가 recent_turns 를 쓰지 않는다(omit-from-seed-only)'에 한정된다.
- (대안으로 ensure_state 를 init 호출에 위임하는 방법도 가능하나, non-git 경로 등에서 init 가 안 도는 케이스가 있어 **seed 직접 교체가 최소·안전**. developer 판단으로 택1하되 결과 shape 는 동일해야 함.)

### Step 3 — CROSS-FEATURE 무회귀 검증 (코드 변경 없음, 확인만)
- **EntryGate**(`packages/gui/src/components/EntryGate.tsx`): 라우팅은 CONTENT 기반(poState.phase_history.length>0 + chat messages 존재 여부)이지 po-state 존재 여부가 아니다. init 가 만든 empty po-state(current_task null, phase_history 없음)는 여전히 'fresh' 로 라우팅 — 확인.
- **detectProductuneLayout**(`packages/gui/electron/ipc/project.ts:131`): config.json 존재가 PRIMARY('self-current', 먼저 체크). po-state 는 SECONDARY heal evidence(`schema_version>=1`)일 뿐. init 가 config.json + po-state 둘 다 쓰므로 'self-current' 로 분류 — 회귀 없음. (init self-healable 감지 `classifyProductuneDir` 도 동일 — config 우선.)
- 두 경로 모두 **non-breaking** 임을 QA 가 실제 fixture 로 확인할 것.

### §QA scope table

| 항목 | fixture | assertion |
|:--|:--|:--|
| init empty po-state 생성 | po-state 없는 fresh dir 에 `initProject` | `.productune/po-state.json` == `{"schema_version":2,"current_task":null}` (정확 일치) |
| re-init no-clobber | current_task 비-null + phase_history/versions 담긴 po-state 존재 후 `initProject` 재실행 | po-state 내용 **불변**(byte-identical), 작업 보존 |
| shape-guard 통과 | init 생성 po-state 를 `pre-po-state-shape-guard.sh` 로 검사 | 통과(schema_version==2, past_tickets 부재, bad field 없음) |
| migrate 훅 no-op | init 생성 po-state 에 `session-start-po-state-migrate.sh` 실행 | strict no-op(schema_version 그대로 2, .bak/변경 없음) |
| EntryGate fresh 판정 로직 (unit) | 라우팅 결정 로직에 `phase_history=[]` + chat=none 입력 (Electron 불필요) | 'fresh'(FreshComposer) 산출 — 순수 입력→출력 단언 |
| EntryGate fresh 라우팅 (integration/manual) | 실제 Electron 마운트 + config.json + init empty po-state + chat 세션 없음 | gate === 'fresh' — 런타임 필요, 단위 아님 |
| EntryGate workspace 무회귀 | phase_history.length>0 인 po-state | gate === 'workspace' |
| detectProductuneLayout 분류 | config.json + init empty po-state | kind === 'self-current' |
| detect self-healable 무회귀 | config.json 없이 po-state(schema_version 2)만 | kind === 'self-healable'(heal evidence) |
| CLI ensure_state shape | bash `productune` 로 po-state 없는 git/non-git repo 진입 | 생성된 po-state == canonical v2(`{"schema_version":2,"current_task":null}`), v1 필드 없음 |
| CLI re-entry no-clobber | 작업 담긴 po-state 존재 상태로 bash `productune` 재진입 | ensure_state 가 덮어쓰지 않음 |
| GUI build 반영 | (deploy 확인) GUI 패키지에서 init 경로 동작 | 아래 DEPLOY note 의 rebuild 필요성 확인 |

### DEPLOY note
- `init-project.mjs` 는 CLI 가 repo 의 scripts 경로로 직접 `node` 실행 → **소스 수정 시 dev/source 설치 경로는 즉시 반영**. 단 GUI 는 core 를 번들하므로 **패키징된 GUI 앱은 rebuild 필요**(QA/deploy 단계에서 확인).
- `productune` bash 스크립트도 동일(소스 수정 즉시 반영, dev 경로).
- 둘 다 doctrine .md 가 아니므로 `~/.productune` mirror 불필요(install.sh 의 doctrine 복사 대상 아님).

## Outcome
<!-- Phase 5 -->

## Persona Activity
<!-- PO-managed -->
