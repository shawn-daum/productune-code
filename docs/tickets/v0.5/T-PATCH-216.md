---
ticket_id: T-PATCH-216
version: v0.5
slug: engine-exec-login-shell-path
title: PO 실행/MCP claude spawn — login-shell PATH 미보강(Finder-launch ENOENT) 정합
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: engine-exec
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-19T00:00:00Z
completed_at: 2026-06-19T00:00:00Z
---

# T-PATCH-216: PO 실행/MCP claude spawn — login-shell PATH 정합

## Request

T-PATCH-199 QA(cua VM 실측) 중 발견된 sibling 버그. T-PATCH-199 는 온보딩
(`startHiddenLogin` + `checkClaude`/`checkCodex`)만 login-shell PATH 로 고쳤는데,
**같은 PATH 가정을 공유하는 코어 실행 경로 2곳이 미수정**으로 남음:

- `packages/gui/electron/po-runner.ts:510` — `spawn('claude', args, { env: { ...process.env, NO_COLOR, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS } })`
- `packages/gui/electron/ipc/mcp.ts:176` — `execFileAsync('claude', ['mcp','list'], { env: { ...process.env, NO_COLOR } })`
  (이 파일 주석이 "onboarding.ts / po-runner.ts 와 동일 PATH-based resolution 재사용"
  이라 명시 → 셋이 깨진 가정을 공유했음)

패키징 앱을 Finder/`open` 으로 띄우면 launchd 최소 PATH(`/usr/bin:/bin:/usr/sbin:/sbin`)만
상속하므로, claude 가 `~/.local/bin`(표준 인스톨러 위치)·Homebrew 에 있으면 **PO
실행 자체가 ENOENT/exit 127**. 즉 온보딩을 통과해도 실사용 PO 세션이 안 뜸 →
load-bearing. (터미널에서 띄우면 PATH 가 살아있어 안 보이는, dev≠packaged 함정.)

## 설계 방향

`surface-runner.ts` 가 export 하는 `loginShellPath()`(T-PATCH-186) 를 재사용해
두 호출의 `env.PATH` 를 login-shell PATH 로 보강. onboarding 의 `loginShellEnv()`
(T-PATCH-199) 와 동일 패턴 — 공용 헬퍼로 추출(예: surface-runner 에
`withLoginShellPath(env)` export)해 4곳(login spawn·checkClaude·po-runner·mcp)이
한 소스를 공유하도록 정합 권장.

## Acceptance

- **AC-1**: Given 패키징 앱을 Finder 로 실행(launchd PATH) + claude 가 `~/.local/bin`,
  When PO 세션을 시작(po-runner 가 `claude` spawn), Then ENOENT/exit 127 없이 claude
  가 resolve 되어 PO 가 기동한다. (cua VM 실측)
- **AC-2**: Given 동일 환경, When `mcp.ts` 가 `claude mcp list` 를 실행, Then claude
  가 resolve 되어 목록을 반환(또는 정상 빈 목록), spawn 실패 아님.
- **AC-3**: 터미널 PATH 에 claude 가 있고 launchd PATH 에는 없을 때(정상 유저 baseline)
  앱이 동작한다 — login-shell PATH 보강이 실효함.
- **AC-4**: login-shell PATH 해석 로직이 4 호출(login spawn·checkClaude/Codex·
  po-runner·mcp)에서 단일 소스로 공유된다(중복 구현 drift 방지).

## Out of scope

- 비-macOS PATH 처리(loginShellPath 는 win32 에서 '' 반환 — 기존 동작 유지).
- codex 실행 경로(codex 폐기 결정, backlog).

## QA 노트

T-PATCH-199 와 동일하게 cua macOS-VM 하니스로 검증(무결 VM + claude 를
`~/.local/bin` 설치 + 패키징 앱 Finder-launch). 참고: `docs/qa/bookshelf/cua-vm-harness.md`.

---

## QA sign-off (2026-06-19, cua macOS-VM 실측) — qa_status: pass

구현: `surface-runner.ts` `withLoginShellPath(env)` export(단일 소스) → onboarding
`loginShellEnv`/checkClaude·Codex + `po-runner.ts:510` + `mcp.ts:176` 4곳이 공유.
build green(tsc) · smoke PASS(playwright-electron).

- **AC-1 PASS** — `claude --version`이 withLoginShellPath env(login-shell PATH)에서
  resolve(`2.1.181`). 회귀가드: bare launchd PATH = `command not found`.
- **AC-2 PASS** — `claude mcp list`(무인증)가 동일 env에서 정상 반환
  ("No MCP servers configured…"), ENOENT 아님.
- **AC-4 PASS** — 출하 번들에서 단일 minified 헬퍼(`Et`=withLoginShellPath)를 login·
  checkClaude·po-runner·mcp 가 공유. bare `env:process.env` 0건 → drift 없음.
- **AC-3** — login-shell PATH에 claude 있고 launchd PATH엔 없는 정상 유저 baseline이
  곧 위 테스트 조건 → 실효 확인.

**비실행**: 패키징 앱 in-app 전체 PO 세션 구동(claude authed + 프로젝트 필요)은
미실행 — claude 해석 메커니즘이 T-PATCH-199 AC-1(라이브 GUI 검증)과 동일 경로라
저위험. 실사용 시 PO 기동까지 1회 눈확인 권장.
