---
ticket_id: T-PATCH-246
version: v0.5
slug: gui-onboarding-no-claude-hooks-install
title: GUI 온보딩이 claude hooks/statusLine을 미설치 — dmg 사용자는 enforcement 훅 없이 관리형 PO 구동 (north-star 터미널-0 충돌)
type: design
status: done
phase: 4
assignee: pdt-designer
requires_qa: true
qa_status: pass
requires_user_gate: true
area_tag: onboarding
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-23T00:00:00Z
---

# T-PATCH-246: GUI 온보딩 hooks 미설치 갭

## Request

post-deploy smoke(2026-06-23, dmg 라이브 VM) 중 PO 발견: GUI 온보딩으로 설치된 VM에
**`~/.claude/settings.json`이 아예 없음** → productune deterministic hooks
(pre-frontmatter-lint · pre/post-po-state-shape-guard · session-start-doctrine ·
pre-phase-gate-guard · post-delegate-state-write 등) + statusLine이 **미배선**.

소스 확인: `electron/ipc/onboarding.ts` `completeOnboarding`는 5스텝(env 작성 · agent 심링크 ·
PO instructions · long-term memory · Playwright MCP 캐시)만 수행 — **hooks/statusLine 설치
코드 0**. GUI 자체 로케일도 이를 전제: `locales/ko.json` "~/.claude/settings.json 에 hooks
설정이 없어요" / "추가: install.sh 통해 등록" — 즉 **hooks는 install.sh(터미널) 전용 설계**.

## 문제 (왜 중요한가)

- dmg 배포 대상 = 비개발자 팀원(**v0.5 north-star: 터미널 0, GUI-only 풀사이클**). 그런데
  hooks 설치가 `install.sh`(터미널)를 요구 → dmg-only 사용자는 hooks를 **영영 못 받음**.
- 결과: GUI가 spawn하는 관리형 PO(`claude --agent pdt-po`)가 **deterministic 강제훅 없이**
  구동 → frontmatter enum/regex lint, po-state setter/shape 가드, doctrine 주입,
  cost-strip 등이 안 걸림. discipline이 agent 시스템프롬프트(연성)에만 의존, 하드 게이트 부재.
- v0.5 핵심 가치(관리형 PO의 안전한 GUI-only 경험)를 약화.

## 조사 결과 (2026-06-23, "더 조사 먼저" user 지시)

**확정: GUI 경로엔 대체 backstop 없음 — claude-spawn PO 쓰기는 완전 무방비.**

- install.sh가 까는 **PreToolUse 차단기 8개**(`Write|Edit|Bash` 매처): `pre-doctrine-guard` ·
  `pre-frontmatter-lint` · `pre-po-state-shape-guard` + Bash매처(`pre-delegate-task-check` ·
  `pre-delegate-ctx-lang` · `pre-chunking-warn` · `pre-git-posture` · `pre-phase-gate-guard`).
  PostToolUse 5개 + SessionStart 2개 + Stop/PostCompact/UserPromptSubmit. (install.sh:138~183)
- 이 훅들은 **claude PO 서브프로세스 자신의 tool-call(Write/Edit/Bash)** 을 게이팅함. claude는
  bypassPermissions로 파일을 직접 씀 → **GUI(메인프로세스)는 claude의 tool write를 가로챌 수
  없음.** 유일한 게이트 경로 = `~/.claude/settings.json` 훅. 그게 없으니(GUI 온보딩 미설치)
  **PO의 po-state/티켓/doctrine 쓰기가 lint·shape-guard·doctrine-guard 없이 통과.**
- GUI 자체 IPC write(`state.ts:52` phase:approve "Direct mechanical write to po-state.json")도
  shape-guard 미경유(backlog close_gate parity 기지 이슈) — 별개지만 같은 무방비.
- electron 전역에 settings.json 훅 write 코드 0(앱시작·po-runner 어디에도). `project.ts`
  self-heal은 프로젝트 config 감지용이지 훅과 무관.

**여전히 받는 것**: `--agent pdt-po`로 **doctrine 지식(연성 규율)** 은 시스템프롬프트에 로드됨 →
PO가 규칙을 "알긴 함". 즉 무정부는 아니나, **실수를 결정적으로 잡는 하드 안전망(8 차단기)이
부재** = 이 훅들이 막으려던 회귀(malformed frontmatter·bad po-state write)가 dmg 빌드에선 통과 가능.

**심각도**: 중상(中上). dmg=배포 아티팩트인데 안전/규율 레이어가 빠짐. 단 doctrine 지식은
있어 즉각 파탄은 아님.

## 해결 방향

dmg self-sufficient화: `completeOnboarding`이 install.sh의 hook-install(jq merge into
`~/.claude/settings.json`, 멱등)을 **GUI 경로로 포팅/호출**. uninstall(앱 제거)도 strip parity.

## blocker 판단 (user)

- **내부 dogfood**: install.sh 1회 병행하면 훅 확보 가능 → 문서화 시 당장 비블로커 가능.
- **v0.5 north-star(비개발자·터미널-0·GUI-only)**: 훅이 터미널 요구 → north-star 시나리오엔
  **실질 blocker**. north-star를 이 버전에 추구하면 v0.5 fix, 아니면 v0.6 + 명시 prereq.

## Acceptance (방향 — designer plan + user-gate 후 확정)

- **AC-1**: GUI 온보딩 완료 후 `~/.claude/settings.json`에 productune hooks(install.sh와
  동일 셋) + statusLine이 설치된다 — 터미널/install.sh 불필요.
- **AC-2**: 재온보딩/업데이트 시 멱등(중복 hook 미생성, 기존 사용자 설정 보존 — install.sh의
  jq merge 패턴 재사용).
- **AC-3**: dmg clean-install(cua VM, install.sh 미실행)에서 hook 발화 확인(예: 잘못된
  frontmatter write가 pre-frontmatter-lint로 BLOCK).
- **AC-4**: uninstall(앱 제거)도 hooks strip — uninstall.sh와 parity(이번에 정합한 is_pdt).

## Out of scope
- hook 자체 로직 변경. close_gate GUI write-path parity(별도 backlog 항목).

## 메모
post-deploy smoke 7/7 PASS 중 이 항목만 enforcement 갭. 앱 기본 기능(온보딩·엔진 라운드트립·
PO turn)은 정상 동작 — 안전/discipline 레이어 부재가 쟁점. v0.5 blocker 여부 = user 판단.

## 구현 (2026-06-23, user "gui 포팅 재빌드" 지시)

`electron/ipc/onboarding.ts`: `installClaudeHooks(coreDir)` 신규 — install.sh의
`merge_claude_settings_hooks` + `merge_claude_settings_statusline`를 TS로 포팅(멱등:
path-prefix OR known-basename으로 기존 pdt 엔트리 strip 후 재추가, 유저 훅 보존). 명령은
**번들 core**(`coreDir/scripts/hooks/*.sh` + `statusline-productune.sh`) 경로 → 패키지 앱에서
resolve. `completeOnboarding` step 5b에서 호출(best-effort try/catch, 비치명적).
`OnboardingWizard.tsx` completionStepKeys + en/ko locale에 `hooks` 스텝 추가.
- 안전성: 핵심 훅 fail-OPEN 설계 확인(`pre-doctrine-guard` `command -v jq || exit 0` 등) →
  jq/python3 없는 머신에서도 브릭 안 됨(미설치=현상유지, 설치=강제발동). 번들 훅 +x 보존 확인.
- tsc PASS · locale parity 901키. **잔여: 재빌드 + cua-VM 재온보딩으로 settings.json 18훅+
  statusLine 생성 라이브검증.**

## Live-verify (2026-06-23, cua-VM clean re-onboard) — PASS

3차 dmg(sha fdf8b36…) VM 재설치 → productune.env 제거 → GUI 재온보딩 완주. 결과:
- "Setup complete"에 신규 스텝 **"Install enforcement hooks + statusline" ✓** 표시(6스텝).
- `~/.claude/settings.json` **GUI가 생성** — 이전엔 부재. hook entries **18개**(PreToolUse 8 ·
  PostToolUse 5 · PostCompact 1 · Stop 1 · SessionStart 2 · UserPromptSubmit 1) = install.sh 동일.
- 18/18 command + statusLine 모두 **번들 app core**(`/Applications/productune.app/Contents/
  Resources/core/scripts/...`) 경로 → 패키지 앱에서 resolve. 번들 훅 +x 보존.
- VM에 **jq 1.7.1 present → 훅 실제 ENFORCE**(fail-open 아님). AC-1/2/3 충족.
- AC-4(uninstall parity): uninstall.sh `is_pdt`가 basename으로 strip(이번에 orphan 4 정합) →
  번들-경로 훅도 제거됨. 충족.

→ dmg = self-sufficient. 터미널-0으로 enforcement 확보 = v0.5 north-star 정합.

## Outcome
shipped — 3차 dmg(productune-0.5.0-arm64.dmg)에 포함, cua-VM 라이브검증 PASS.

## Persona Activity
(PO-managed)
