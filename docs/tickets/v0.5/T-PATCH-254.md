---
ticket_id: T-PATCH-254
version: v0.5
slug: quitguard-toast-app-level
title: Cmd+Q quit-guard 안내 토스트를 모든 화면에 — 현재 WorkspaceShell에만 마운트(시작화면·온보딩 미노출)
type: impl
status: done
phase: 4
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: app-chrome
estimated_complexity: L1
risk_flags: []
created_at: 2026-06-24T00:00:00Z
---

# T-PATCH-254: quit-guard toast app-level

## Request

shawn(2026-06-24, 5차 dmg 라이브): 시작화면(HomeView)에서 Cmd+Q 안내가 안 뜸. 더블-Cmd+Q면
꺼지긴 하는데(quit-guard 동작) 안내가 없어 헷갈림. 시작화면에도 안내 필요.

## 진단 (PO)

quit-guard 더블탭 로직은 `electron/main.ts`(전역 accelerator + 1.5s guard window)라 **모든
화면에서 동작**. 그러나 안내 UI `QuitGuardToast`는 `src/views/WorkspaceShell.tsx:412`에만
마운트 → HomeView·온보딩 화면엔 토스트가 없음. (컴포넌트 주석: "one instance mounted in
WorkspaceShell".)

## Acceptance
- **AC-1**: 첫 Cmd+Q 시 quit-guard 안내 토스트가 **모든 화면**(시작화면/HomeView · 온보딩 wizard ·
  워크스페이스)에서 뜬다.
- **AC-2**: **이중 마운트 금지** — QuitGuardToast 인스턴스는 정확히 1개(App 최상위로 이동, 화면
  스위치 sibling). WorkspaceShell의 기존 마운트는 제거(또는 App-level 단일화). 워크스페이스에서
  토스트 2개 뜨면 안 됨.
- **AC-3**: 기존 동작 무회귀 — 더블탭 종료·progress bar shrink·자동 dismiss·mac/win 카피 그대로.
  guard IPC 이벤트 구독이 App-level 단일 인스턴스에서 정상 수신.

## Out of scope
- quit-guard 타이밍/카피 변경. 트레이 quit 경로(별도).

## Plan
dev: `QuitGuardToast`를 `App.tsx` 최상위(onboarding/HomeView/WorkspaceShell 스위치 바깥)로 1개
마운트, `WorkspaceShell.tsx:412`에서 제거. build green. QA: 세 화면 전부에서 첫 Cmd+Q에 토스트 +
워크스페이스 단일 토스트(이중 아님) 확인.

## Outcome
shipped — `QuitGuardToast`를 `App.tsx:321`(화면 스위치 sibling, position:fixed)에 단일 마운트, `WorkspaceShell`에서 제거. 첫 Cmd+Q 안내가 HomeView·온보딩·워크스페이스 전부 표시, 워크스페이스 단일 토스트(이중 아님). 컴포넌트 자체 무변경(IPC self-subscribe). docstring 정정. dev impl → QA pass(loop1, 0 must-fix). **6차 dmg 필요**(5차엔 미포함).

## Persona Activity
| persona | role | model | result |
|---|---|---|---|
| pdt-developer | impl (App-level mount) | sonnet | done |
| pdt-qa | grill | sonnet | qa_status: pass (single-instance 확인) |
