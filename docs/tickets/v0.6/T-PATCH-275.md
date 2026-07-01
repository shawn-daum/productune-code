---
ticket_id: T-PATCH-275
version: v0.6
slug: revert-chatonly-full-layout-welcomepanel
title: chat-only 폐기 → 항상 전체 레이아웃 + 빈 상태 WelcomePanel 인트로(메인) + PRD 자동표시(#14 fix) (#18 정정)
type: impl
status: todo
phase: 3
assignee: pdt-developer
requires_qa: true
requires_user_gate: false
area_tag: gui
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-30T04:30:00Z
---

# T-PATCH-275 (#18 정정 + #14 fix): 항상 전체 레이아웃

PO 오독 정정. shawn 의도 = "전체 패널 보여주되 우측에서 PO랑 대화" — chat-only(ActivityBar/패널 숨김)가 아니라, **전체 shell 유지 + 빈 상태엔 MainPanel에 WelcomePanel 인트로**.

## Acceptance
- **AC-1**: chat-only collapse 폐기 — **항상 전체 4-region 레이아웃**(ActivityBar + Sidebar + MainPanel + 우측 PO채팅). dynamicGrid의 chatonly 분기 제거(또는 full로 고정).
- **AC-2**: current_version 없을 때 = **MainPanel에 WelcomePanel 복원**("오른쪽 PO와 대화하며 시작해요" + PRD/Design/Build/Deploy/Close pills). WelcomePanel.tsx 복원(#18에서 삭제됨 — git `a132b98:packages/gui/src/components/workspace/WelcomePanel.tsx`에서 복구 or 재작성) + welcome locale 키 복원.
- **AC-3 (#14 fix)**: PRD-ready(버전+PRD 존재) 시 **MainPanel에 PRD가 자동 표시**돼야 함(현재 PO가 PRD 보고했는데 메인 미표시). #14 auto-nav가 full 레이아웃에서 실제 동작하는지 디버그+수정(watcher/latch/prdPath resolve 점검).
- **AC-4 무회귀**: 버전 있을 때 기존 패널/탭 동작 보존. #15 watcher·#9/#10 presence 무손상.

## Out of scope
- phase 버튼 클릭→메인탭(별 티켓 T-276 #22).

## Plan
dev(WorkspaceShell/#11/#18 작성자): chatonly 분기 제거→full 고정 + WelcomePanel 복원(MainPanel 빈 상태) + #14 auto-open 디버그(왜 PRD 미표시인지: prdReady 신호/openTab/prdPath). `pnpm dev` 핫리로드 확인. QA: 빈 상태=full+WelcomePanel / PRD-ready=메인 자동표시 / 무회귀.

## Outcome
(pending)

## Persona Activity
(PO-managed)
