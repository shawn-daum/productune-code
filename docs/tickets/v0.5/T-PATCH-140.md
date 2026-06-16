---
ticket_id: T-PATCH-140
version: v0.5
slug: hook-common-doctrine-scoping
title: SessionStart 훅 fallback의 common doctrine 누수 차단 (productune-project gate)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: hook-scoping
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-140: SessionStart 훅 fallback의 common doctrine 누수 차단

## Request

PO dogfood 에서 발견 + 재현 검증된 버그. `session-start-doctrine.sh` 의 fallback 블록(agent_type 이 pdt-* 페르소나가 아닐 때 동작)이 **디렉터리 게이트 없이** productune common Tier0 doctrine 을 주입한다. 결과: 아무 폴더에서 실행한 plain `claude`(agent_type 가 비었거나 "claude")가 어디서든 productune common doctrine(4508 bytes)을 주입받는다.

재현(검증됨): plain claude @ `/tmp`, @ `$HOME`, @ `oh-my-eyes` 모두 common 주입을 받음. 페르소나 세션은 fallback 에 도달하지 않음(페르소나 브랜치에서 emit+exit). pdt-po 는 common 제외(NEED_COMMON=0).

FIX 방향: fallback 을 **productune-project 감지로 게이트**한다 — EVENT_CWD 에서 위로 walk-up 하여 `.productune/config.json` **또는** `.productune/po-state.json` 마커(둘 중 하나라도 있으면 productune 프로젝트 — self-healable 프로젝트 포함)를 찾고, **둘 다 없으면**(= 진짜 비-productune) 아무것도 주입하지 않고 exit 0.

## Acceptance

- BDD: Given productune 프로젝트가 아닌 디렉터리(`/tmp`, `$HOME`, 임의 비-productune repo) / When plain `claude`(agent_type 없음/"claude")로 세션 시작 / Then common doctrine 이 **주입되지 않는다**(additionalContext 없음, exit 0).
- BDD: Given `.productune/config.json` 이 존재하는 productune 프로젝트 디렉터리(또는 그 하위 디렉터리) / When plain `claude`(persona 미지정)로 세션 시작 / Then 기존대로 common Tier0 가 주입된다(회귀 없음).
- BDD: Given `.productune/po-state.json` 은 있으나 `.productune/config.json` 이 **없는** self-healable 프로젝트 디렉터리 / When plain `claude`(agent_type 없음/"claude")로 세션 시작 / Then common Tier0 가 **여전히 주입된다**(self-healable 도 productune 프로젝트로 인식 — config-OR-po-state 마커).
- BDD: Given productune 프로젝트지만 common Tier0 파일(`$HOME/.productune/doctrine/common/habit.md`)이 부재 / When productune 프로젝트 안에서 persona 미지정 세션 시작 / Then 기존 fail-loud(MISSING 안내 + install.sh 지시)가 그대로 동작한다.
- BDD: Given 임의 페르소나 세션(pdt-po/developer/qa/designer) / When 세션 시작 / Then 동작 무변경(페르소나 브랜치에서 emit+exit, fallback 미도달).
- BDD: Given `.productune/config.json` 은 있으나 `.productune/po-state.json` 이 아직 없는 fresh-init 프로젝트 / When persona 세션 시작 / Then Tier1 project habit 이 정상 주입된다(아래 CONSISTENCY 수정 결과).
- BDD: Given walk-up 마커 탐색 / When fs root 또는 `$HOME` 경계 도달 / Then 무한 루프 없이 not-found 으로 종료(기존 walk-up 패턴의 경계조건 준수).

## Out of scope

- 훅의 fallback 외 다른 분기(페르소나 브랜치 doctrine 주입 로직 자체)의 재설계.
- common/persona doctrine .md 본문(prose) 수정 — 본 티켓은 순수 스크립트(hook) 수정.
- install.sh / `~/.productune` mirror 변경(아래 DEPLOY note 참조 — 불필요).
- 마이그레이션 스캔(build_migration_block) 로직 변경.

## Plan

> assignee: **pdt-developer** · model: **sonnet** · effort: **medium**

대상 파일: `packages/core/scripts/hooks/session-start-doctrine.sh` (단일 파일).

### Step 1 — fallback 게이트 추가 (ROOT FIX)
- fallback 블록(현행 ~line 158-175, common Tier0 부재 fail-loud 직후 ~ 마지막 `emit_ctx` 직전)에 **productune-project 감지**를 선행한다.
- EVENT_CWD 에서 위로 walk-up 하여 **`.productune/config.json` 또는 `.productune/po-state.json`** 마커를 찾는다 — **둘 중 하나라도 있으면 productune 프로젝트로 판정하고 진행**한다. config-OR-po-state 인 이유: `config.json` 만 보면 self-healable 프로젝트(config 부재 + po-state 존재)를, `po-state.json` 만 보면 fresh-init 프로젝트(config 존재 + po-state 부재 — lifecycle 가 po-state 생성 전)를 각각 비-productune 으로 오분류한다. **둘의 OR 만이 양쪽(fresh-init·self-healable)을 모두 인식**한다.
- walk-up **루프 메커니즘 자체**(경계 처리: 동일한 `while [ -n "$PROJ" ] && [ "$PROJ" != "/" ]` 루프 + `dirname` 상승, fs root 에서 종료)는 기존 페르소나 브랜치 walk-up(현행 ~line 122-126)과 **동일 패턴을 재사용**한다. 단 **마커는 동일하지 않다(identical 아님)** — 이 fallback 게이트와 (Step 2 수정 후) Tier1 walk-up 은 config-OR-po-state 를 쓰지만, `build_migration_block()`(현행 ~line 44)은 의도적으로 `po-state.json` 단일 마커를 유지한다(PO-only 마이그레이션 경로 — D-140-1 참조). 즉 '패턴 재사용'은 루프/경계 처리에 한정이며, 마커 정의까지 같다는 의미가 아니다.
- 마커 미발견(`config.json`·`po-state.json` **둘 다 부재** = 진짜 비-productune) → **아무것도 주입하지 않고 `exit 0`**.
- 마커 발견 → 기존 fallback 동작(common Tier0 주입) 유지.
- 주의: common Tier0 부재 fail-loud(현행 line 160-166)는 **productune 프로젝트로 판정된 뒤에만** 의미가 있다. 비-productune 폴더에서는 fail-loud 도 띄우면 안 됨 → 게이트(프로젝트 감지)를 fail-loud 보다 **먼저** 둘 것. 즉 순서: (1) walk-up 으로 프로젝트 감지 → 아니면 exit 0, (2) 프로젝트면 common 부재 검사(fail-loud), (3) common 주입.

### Step 2 — CONSISTENCY: 페르소나 브랜치 Tier1 walk-up 마커 통일 (같은 root cause)
- 페르소나 브랜치 Tier1 walk-up(현행 line 124)은 마커로 `.productune/po-state.json` **만** 쓴다 → fresh-init 페르소나 세션(config 존재 + po-state 부재)은 po-state 가 생기기 전까지 **Tier1 project habit 을 주입받지 못한다**.
- 이 마커를 Step 1 fallback 게이트와 **동일한 config-OR-po-state** 로 통일한다(line 124 의 `[ -f "$PROJ/.productune/po-state.json" ] && break` → `{ [ -f "$PROJ/.productune/config.json" ] || [ -f "$PROJ/.productune/po-state.json" ]; } && break`).
- 결과: fresh-init(config-only) 와 self-healable(po-state-only) **양쪽** 프로젝트에서 Tier1 가 정상 주입되며, Step 1 fallback 게이트와 마커 정의가 정확히 일치한다.
- 단, `build_migration_block()`(현행 ~line 44)의 `po-state.json` 단일 마커는 **의도적으로 그대로 둔다(intentional divergence)** — PO-only 마이그레이션 경로이고, config 만 있는 fresh-init 에는 아직 마이그레이션 대상 po-state 가 없으므로 po-state 마커가 올바르다. **(옵션, developer 재량)** build_migration_block 도 동일 config-OR-po-state 로 통일 가능하나 **필수 아님** — 통일해도 fresh-init 에서 대상 없는 migration 스캔이 한 번 더 도는 것 외 해는 없다. 택일하되 divergence 를 명시할 것.

### Step 3 — 회귀 확인
- 페르소나 4종(po/developer/qa/designer) 세션이 종전과 동일하게 emit+exit 하는지(fallback 미도달) 확인.
- `set +e` 환경에서 walk-up 이 에러로 세션을 죽이지 않는지(훅은 SessionStart — block 불가, 단지 주입) 확인.

### §QA scope table

| 항목 | fixture | assertion |
|:--|:--|:--|
| 비-productune fallback 무주입 | `/tmp` (no `.productune`), agent_type="" 와 "claude" 두 케이스 | stdout 에 `additionalContext` 없음(빈 출력 또는 envelope 미생성), exit 0 |
| 비-productune @ HOME | `$HOME`(productune repo 아님), agent_type="" | common 미주입, exit 0 |
| 비-productune 임의 repo | `oh-my-eyes` 류 비-productune git repo, agent_type="" | common 미주입, exit 0 |
| productune fallback 정상 주입 | `.productune/config.json` 있는 프로젝트 루트, agent_type="" | common Tier0 주입됨(회귀 없음) |
| self-healable 인식(D-140-2) | `.productune/po-state.json` 있고 `config.json` **없는** 디렉터리, agent_type="" | common **여전히 주입됨**(config-OR-po-state 마커 → self-healable 도 productune 으로 인식) |
| productune 하위 디렉터리 | 위 프로젝트의 하위 폴더를 cwd 로, agent_type="" | walk-up 으로 마커 발견 → common 주입 |
| common 부재 fail-loud | productune 프로젝트 + common habit.md 임시 이동, agent_type="" | MISSING 안내 + install.sh 지시 주입 |
| 페르소나 무회귀 | agent_type="pdt-developer" @ productune 프로젝트 | 종전과 동일 doctrine 주입, fallback 미도달 |
| fresh-init Tier1 주입(Step 2) | `config.json` 만 있고 `po-state.json` 없는 프로젝트 + `docs/<persona>/habit.md` 존재, agent_type="pdt-designer" | Tier1 project 블록이 주입됨 |
| walk-up 경계 | cwd 가 fs root 근처/`$HOME` 밖 | 무한 루프 없이 종료, exit 0 |

### DEPLOY note
- 이 훅은 `~/.claude/settings.json` 에 **절대 repo 경로**로 등록되어 있다 → 파일 수정 시 **다음 SessionStart 부터 즉시 반영**. install.sh 재실행 불필요, `~/.productune` mirror 불필요(스크립트이지 doctrine .md 가 아님).

## Outcome
<!-- Phase 5 -->

## Persona Activity
<!-- PO-managed -->
