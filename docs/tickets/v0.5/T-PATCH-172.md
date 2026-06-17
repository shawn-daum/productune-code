---
ticket_id: T-PATCH-172
version: v0.5
slug: ticket-board-live-refresh
title: 티켓 상태 변경이 보드에 즉시 반영 안 됨 (탭 갔다와야 갱신) — live refresh
type: code
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: ticket-board-refresh
risk_flags: []
estimated_complexity: L2
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-172: 티켓 보드 live refresh

## 증상 (user)
티켓을 보류(blocked) 처리했는데 보드는 여전히 진행중에 표시 → **다른 탭 갔다 오면** 그제서야 반영. 즉시 반영(live) 원함.

## 분석
티켓 보드(TicketDashboardView)가 ticket 스캔 결과를 마운트/탭-포커스 시에만 재조회 → ticket `.md` frontmatter status 변경(PO가 파일 수정)이 실시간 반영 안 됨. file watcher 부재 또는 보드가 watch 이벤트 미구독.

## Fix
- ticket `.md` 파일 변경 watch → 보드 자동 re-scan. po-state watcher(이미 있음 — config 변경 reload 선례)와 동일 패턴으로 `docs/tickets/<version>/*.md` 변경 시 `tickets:scan` 재호출 + store 갱신.
- 또는 status 쓰는 경로(PO mechanical write)가 renderer에 invalidation 이벤트 push.
- 코드 확인: useTicketScan / tickets:scan IPC 의 재조회 트리거(현재 마운트·탭전환만?) + file watcher 유무.

## Acceptance
- AC-1: 티켓 status 변경 시 보드가 **탭 전환 없이** 자동 갱신(컬럼 이동).
- AC-2: 과도한 re-scan 없게 debounce. build PASS.
