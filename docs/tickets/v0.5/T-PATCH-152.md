---
ticket_id: T-PATCH-152
version: v0.5
slug: doctrine-workstate-home-brief
title: doctrine — 활성 work-state home=brief 명시 + migrate shrink=expected·복원 금지 (state-hygiene Tier0)
type: doctrine
status: done
phase: 3
assignee: pdt-designer
requires_qa: true
qa_status: pass
requires_user_gate: false
area_tag: po-state-hygiene
risk_flags: [core-doctrine, tier0-edit, mirror-sync]
estimated_complexity: L2
created_at: 2026-06-16T00:00:00Z
started_at:
completed_at:
duration_min:
---

# T-PATCH-152: doctrine — work-state home = brief

doctrine 편집 = designer. PO가 반환 후 Tier0 mirror byte-identical 동기화.

## 배경

po-state는 pointer-only(canonical-14) 확정. 활성 task의 work-state를 po-state에 쓰면 migrate 훅이 정리 → 별도 PO가 오진·복원 → 루프(paepyeong 관측). 근본: PO가 work-state home(brief)을 안 쓰고 po-state에 freeform을 씀.

## Edit — state-hygiene.md (Tier 0 core)

위치: `packages/core/doctrine/persona/po/bookshelf/lifecycle/state-hygiene.md` (po-state v2 invariant 절 인근).

추가(additive/clarify):
- **활성 task work-state(progress / decisions / next / carry-forward / plan 노트)의 home은 `briefs/<slug>.md`** — po-state `current_task`에 freeform으로 쓰지 말 것(canonical-14만). (delegation.md §90 "no freeform scratchpad"와 정합, 재강조.)
- **session-start migrate가 current_task를 canonical로 줄이는 것은 EXPECTED + LOSSLESS** — work-state는 brief에 있음. 이 shrink를 "위생 오작동"으로 오진해 **`.bak`을 복원하지 말 것**(비표준 필드 재생산 → 다음 세션에서 재정리되는 루프). resume은 brief에서.
- turn-open 시 work-state 복구 경로 = brief read(+ ticket 보드), po-state 아님.

## Acceptance
- AC-1: state-hygiene.md에 위 3점 반영(additive, 기존 invariant와 모순 없음).
- AC-2: Tier0 변경분 ~/.productune mirror byte-identical(PO가 cp+diff).
- AC-3: 라인 cap(있으면) 위반 없음.

## Note
- designer는 SoT만 편집, ~/.productune mirror는 PO가. additive/clarify라 grill 비례(self-verify).
