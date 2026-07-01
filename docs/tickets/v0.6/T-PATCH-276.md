---
ticket_id: T-PATCH-276
version: v0.6
slug: mainpanel-phase-buttons-open-prd
title: MainPanel 상단 phase 버튼(PRD/Design/…) 클릭 → 메인 탭에 해당 문서 표시 (#22)
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

# T-PATCH-276 (#22): MainPanel 상단 phase 버튼 → 메인 탭

shawn 요청(티켓 발행 명시). MainPanel 상단의 phase 버튼(PRD/Design/Build/Deploy/Close)을 **클릭 가능**하게 — 클릭 시 해당 phase 문서를 **메인 탭**에 연다.

## Acceptance
- **AC-1**: MainPanel 상단 phase 버튼 클릭 가능. **PRD 버튼 클릭 → PRD(docs/prd/PRD.md or versions/<v>.md)가 메인 탭에 markdown 뷰로 열림**(#14의 openTab 경로 재사용).
- **AC-2**: 나머지 phase(Design/Build/Deploy/Close)도 해당 산출물/뷰로 연결(있으면; 없으면 disabled/placeholder 명시). 최소 PRD는 동작.
- **AC-3**: 현재 phase 강조(active) 유지. 무회귀.

## Plan
dev: MainPanel top phase-bar 버튼에 onClick→openTab(해당 문서). PRD는 prdPath resolve(T-275/#14의 shared resolver 재사용). 나머지는 매핑 가능 범위. QA: PRD 버튼 클릭→메인탭 PRD 표시.

## Outcome
(pending)

## Persona Activity
(PO-managed)
