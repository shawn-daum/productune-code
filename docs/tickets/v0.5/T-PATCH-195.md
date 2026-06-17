---
ticket_id: T-PATCH-195
version: v0.5
slug: cli-artifact-path-reveal
title: CLI 아티팩트 산출 시 — 폴더 reveal 유지 + 터미널에 Cmd-클릭 가능한 절대경로 출력
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pending
requires_user_gate: false
area_tag: artifact-delivery
risk_flags: [headless-safety, never-before-codified]
estimated_complexity: L2
created_at: 2026-06-17T00:00:00Z
---

## Problem
CLI 세션에서 에이전트가 아티팩트(목업/PRD/티켓 등 user-gate 산출물)를 만들면 Finder 폴더가 자동으로 열린다 — 사용자는 이 동작을 좋아한다. **그러나 절대경로가 터미널에 한 번도 찍히지 않는다.** 그래서 사용자가 Finder 창을 닫으면 다시 열 방법이 없다(터미널에 찍힌 경로면 Cmd+클릭으로 재오픈 가능).

요청: 아티팩트 산출 시 → **폴더 reveal는 그대로 유지** + **터미널에 Cmd-클릭 가능한 절대경로를 출력**.

## 사전 조사 (PO 확정 — 재검증 불요, 위에 빌드)
productune에 "아티팩트 후 폴더 자동 오픈" 메커니즘은 **코드화된 적이 없다.** `~/.claude/settings.json` 훅(Pre/Post/Stop/SessionStart 전수) · `packages/core/scripts/hooks/*` · `packages/core/doctrine/persona/**` · `productune` 런처 어디에도 `open`/reveal/print-path 룰 없음. 사용자가 본 동작은 **ad-hoc 에이전트 즉흥 행동**(어떤 페르소나/PO가 `open`을 즉석에서 실행)이었지 룰이 아니었다. → 이 티켓은 그 동작을 **처음으로 제대로 코드화**한다.

## 핵심 결정 — 어느 스트림이 load-bearing인가 (claude-code-guide 권위 확인)
요구의 핵심("**사용자가** 터미널에서 Cmd+클릭")은 출력이 **사용자에게 보이는 터미널 transcript에 plain text로 렌더**되어야 충족된다. Claude Code 훅 동작 확인 결과:

- PostToolUse 훅 **exit 0 + plain stdout → 모델(Claude) 컨텍스트**(system-reminder/additionalContext)로 들어감. **사용자 터미널에 직접 안 보임.**
- exit 0 + JSON stdout → 구조화 제어로 파싱(`hookSpecificOutput` 등). 역시 사용자 터미널 직출력 아님.
- exit 2 + stderr → 모델 피드백. 사용자 터미널의 Cmd-클릭 가능 라인 아님.
- `systemMessage`/`terminalSequence`(OSC 777)는 메시지/알림이지 클릭 가능한 경로 라인이 아님.

→ **결론: 사용자 터미널에 Cmd-클릭 가능한 경로를 놓을 수 있는 주체는 "Claude가 자기 응답 텍스트로 직접 출력"하는 것뿐.** 훅 stdout으로는 불가. **따라서 PATH-PRINTING은 반드시 doctrine(에이전트 행동)으로 코드화한다.**
단, 훅은 **side-effect로 `open -R` 실행은 가능**하고(사용자가 본 Finder 오픈이 바로 그 종류) `[ -t 1 ]` / 이벤트 payload로 headless 감지도 가능. 즉 reveal는 훅으로도 doctrine으로도 가능 — 그러나 PATH-PRINTING이 충족 안 되면 의미 없다.

## 메커니즘 비교

| # | 메커니즘 | 경로가 사용자에게 Cmd-클릭 가능해지나 | 신뢰성/결정성 | headless/CI 안전성 | blast-radius |
|---|---|---|---|---|---|
| 1 | PostToolUse 훅(Write\|Edit)이 아티팩트 경로 감지 → 절대경로 출력 (+옵션 `open -R`) | **불가** — stdout은 모델로 감, 사용자 터미널 직출력/클릭 라인 아님. (reveal `open`만 side-effect로 가능) | 출력 자체는 결정적이나 *요구를 못 채움* | `open`은 `[ -t 1 ]`+`command -v open`+ payload 가드로 안전화 가능 (fail-open) | 전역 훅 — 모든 Write/Edit에 발화, 아티팩트 외 trivial write까지 스팸 위험 → 경로 스코프 필요 |
| 2 | **Doctrine 룰** (Tier0 common habit): 아티팩트 finalize 시 에이전트가 절대경로를 응답에 출력 + reveal | **가능** — Claude 응답 텍스트 = 사용자 transcript = Cmd-클릭 가능 | LLM 행동이라 비결정적(가끔 누락 가능) — AC/QA-grill로 강제 | 에이전트가 headless 판단 가능, `open`은 조건부. 룰에 "non-TTY/headless면 reveal 생략, 경로는 항상 출력" 명시 | common habit 1줄 — 모든 워커 페르소나 영향(의도된 범위), 코드 0줄 |
| 3 | **Hybrid (권장)**: Doctrine이 PATH-PRINTING 소유(요구의 보편선) + reveal는 doctrine 지시(선택적 nice-to-have). 훅은 **이번엔 불채택**(요구 충족 못 하면서 blast-radius만 키움) | **가능** (doctrine 경로로) | path-print은 AC 강제, reveal은 best-effort | doctrine에 headless 가드 내장 | Tier0 common habit 1블록, 코드 0줄 |

## 채택 메커니즘 — #3 Hybrid (doctrine-primary, 코드 0줄)
- **PATH-PRINTING (보편적으로 옳은 부분) = doctrine로 코드화.** 에이전트가 아티팩트를 finalize할 때 응답 텍스트(lite, user_lang)로 **절대경로 1줄을 출력**한다. 이것만이 사용자 Cmd-클릭을 충족.
- **REVEAL (nice-to-have) = 같은 doctrine 룰에서 지시**, 단 GUI/인터랙티브일 때만. `open -R <abs>`는 macOS·TTY·GUI 조건에서만; headless/CI/non-TTY면 생략하고 **경로 출력은 그대로 유지**.
- **훅(#1)은 이번 라운드 불채택.** 이유: 사용자 요구(Cmd-클릭)를 stdout으로는 못 채우고, 전역 Write/Edit 발화로 blast-radius/스팸만 키운다. (향후 reveal-만 자동화를 하고 싶을 때 별도 티켓으로 아티팩트-스코프 훅 검토 가능 — 단 그땐 경로 스코프 `docs/artifacts/<version>/` 가드 필수.)

### 거부된 대안 (rejected)
- **#1 단독 훅**: stdout이 모델로 가서 사용자 터미널에 클릭 가능 경로를 못 놓음(요구 미충족). 전역 매처라 trivial write 스팸. → reject.
- **JSON `systemMessage`/`terminalSequence` 훅 출력**: 메시지/알림이지 클릭 가능 경로 라인 아님. → reject.
- **reveal를 무조건 실행**: headless/CI에서 `open` 실패/무의미. → reject (조건부만 허용).

## 스코프 (스팸 방지 — "진짜 아티팩트"에만)
common habit의 write-map상 user-gate 아티팩트로 한정: `docs/artifacts/<version>/<ticket-id>-<slug>.<ext>` (+manifest.json). 즉 mockup/PRD.html/디자인시스템 등 **user-gate 산출물**만 트리거. 내부 self-verified 파일·티켓 본문 등 일반 Write는 트리거 안 함. (티켓/PRD master 같은 SoT 산출도 "사용자가 직접 읽는" 딜리버러블이면 동일 룰 적용 가능 — 단 1차 스코프는 `docs/artifacts/<version>/`로 보수적으로 잡고 QA가 경계 검증.)

## Files to touch (SoT만 편집 — 미러는 PO/install)
- **SoT (편집 대상):** `packages/core/doctrine/common/habit.md`
  - `### 2. Do the work`의 아티팩트 write-map 인근에 룰 1블록 추가(additive only): "아티팩트 finalize 시 절대경로 1줄 출력(user_lang, Cmd-클릭 가능) + GUI·TTY일 때만 `open -R`; headless/non-TTY면 reveal 생략, 경로 출력은 유지."
- **Mirror (PO 담당, 직접 편집 금지):** `~/.productune/doctrine/common/habit.md` — `install.sh` step 2c가 `cp -r doctrine/. ~/.productune/doctrine/`로 미러(byte-identical). SoT 편집 후 PO가 install 재실행 또는 미러-verify.
- 코드/훅 파일: **변경 없음** (#3 채택으로 0줄).
- **SoT/mirror pair**: `packages/core/doctrine/common/habit.md` ↔ `~/.productune/doctrine/common/habit.md`.

## Acceptance Criteria (BDD)
- [ ] **Given** 에이전트가 user-gate 아티팩트를 `docs/artifacts/<version>/<ticket-id>-<slug>.<ext>`로 finalize, **When** PO에 보고/사용자에게 surface, **Then** 응답 텍스트(user_lang, lite)에 해당 파일(또는 폴더)의 **절대경로 1줄**이 포함된다 — 사용자가 터미널에서 Cmd+클릭으로 열 수 있는 형태.
- [ ] **Given** 같은 산출, **When** 세션이 GUI macOS session (`launchctl managername` == Aqua, `open` present) — NOT TTY, **Then** 폴더 reveal(`open -R <abs>` 또는 동급)가 실행되어 Finder가 열린다(기존 호감 동작 유지).
- [ ] **(headless-safety) Given** 세션이 headless/CI/non-TTY(또는 `open` 미존재), **When** 산출, **Then** reveal는 **실행되지 않고**(에러 없이 skip), **절대경로 출력은 그대로 유지**된다. reveal 실패가 작업을 블록하지 않는다(fail-open).
- [ ] **(스팸 가드) Given** 에이전트가 아티팩트가 아닌 일반 파일(내부 self-verified, 티켓 본문 등)을 Write, **When** 그 Write, **Then** 경로-출력/reveal 룰이 트리거되지 않는다.
- [ ] **(SoT/mirror) Given** doctrine 룰이 `packages/core/doctrine/common/habit.md`에 additive로 들어감, **Then** 기존 라인 무수정(additive only)이고, `~/.productune/doctrine/common/habit.md` 미러는 PO가 `install.sh`로 동기화(designer는 SoT만 편집).
- [ ] **(언어) Given** 경로 출력 라인, **Then** 경로/식별자는 영문 그대로, 안내 문구는 `[ctx].user_lang`(한글) — common habit 언어 규칙 준수.

## Note
- Tier1 규칙상 doctrine 편집은 designer 작성, PO가 미러-verify + QA-grill 후속. 이 티켓이 Tier0 룰을 넣으므로 SoT/mirror pair는 위 Files 절에 명시됨.
- 이 dispatch는 **PLAN + 티켓 발행 전용** — 코드/doctrine 편집 없음.
