---
ticket_id: T-PATCH-259
version: v0.6
slug: v0-6-p2-gui-lifecycle-view-design
title: v0.6 P2 hi-fi — GUI lifecycle/worker-state→view 클러스터 + run-prompt (Branch C, S5)
type: design
status: done
phase: 2
assignee: pdt-designer
requires_qa: false
requires_user_gate: true
area_tag: gui
estimated_complexity: L3
risk_flags: []
created_at: 2026-06-25T00:30:00Z
---

# T-PATCH-259: v0.6 P2 design — GUI lifecycle→view cluster + run-prompt

PRD SoT = docs/prd/PRD.md v0.6 섹션 (14 items). P2 Branch C (small UI on existing DS, S5 hi-fi; skip system/DS steps). user_lang = ko. Per-step user gate (accept advances, refuse loops back via interview).

## Scope (P2 design 대상만 — 나머지 항목은 P3 직행)

**클러스터 — "lifecycle/worker-state → GUI view 반응" (공유 배선 위 한 묶음 설계):**
- **#9** presence row: active 워커(Designer/Developer/QA, PO 제외) 라이브 출력을 스프라이트 **우측에 streaming** (현재 빈 공간 활용 + 진행 가시성).
- **#10** 워커 스프라이트가 작업 중 **working 상태로 활성화** (현재 회색-idle 고착; cf. T-PATCH-252 PO판).
- **#11** **조건부 워크스페이스 레이아웃**: po-state에 current_version+PRD 생기기 전 = PO 채팅 단독 → 생긴 후 = 풀 패널 레이아웃 확장.
- **#14** PRD-ready/version-created 시 메인 패널이 **PRD 오토-노출 + 버전 자동 진입** (PO lifecycle → GUI 신호).

**독립 (경량):**
- **#3** 빌드 완료 → close gate 사이 **"앱 run + 눈확인 + 통합 시각 grill" prompt/배너** UX (권고하되 skippable).

## Acceptance (design altitude)
- 클러스터 4건의 hi-fi: (a) presence-row 워커 streaming 슬롯 레이아웃(우측, PO 제외, read-only), (b) 워커 스프라이트 working 상태 시각, (c) chat-only ↔ full-panel 전환 레이아웃 2-state, (d) PRD-ready 시 메인 패널 오토-네비 결과 화면 — 한 일관된 디자인으로.
- #3 run-prompt 배너 hi-fi (skippable 액션 명시).
- 기존 productune DS 준수 (docs/designer/design-system.md 확인 — dark IDE shell / CLI-purple 브랜드 계열). DS invariant 유지.
- 공유 precondition 2종(워커 subagent 상태/출력→GUI 파이프 · PO lifecycle→GUI 신호)을 design note에 P3 dev 핸드오프로 명시.
- per-step 게이트 통과 시 artifact archive.

## Plan
S5 hi-fi only (Branch C). 현 GUI(PersonaPresenceBar.tsx · WorkspaceShell · store/personaPresence.ts) 읽고 현 레이아웃 위에 설계. 단계별 user 게이트.

## Outcome
done — S5 hi-fi 목업 accepted (manifest approved). 5-scene: #11 chat-only↔full · #14 PRD 오토네비 · #9/#10 responsive 2-state(wide=inline우측/narrow=세로확장)+latest-active-1+PO제외 · #3 배너=기존 ▶Run 유도(신규러너 0). user gate=3 open-Q 답변으로 통과(반응형/최신1개/▶Run). dev handoff precondition 3종(워커 subagent 상태·출력→GUI pipe · po-state watcher+lifecycle→GUI 신호[#15] · ▶Run 재사용). 잔여 디자인리뷰: nudge-pulse 모션 §9.2 밖(focus-ring 대체 가능) → P3 design-review.

## Persona Activity
(PO-managed)
