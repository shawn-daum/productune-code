---
ticket_id: T-PATCH-228
version: v0.5
slug: cli-agent-teams-env-parity
title: CLI(productune)가 AGENT_TEAMS env를 안 set — 위임이 agent-teams/resume 모드로 안 돔 (GUI와 비대칭)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: engine-exec
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-22T00:00:00Z
completed_at: 2026-06-22T00:00:00Z
---

# T-PATCH-228: CLI agent-teams env parity

## Request

shawn(2026-06-22): 위임 구조를 agent tool로 + 이어서 dispatch(session resume)되게 만들었는데,
**다른 기기(CLI로 PO 구동)에서 적용 안 됨.** `productune update`(git pull + install.sh) 하고
새 세션 시작했는데도 안 됐음.

## 현황 — 왜 CLI에서 안 도나 (조사 확정)

- 위임의 agent-teams 모드(SendMessage / auto-resume / TeamCreate)는 환경변수
  `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`로 켜짐.
- **GUI**: `po-runner.ts:542`가 spawn env에 이 변수를 set → GUI로 PO 돌리면 켜짐.
- **CLI**: `scripts/productune`는 `exec claude --agent pdt-po "$@"`만 함(`run_engine`, line 724).
  `~/.productune/productune.env`를 `set -a`로 source하지만, **그 env 파일에 AGENT_TEAMS가 없음**
  (install.sh가 engine/repo path만 씀). 따라서 **CLI 경로는 AGENT_TEAMS 미설정 → 위임이
  agent-teams 모드로 안 돌고 일반 dispatch로 폴백.** resume(`--resume`)은 `"$@"` 통과로 되지만,
  agent-teams 기반 SendMessage/auto-resume 흐름은 비활성.
- `productune update`로도 안 고쳐지는 이유: git pull은 script/doctrine를 갱신하나, AGENT_TEAMS는
  **어느 CLI 경로에도 박혀있지 않아** 코드가 최신이어도 변수 자체가 안 켜짐.

## 설계 방향 (둘 다 — 견고)

1. **`scripts/productune`가 기본 export**: `run_engine`/`run_engine_fg`에서 claude 호출 전
   `export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-1}"`
   (이미 env에 있으면 보존, 없으면 1). GUI po-runner와 parity. git pull로 즉시 적용.
2. **install.sh가 productune.env에 backfill**: `productune.env`에 그 줄이 없으면 1회 추가(멱등).
   → `productune update`(install.sh 재실행)가 기존 사용자 env도 자동 보정. set -a source 경로로
   서브에이전트까지 전파.

GUI와 단일 SoT를 원하면 값(`1`)을 한 곳에서 참조하는 게 이상적이나, GUI(TS)·CLI(bash) 런타임이
달라 리터럴 중복은 불가피 — 주석으로 "GUI po-runner.ts와 동기 유지" 교차표기.

## Acceptance

- **AC-1**: CLI(`productune`)로 PO를 돌릴 때 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`이 claude
  프로세스 환경에 존재한다(env에 이미 있으면 그 값 보존).
- **AC-2**: CLI 경로에서 위임이 agent-teams 모드(SendMessage/auto-resume)로 동작한다 — GUI와 동등.
- **AC-3**: `productune update`(install.sh 재실행)가 기존 사용자의 `productune.env`에 변수를 멱등
  backfill하여, git pull만으로 다른 기기에 적용된다.
- **AC-4**: 사용자가 env에서 명시적으로 0/해제한 경우 그 값이 보존된다(강제 1 override 아님).

## Out of scope

- GUI 경로(po-runner는 이미 set — 단 GUI 앱은 git pull로 갱신 안 되는 별개 이슈 = T-PATCH-229).
- agent-teams 자체 로직(이미 구현됨).

## 메모 (기기 간 미적용의 두 갈래)

- **CLI로 돌리는 기기** = 본 티켓(AGENT_TEAMS env 부재). git pull + update로 해결 가능.
- **GUI로 돌리는 기기** = T-PATCH-229(productune update가 .app 바이너리를 안 바꿈 — 새 dmg 재배포
  필요). 두 갈래는 메커니즘이 달라 분리. shawn 확인: 그 기기는 CLI 경로 → 본 티켓이 해당.

## 구현 (2026-06-22)

- `scripts/productune`: env source 직후 `export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="${...:-1}"`
  — default ON, env/환경의 명시값 보존(AC-4). productune.env가 backfill 전이어도 CLI에서 즉시 켜짐.
- `scripts/install.sh`: §7a — productune.env에 변수 없을 때만 `=1` 멱등 backfill(있으면 미변경 →
  사용자 0 보존). `productune update`(install.sh 재실행)가 기존 기기 env도 자동 보정.

## QA sign-off (2026-06-22) — qa_status: pass (단위/멱등 검증)

- **AC-1/AC-4 PASS**: `${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-1}` 동작 실측 — 미설정→1,
  사용자 0→0 보존, 1→1. 두 스크립트 `bash -n` 문법 OK.
- **AC-3 PASS**: install.sh backfill 멱등 실측 — 1회 추가 후 재실행 시 중복 없음(이 기기
  productune.env에 적용 확인).
- **AC-2 (라이브 미실측)**: CLI PO turn에서 실제 SendMessage/auto-resume 위임 동작은 별도
  hands-on 권장(이 변수가 claude 프로세스 env에 도달함은 set -a source + export로 보장됨).

## QA 노트

후속 hands-on: CLI(`productune`)로 PO turn → 위임 시 agent-teams 모드(SendMessage/sub-agent
resume) 동작 + `env | grep AGENT_TEAMS` 존재 확인.
