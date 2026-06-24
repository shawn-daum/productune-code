---
ticket_id: T-PATCH-220
version: v0.5
slug: onboarding-require-engine-login
title: 온보딩 — 엔진(claude) 로그인 완료해야 진행 (Skip-without-login 제거)
type: design
status: done
qa_status: pass
phase: 3
assignee: pdt-designer
requires_qa: true
requires_user_gate: true
area_tag: onboarding
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-19T00:00:00Z
---

# T-PATCH-220: 온보딩 엔진 로그인 필수화

## Request

shawn 결정(2026-06-19): 온보딩 Step2에서 **claude 설치+로그인까지 완료해야 다음으로
넘어갈 수 있어야** 함. 현재는 "Connect later in Settings"로 엔진 미연결 상태로 통과
가능한데(T-PATCH-199 AC-6에서 dead-gray-Next 불안 해소 목적으로 의도적 허용), 엔진
없으면 PO가 아무것도 못 해 **비기능 상태로 진입**(echo/미실행). cua pristine 테스트에서
실제로 Skip→비기능 확인.

## 설계 결정 필요 (T-PATCH-199 AC-6 뒤집음)

- "Connect later" 제거 또는 명시적 비기능 경고로 강등.
- claude 미설치 → Install guide(설치 안내) 유지, 설치 후 로그인까지 완료 시에만 Next 활성.
- 로그인 완료 감지 = `checkClaude`(T-PATCH-218 PATH fix 적용본)로 `installed && authed`.
- 단, claude 설치가 사용자 외부 작업이므로 "설치 중 이탈→재진입" 흐름을 매끄럽게(Recheck).

## Acceptance

- **AC-1**: 미인증 상태에서 Step2 Next가 비활성(또는 진행 시 명확한 비기능 경고).
- **AC-2**: claude 설치+로그인(authed) 완료 시 Next 활성 → 온보딩 완료.
- **AC-3**: 설치 안내(Install guide)와 Recheck로 외부 설치 후 재감지가 매끄럽다.
- **AC-4**: dead-gray-Next + 모호한 Skip 조합(AC-6가 풀려던 문제)이 재발하지 않는다.

## Out of scope

- codex(폐기). 자동 설치/자동 로그인(사용자 외부 작업).

## QA 노트
cua VM: claude 미설치/미인증 → 진행 불가, 설치+로그인 → 진행 가능. 참고: `docs/qa/bookshelf/cua-vm-harness.md`.

## Close (2026-06-22)

designer opus plan(user-gated 승인) → dev sonnet impl → qa sonnet PASS(0 must-fix). T-199 AC-6 의도적 뒤집음 — "Connect later" 탈출구 제거 + **유저 승인 scope 확장: codex(폐기) 온보딩에서 제거**.
- AC-1: Step2 footer = 단일 Next, `disabled={!engineFullyReady || checkingEngine}` + btnPrimaryDisabled(opacity 0.35/not-allowed). skip 변종 0(grep skipLater/skipNote/Connect-later = 0 hits).
- AC-2: installed&&authed → engineFullyReady → Next 활성 → setStep(3) → completeOnboarding(engine:'claude') 정상.
- AC-3: EngineStatusRow Install guide+Recheck 유지 + OnboardingWizard focus-recheck 리스너(step===2 guard) — 외부 설치 후 복귀 재감지.
- AC-4: ★mute-grey 재발 불가 — disabled Next 옆 derived gate.{checking,needInstall,needLogin} 한 줄이 항상 다음 행동 명시. (T-199 AC-6의 진짜 교훈 = "비활성 컨트롤에 설명 0 금지"를 탈출구 없이 충족.)
- codex 제거: Step1 단일 비인터랙티브 claude 카드, Step2 codex props/row 제거, engineFullyReady가 codex 미참조. dangling 참조 0, completeOnboarding('claude') 정상. types.Engine union + preload codex stub은 무해 dead-code(잔여).
- build EXIT0(906 locale parity). **라이브 hands-on 잔여**: 실제 미설치→Next 비활성 / 설치+로그인→활성 전환 cua/VNC 확인(헤드리스 불가). 미커밋(commit-on-request).

### Follow-on backlog 후보 (별도 cleanup 티켓)
codex dead-code 정리: `preload.ts` checkCodex/codexLogin IPC stub, `onboarding.ts` codex 핸들러, `types.ts` Engine union, `styles.ts` btnSkip orphan, OnboardingWizard onSelectEngine dead-wire. (이번 AC 범위 밖, 무해.)

## Deploy live-verify (2026-06-23, cua-VM clean-install + VNC) — ★ 라이브 hands-on 완료, 전체 PASS

fresh arm64 dmg(asar sha 호스트=VM 일치)로 cua-VM 설치 후 검증:
- **AC-1 ✅**: claude 미인증 상태 Step2 Next 비활성. needLogin(installed·not authed → Connect/Recheck + "Sign in with Start login above") + needInstall(바이너리 숨김→ ❌not installed + `npm install -g @anthropic-ai/claude-code` + Install guide↗ + "Install Claude Code first") 양 분기 모두 확인.
- **AC-2 ✅**: claude 설치+로그인(wizard Connect→실 OAuth, VNC 완료)→ ✓installed·authed → Next 활성 → Step3 "Setup complete"(env·PO agent·instructions·memory·Playwright MCP 5/5 ✓) → Get started → HomeView 진입.
- **AC-3 ✅**: Recheck(needLogin) + Step2 재진입 + focus-recheck 동적 재감지 동작. Install guide 노출 확인.
- **AC-4 ✅**: codex 카드/props 0(Step1 단일 claude). Skip/Connect-later 탈출구 0. disabled Next 옆 derived-gate 1줄 항상 다음행동 명시.
- 부수확인: `checkClaude`의 "installed"는 PATH-augmented spawn으로 `~/.local/bin/claude` 정확 감지(셸 `which claude` 실패는 T-218 PATH 이슈, 오판 아님).
