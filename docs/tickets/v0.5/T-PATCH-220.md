---
ticket_id: T-PATCH-220
version: v0.5
slug: onboarding-require-engine-login
title: 온보딩 — 엔진(claude) 로그인 완료해야 진행 (Skip-without-login 제거)
type: design
status: todo
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
