---
ticket_id: T-PATCH-147
version: v0.5
slug: po-runner-bypass-perm-and-false-banner
title: po-runner — 기본 권한모드 bypassPermissions + 오탐 'permission-blocked' 30s 타이머 제거
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status:
requires_user_gate: false
area_tag: po-runner-permissions
risk_flags: [core-runtime, po-engine, security-permission-default]
estimated_complexity: L3
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-147: po-runner 권한모드 + 오탐 배너

대상 단일 파일: `packages/gui/electron/po-runner.ts`.

## 배경 (paepyeong smoke 관측)

1. spawn args에 권한 플래그가 없음 → headless `claude --print` 는 TTY가 없어, 허용 안 된 도구를 만나면 **세션이 실제로 abort** 됨(claude-code-guide 확인). 자율 PO 런타임이 도구 권한에서 막힘.
2. "권한 규칙으로 세션이 멈췄어요" 배너(i18n `...hint` ko.json:411)가 세션이 살아있는데도(도구 수 68→76 계속 증가) 발화 = **오탐**. 원인: `TOOL_USE_TIMEOUT_MS = 30_000` provisional 타이머가 Write/Edit/Bash 후 30s 내 tool_result 없으면 `permission-blocked` health 발화(po-runner.ts ~418-425). 긴 Bash/빌드·스트리밍 지연 시 안 막혔는데도 발화. (`permission-blocked`는 child를 죽이지 않는 non-blocking 배너이나 copy가 "멈췄다"로 오인 유발.)

## 사용자 결정

기본 권한모드 = **bypassPermissions** (= `--dangerously-skip-permissions`). 신뢰 로컬 런타임(본인 머신·본인 프로젝트), 전 모델(sonnet/opus/haiku 디스패치) 동작. rm -rf / 류 서킷브레이커만 유지.

## 변경 1 — spawn에 권한모드 박기

`spawnClaude` 의 args 빌드(현 ~447-458)에 권한모드 플래그 추가. 첫 호출·resume 양쪽 모두.

- `args.push('--permission-mode', 'bypassPermissions')` 를 `--agent` 푸시 구간에 추가(첫 호출/resume 공통 경로). (동치인 `--dangerously-skip-permissions` 대신 명시적 `--permission-mode bypassPermissions` 권장 — 의미 명확.)
- ⚠️ 프로젝트 `.claude/settings.json` 의 `permissions.defaultMode` 는 print 모드에서 **무시됨**(claude-code-guide 확인) → 반드시 **CLI 플래그**로 전달(이 변경이 정답 경로).
- 보안 주석 1줄: 신뢰 로컬 런타임 전제 + 사용자 결정(2026-06-16) 명시.

## 변경 2 — 오탐 provisional 'permission-blocked' 타이머 제거

bypassPermissions 하에선 권한 프롬프트가 발생할 수 없으므로, Write/Edit/Bash 30s 타이머가 emit하는 provisional `permission-blocked` 는 **항상 오탐** → 제거.

- `armToolUseTimeout`(Write/Edit/Bash arm) + 그 30s 콜백의 `emitHealth('permission-blocked', …)` 제거.
- `clearToolUseTimeout` 호출처(tool_result 시 clear, close/error 시 clear 등) 및 `TOOL_USE_TIMEOUT_MS`, 관련 ctx 필드 정리 — dangling 참조/미사용 변수 없게.
- **silence timeout(`armSilenceTimeout`)은 보존** — 일반 무출력 hang 감지는 별개 메커니즘, 건드리지 않음.
- stderr/text 기반 실제 permission 패턴 감지(~388-401, regex `permission|denied` + "I need permission")는 bypass 하에선 발화 케이스가 사라지므로 **제거 가능**(데드코드 정리). 단 제거 시 `permission-blocked` health state/타입(line 76 union)·관련 i18n 키 처리도 함께 정합 — 또는 state는 남기되 emit 경로만 제거(보수적). dev가 가장 깔끔한 쪽 택1하되 **오탐 배너가 다시는 안 뜨는 것**이 수용 기준.
- `permission-blocked` state를 완전 제거할 경우 ko.json/en.json `...hint` 키(411) 및 이를 읽는 SessionHealth 배너 컴포넌트의 분기도 정합(미사용 키/죽은 분기 남기지 말 것). state를 남기면 i18n 유지.

## Acceptance

- AC-1: spawn args(첫 호출+resume 모두)에 `--permission-mode bypassPermissions` 포함. `pnpm --filter @productune/gui build` PASS.
- AC-2: Write/Edit/Bash 후 30s 경과로 `permission-blocked` 가 emit되는 경로가 코드에서 제거됨(오탐 배너 원인 제거). silence timeout 경로는 유지.
- AC-3: `permission-blocked` state 처리 방식(완전제거 vs emit-경로만 제거)이 일관 — dangling 타입/미사용 i18n 키/죽은 UI 분기 없음(어느 쪽을 택하든 정합).
- AC-4: po-runner.ts 외 변경은 i18n/health-배너 컴포넌트 정합에 필요한 최소 범위로 한정(택1 결과에 따름). 그 외 파일 무변경.
- AC-5: 빌드 통과 + dev가 상태머신 논리 self-trace(타이머 제거가 healthy/done/error/rate-limit 등 다른 health 전이에 부작용 없음 확인).

## Note

- paepyeong 등 관리대상 프로젝트에서 효과 보려면 GUI 재빌드/재배포(=진행 중인 패키징) 후 적용.
- 즉시 우회(선택): `~/.claude/settings.json` 의 `permissions.defaultMode: "bypassPermissions"`는 print 모드에서도 적용됨(v2.1.142+) — 단 전역 영향이라 본 코드 변경이 정공법.
