---
ticket_id: T-PATCH-262
version: v0.6
slug: tray-reddot-awaiting-user-only
title: tray 빨간점 = PO가 유저에게 턴 넘긴 경우(awaiting-user)에만 (#7)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: app-chrome
estimated_complexity: L2
risk_flags: []
created_at: 2026-06-25T02:30:00Z
---

# T-PATCH-262 (#7): tray red-dot awaiting-user-only

## Request
메뉴막대 tray 아이콘 빨간점이 **항상** 떠 있음 → PO가 작업 완료해 유저에게 턴을 넘긴 상태(awaiting-user)에만 표시, idle/working엔 제거.

## Acceptance
- AC-1: tray badge(빨간점) = PO turn-state가 awaiting-user(턴 유저에게)일 때만 노출.
- AC-2: idle · PO working 중엔 빨간점 없음.
- AC-3: 상태 전이 시 즉시 반영(턴 넘김→on, 유저 입력/working→off). 무회귀(기존 tray idle/waiting 아이콘셋 활용; cf. T-PATCH-252 PO sprite state 패턴).

## Plan
dev: electron/tray.ts ↔ PO turn-state(po-runner streaming/awaiting 신호) 배선. badge on=awaiting-user only. QA: cua-vm 눈확인(턴 넘김 시 on, working/idle off).

## Outcome
Root cause: `trayBridge.computePayload()` computed `waiting = !streaming && allIdle`, which is `true` at app startup (initial state) as well as after a PO turn — so the red dot showed always.

Fix: introduced `awaitingUser: boolean` in the workspace store (default `false`). Set to `true` in `poEvents.ts` `onDone` handler (the only path that signifies PO finished and handed the turn to the user). Cleared to `false` on `setStreaming(true)` (user sends any message — ChatPanel, AskUserQuestionCard, PendingGateChip) and on `resetSession` / project switch. `trayBridge.computePayload()` now uses `awaitingUser` in place of `!streaming`.

`tray.ts` required no changes — it continues to receive the same `TrayStatePayload { waiting: boolean }` shape unchanged.

tsc clean (0 errors).

## Persona Activity
(PO-managed)
