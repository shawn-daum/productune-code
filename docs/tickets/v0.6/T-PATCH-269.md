---
ticket_id: T-PATCH-269
version: v0.6
slug: postate-to-gui-reaction
title: cluster A — po-state→GUI 반응 (po-state watcher #15 + 조건부 레이아웃 #11 + PRD 오토네비 #14)
type: impl
status: done
phase: 3
assignee: pdt-developer
requires_qa: true
qa_status: pass
qa_loops: 1
requires_user_gate: false
area_tag: gui
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-25T03:10:00Z
---

# T-PATCH-269 (cluster A): po-state → GUI 반응

design SoT = T-PATCH-259 목업(scene 1/2) + dev_handoff_precondition (ii). PRD v0.6 #15/#11/#14.

## Acceptance
- **AC-#15 (watcher, backbone)**: GUI가 po-state.json 변경을 실시간 감지(file watcher) → 라이브 re-read. 현재 WorkspaceShell readPoState가 projectDir 변경 시 1회만 실행 → 세션 중 버전 생성/phase 전환/PRD-ready 미반영. watcher로 변경 시 자동 갱신.
- **AC-#11 (조건부 레이아웃)**: po-state에 current_version+PRD 없을 때 = PO 채팅 UI 단독, 생기면 = 풀 패널 레이아웃 확장(WorkspaceShell.dynamicGrid 2-state).
- **AC-#14 (PRD 오토네비)**: version-open/PRD-ready 이벤트 시 메인 패널 PRD 탭 오토오픈+포커스 + 버전 자동 진입. 수동 네비와 공존.
- AC-무회귀: 기존 패널/탭/수동 네비 동작 보존.

## Plan
dev plan-first(별도). watcher 메커니즘(fs.watch/chokidar?) + WorkspaceShell dynamicGrid 2-state + lifecycle event→openTab. QA: po-state 변경 시 GUI 라이브 갱신·레이아웃 전환·PRD 오토오픈 검증(일부 cua/hands-on).

## Outcome
done — dev plan-first(통합) → impl → QA GRILL+codereview(pass, must-fix 1 fix). #15 po-state watcher(parent-dir fs.watch, 200ms debounce, unchanged-signal no-op로 per-turn 렌더스톰 차단, teardown 배선) · #11 조건부 레이아웃(layoutMode=current_version 유무, full 6-area↔chat-only WelcomePanel, reversible) · #14 PRD 오토네비(version-transition edge-detect latch, 1회 발화, prdReady gate). **QA must-fix=워처 fd 누수**(rearm가 close 없이 push) → fix: 단일 poDirWatcher(배열/rearm 제거). **fix2=prdReady resolver 불일치**(main 3후보 vs renderer 2후보) → 공유 prdCandidatePaths(3후보)로 통합, 게이트=여는경로 일치. build green. 런타임 cua/hands-on flag(watcher 라이브·레이아웃 전환·PRD 오토오픈).

## Persona Activity
(PO-managed)
