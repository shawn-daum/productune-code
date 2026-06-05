---
ticket_id: T-PATCH-043
version: v0.5
slug: doctrine-bootstrap-reliability
title: Reliable doctrine load at session start — machine-independent, resume-safe, fail-loud
type: impl
status: done
qa_status: pass
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: po-bootstrap
estimated_complexity: L5
risk_flags:
  - session-bootstrap-blast-radius
  - install-uninstall-hook-registration
  - platform-hook-semantics-print-resume
created_at: 2026-06-05T00:00:00Z
---

# T-PATCH-043: Reliable doctrine load at session start

## Request

다른 기기(user `coolcoolk`)에서 PO 세션이 doctrine 위반(코드 직접 작성, 티켓 본문 작성). 원인: agent pointer `packages/core/agents/pdt-po.md`가 세션 시작에 **`~/.productune/...habit.md`를 Read** 시키는데, Read 툴은 `~`를 확장 안 함 → 모델이 홈을 추측(`/root/`) → 실패 → **실패하고도 그냥 진행**(silent) → doctrine 없이 "작업 완수" 모드.

두 버그: (1) `~` 미확장 → 홈 추측 실패, (2) 읽기 실패 후 무중단 진행. 기기 무관하게 doctrine이 매 턴 확실히 로드돼야 함.

**QA grill + 플랫폼 검증으로 확정된 설계 사실 (재발견 금지):**
- SessionStart hook은 `--print`(headless)에서도, `--resume`에서도 발화(matcher `startup`/`resume`). 입력 JSON에 `agent_type`(optional, `--agent` 사용 시) 포함 → persona 식별 가능.
- **단, `--resume` 턴은 productune이 `--agent`를 재전달 안 함**(`po-runner.ts:345`) → agent system prompt(agent pointer 본문)가 resume 턴에 유실됨(문서상 미보장). GUI 턴 대부분이 resume → **pointer-only fix는 resume 턴 미커버.**
- SessionStart hook은 **세션을 hard-block 불가**(exit 2 = stderr만, 진행 계속). 차단 가능 이벤트 = **PreToolUse**(`{"decision":"deny"}` / exit 2). → "doctrine 없으면 중단"은 PreToolUse로만 강제.
- 컨텍스트 주입 = stdout 또는 `hookSpecificOutput.additionalContext`.
- `post-compact-doctrine.sh:17`은 `<<'EOF'`(단일쿼트) → 주입 텍스트의 `~`가 **리터럴**(같은 버그 잠복). `$HOME` 확장은 `[ -f ]` 체크에만 쓰임.
- doctrine **본문**에도 `~` 경로 산재(예: `po/habit.md`의 "Read `~/.productune/po/habit.md`") → pointer만 고쳐도 habit.md 안에서 또 `~` 밟음.
- agent pointer는 repo→`~/.claude/agents/*.md` **symlink**(`install.sh:340`) → pull만으로 갱신(re-install 불요). hook은 `install.sh` jq merge로 등록(현재 PreToolUse/PostToolUse/PostCompact/Stop만; SessionStart 없음).

## Acceptance

- [AC1] **resume `--agent` 재전달**: GUI(`po-runner.ts:345`) + CLI(`scripts/productune`) resume 경로가 `--agent <persona>`를 재전달 → resume 턴에도 agent system prompt(hardened pointer) 상주. 검증: resume 턴 컨텍스트에 pointer 지시 존재.
- [AC2] **SessionStart hook 신설**: matcher `startup`+`resume`. 입력 `agent_type`로 persona 판별 → 해당 persona doctrine essentials + **`$HOME` 확장 절대경로**(리터럴 `~` 금지) 주입(additionalContext/stdout). `agent_type` 부재(resume 등) 시 persona-agnostic 폴백("`$HOME` 해석 → 네 pointer가 지정한 파일을 Bash로 읽어라"). Tier0 파일 부재 시 fail-loud.
- [AC3] **리터럴 `~` 주입 0**: 신규 hook + 기존 `post-compact-doctrine.sh` 둘 다 `$HOME` 확장 절대경로 주입(unquoted heredoc/`printf`+vars). 주입 텍스트에 `~` 리터럴 없음.
- [AC4] **pointer 강화 (4개)**: `pdt-{po,developer,qa,designer}.md`의 "Read `~/...`"를 — (a) Bash `cat`으로 로드(셸이 `~` 확장; Read 툴은 안 함; 홈 추측 금지), (b) 읽기 실패 시 중단+사용자 통지(install.sh 재실행), doctrine 없이 진행 금지 — 로 교체.
- [AC5] **doctrine 본문 `~` 일소**: 모델에게 Read 시키는 unexpanded `~` 경로를 doctrine prose에서 제거(Bash-cat 또는 `$HOME` 해석 안내로). 잔존 실패모드(habit.md 내부 `~`) 차단.
- [AC6] **PreToolUse hard-stop**: Tier0 doctrine 파일 부재 시 tool 실행 deny(headless 동작). proceed-anyway에 대한 실제 강제(prose 아님).
- [AC7] **install/uninstall 등록**: SessionStart + PreToolUse hook을 `install.sh` jq merge에 추가 + 스크립트 경로를 `install.sh`/`uninstall.sh`의 `is_pdt` strip 목록에 추가. (미등록 시 미발화/미제거.)
- [AC8] **cleanup**: `pdt-po.md`에 누락된 `~/.productune/doctrine/common/habit.md`(common Tier0) 줄 추가(나머지 3개와 정합). post-compact `~`-리터럴 버그 수정(AC3에 포함).
- [AC9] **cross-machine 재현 검증**: coolcoolk 시나리오 모의 — 다른 `$HOME`에서 세션 시작 → doctrine이 홈 추측 없이 로드; resume 턴 → doctrine 상주; Tier0 부재 → silent-proceed 아니라 hard-stop.
- [AC10] cap/actor-voice/mirror(doctrine prose 변경분) + `tsc`/lint(코드 변경분) 통과.

## Out of scope

- doctrine **내용** 변경(로딩 메커니즘 + `~` 경로만; 규칙 내용 X).
- compaction 동작/임계 튜닝(T-PATCH-040).
- non-claude 엔진(`MY_PO_ENGINE != claude`) bootstrap.
- GUI의 close_gate/기타 렌더링.

## Plan

> 멀티-persona. PO가 split 오케스트레이션(직접 Write 안 함). **dev**: hooks(SessionStart/PreToolUse) + post-compact 수정 + `install.sh`/`uninstall.sh` 등록 + `po-runner.ts`/`productune` CLI resume `--agent` 재전달. **designer**: agent pointer 4개 강화(AC4) + doctrine 본문 `~` 일소(AC5) + pdt-po common 줄(AC8) — doctrine-editing P0 룰(act-time voice/cap/mirror) 주입.

### Investigate-first (plan 단계 확정)
- `po-runner.ts:344-350` args 빌드 — resume 분기에 `--agent` 추가 시 부작용(세션 복원과 충돌?) 확인. 검증된 사실: `--resume`는 `--agent` 미보존 → 재전달이 옳음.
- `install.sh:104-148` hook jq merge + strip 목록, `uninstall.sh:163-181` — SessionStart/PreToolUse 블록 추가점.
- SessionStart `agent_type`가 **resume 턴에도** 입력에 오는지(원세션이 `--agent`로 시작됨) — plan 단계 live 확인(미보장 영역). 안 오면 AC1(resume 재전달)이 persona 식별을 보장하므로 AC2 폴백과 함께 안전.
- PreToolUse deny가 `--print`에서 동작하는지 live 확인.

### Build (확정 후)
1. dev: SessionStart hook(`$HOME` 절대경로, persona별/폴백, fail-loud) + 등록.
2. dev: PreToolUse hard-stop hook + 등록.
3. dev: post-compact `~`-리터럴 수정.
4. dev: resume `--agent` 재전달(GUI+CLI).
5. designer: pointer 4개 강화 + 본문 `~` 일소 + pdt-po common 줄(+ mirror).
6. QA: AC9 cross-machine 재현(다른 `$HOME`, --print, resume, missing-doctrine) + AC6/AC1 동작.

### Verify
- AC9 우선: 모의 `$HOME`로 fresh+resume+missing 3케이스. echo-mode 안전 noop.
- 회귀: 정상 PO 세션 startup/resume 동작 유지, install/uninstall 멱등.

## Outcome

Shipped. Bootstrap now machine-independent + resume-safe + fail-loud.

- **dev**: SessionStart hook `session-start-doctrine.sh` ($HOME-expanded paths, persona via `agent_type` + agnostic fallback, fail-loud, additionalContext) + PreToolUse hard-stop `pre-doctrine-guard.sh` (deny only when `agent_type=pdt-*` AND Tier0 missing; fail-OPEN everywhere else; matcher `Write|Edit|Bash`) + post-compact `~`-literal fix + install.sh/uninstall.sh registration (idempotent) + po-runner.ts resume `--agent` re-pass + productune CLI guard comment.
- **designer**: 4 agent pointers hardened (Bash-cat load, never-guess-home, STOP-if-missing) + pdt-po common Tier0 line (AC8) + `~`-sweep on doctrine bodies (4 read-implied paths → $HOME+cat; write-targets/Bash-args correctly left).

QA sign-off: 3 CRUX (PreToolUse blast-radius / SessionStart injector / install idempotency) verified by direct execution; AC1-AC10 pass; mirror 6/6 byte-identical; pointer caps ≤30. tsc confirmed green.

Activation: requires `install.sh` re-run per machine (registers the 2 hooks into ~/.claude/settings.json). Agent-pointer + doctrine-body changes propagate by `git pull` (symlink + mirror-on-install).

Non-blocking followups (backlog): uninstall.sh `is_pdt` pre-existing omission of `pre-delegate-ctx-lang.sh` + `pre-git-posture.sh` (orphan-on-uninstall, predates this ticket).

## Persona Activity

| persona | session_id | started_at | completed_at | model | effort |
|:--|:--|:--|:--|:--|:--|
