---
ticket_id: T-PATCH-264
version: v0.6
slug: ime-cmd-enter-first-submit
title: 한글 IME 조합 중 첫 Cmd+Enter 전송 안 됨 (#12)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: po-chat
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-25T02:30:00Z
---

# T-PATCH-264 (#12): IME Cmd+Enter first-submit

## Request
한글(IME) 조합 중 첫 Cmd+Enter가 조합 확정에 먹혀 submit 안 됨 → 두 번 쳐야 전송. isComposing 가드는 FreshComposer:130·ChatPanel:197에 있으나 **Cmd+Enter submit 경로가 미커버**.

## Acceptance
- AC-1: 한글 조합 중 Cmd+Enter 한 번으로 전송(조합 확정 후 submit). keyCode 229/isComposing 처리를 submit 경로에 적용(cf. T-PATCH-196 패턴).
- AC-2: 영문/비조합 입력 무회귀. 조합 중 일반 Enter(줄바꿈 의도) 동작 보존.

## Plan
dev: 입력 composer(FreshComposer · ChatPanel)의 Cmd+Enter submit 핸들러에 isComposing/229 가드. compositionend 후 submit 처리. QA: 한글 조합 중 Cmd+Enter 1회 전송 확인 + 영문 무회귀.

## Outcome
ChatPanel.onKeyDown + FreshComposer.handleKeyDown: reordered so Cmd/Ctrl+Enter submit fires first (before any isComposing gate), then the isComposing guard covers only plain Enter / Backspace. keyCode 229 guard also added. Both files edited.

## Persona Activity
(PO-managed)
